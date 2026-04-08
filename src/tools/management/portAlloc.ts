/**
 * port_alloc 工具 - 自动分配端口（9222-9299）
 * 使用互斥锁、原子写入和租约机制防止竞态条件
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

interface PortAllocParams {
  count?: number;
}

interface PortAllocResult {
  ports: number[];
  leaseTokens: Record<number, string>;
}

interface PortInfo {
  port: number;
  allocated: boolean;
  allocatedAt?: number;
  chromeId?: string;
  agentId?: string;
  leaseToken?: string;
  lastHeartbeat?: number;
}

const PORT_REGISTRY_FILE = join(
  process.env.HOME || '/tmp',
  '.cache',
  'web-agent',
  'ports.json'
);

const PORT_REGISTRY_BACKUP = `${PORT_REGISTRY_FILE}.backup`;

/**
 * 检查端口是否可用（快速超时）
 */
async function checkPort(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      method: 'GET',
      signal: AbortSignal.timeout(500), // 降低超时减少阻塞
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 读取端口注册表（带备份恢复和迁移）
 * 读取失败时尝试从备份恢复，仍失败则抛出错误
 * 自动迁移旧版本记录（无 leaseToken）
 */
function readRegistry(): Record<string, PortInfo> {
  const dir = dirname(PORT_REGISTRY_FILE);
  mkdirSync(dir, { recursive: true });

  if (!existsSync(PORT_REGISTRY_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(PORT_REGISTRY_FILE, 'utf-8');
    let registry = JSON.parse(content);

    // 验证基本形状
    if (typeof registry !== 'object' || registry === null) {
      throw new Error('注册表格式无效');
    }

    // 迁移：为旧版本记录（无 leaseToken）回填 token
    let migrated = false;
    for (const info of Object.values(registry)) {
      const portInfo = info as PortInfo;
      if (portInfo.allocated && !portInfo.leaseToken) {
        portInfo.leaseToken = randomUUID();
        migrated = true;
      }
    }

    if (migrated) {
      // 保存迁移后的注册表
      const backupFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;
      writeFileSync(backupFile, JSON.stringify(registry, null, 2), 'utf-8');
      renameSync(backupFile, PORT_REGISTRY_FILE);
      try {
        writeFileSync(PORT_REGISTRY_BACKUP, JSON.stringify(registry, null, 2), 'utf-8');
      } catch {}
    }

    return registry as Record<string, PortInfo>;
  } catch (err) {
    // 尝试从备份恢复
    try {
      if (existsSync(PORT_REGISTRY_BACKUP)) {
        const backupContent = readFileSync(PORT_REGISTRY_BACKUP, 'utf-8');
        const backupRegistry = JSON.parse(backupContent);
        if (typeof backupRegistry === 'object' && backupRegistry !== null) {
          // 恢复备份
          cpSync(PORT_REGISTRY_BACKUP, PORT_REGISTRY_FILE);
          return backupRegistry as Record<string, PortInfo>;
        }
      }
    } catch {}

    // 备份恢复也失败，抛出错误
    throw new Error(`注册表读取失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 原子写入注册表（使用临时文件 + rename 确保原子性）
 * 同时写入备份文件
 * 失败时抛出错误
 */
function writeRegistryAtomic(registry: Record<string, PortInfo>, tempFile: string): void {
  const data = JSON.stringify(registry, null, 2);

  // 写入主文件
  writeFileSync(tempFile, data, 'utf-8');
  renameSync(tempFile, PORT_REGISTRY_FILE);

  // 同时写入备份
  try {
    writeFileSync(PORT_REGISTRY_BACKUP, data, 'utf-8');
  } catch {
    // 备份失败不影响主操作
  }
}

/**
 * 互斥锁实现 - 正确的序列化处理
 */
class Mutex {
  private lock: Promise<void> = Promise.resolve();

  async acquire<T>(fn: () => Promise<T> | T): Promise<T> {
    // 捕获当前锁，在释放前创建新锁
    const prevLock = this.lock;
    let release: () => void;
    this.lock = new Promise(resolve => {
      release = resolve;
    });

    // 等待前一个锁释放
    await prevLock;

    try {
      return await fn();
    } finally {
      release!();
    }
  }
}

const registryMutex = new Mutex();

/**
 * 在锁下执行清理和分配
 * 所有状态检查和写入都在同一锁持有期间完成，避免竞态
 */
async function performAllocation(
  registry: Record<string, PortInfo>,
  count: number
): Promise<{
  registry: Record<string, PortInfo>;
  allocatedPorts: number[];
  leaseTokens: Record<number, string>;
}> {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 30000;
  const allocatedPorts: number[] = [];
  const leaseTokens: Record<number, string> = {};

  // 步骤 1: 清理过期端口（在锁下实时检查）
  for (const [portKey, info] of Object.entries(registry)) {
    const port = parseInt(portKey, 10);
    if (!info.lastHeartbeat || now - info.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      // 端口已过期，实时检查是否真的被占用
      const isOccupied = await checkPort(port);
      if (isOccupied) {
        // 端口仍被占用，保留并刷新心跳
        registry[portKey] = {
          ...info,
          lastHeartbeat: now,
        };
      } else {
        // 端口未被占用，删除
        delete registry[portKey];
      }
    }
  }

  // 步骤 2: 分配新端口
  for (let port = CDP_PROXY.PORT_RANGE_START; port <= CDP_PROXY.PORT_RANGE_END && allocatedPorts.length < count; port++) {
    const portKey = port.toString();
    const portInfo = registry[portKey];

    // 检查端口是否已分配
    if (portInfo?.allocated) {
      continue; // 已有分配的端口，跳过
    }

    // 实时检查端口是否被占用
    const isOccupied = await checkPort(port);
    if (!isOccupied) {
      const leaseToken = randomUUID();
      allocatedPorts.push(port);
      leaseTokens[port] = leaseToken;
      registry[portKey] = {
        port,
        allocated: true,
        allocatedAt: Date.now(),
        leaseToken,
        lastHeartbeat: Date.now(),
      };
    }
  }

  return { registry, allocatedPorts, leaseTokens };
}

export async function portAlloc(params: PortAllocParams = {}): Promise<ToolResult<PortAllocResult>> {
  const { count = 1 } = params;

  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;
  let allocatedPorts: number[] = [];
  let leaseTokens: Record<number, string> = {};

  try {
    await registryMutex.acquire(async () => {
      const registry = readRegistry();
      const result = await performAllocation(registry, count);
      allocatedPorts = result.allocatedPorts;
      leaseTokens = result.leaseTokens;
      writeRegistryAtomic(result.registry, tempFile);
    });
  } catch (err) {
    // 清理临时文件
    try {
      unlinkSync(tempFile);
    } catch {}

    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`端口分配失败：${message}`)
    );
  }

  if (allocatedPorts.length === 0) {
    return error(
      networkError('无法分配可用端口，请检查是否有 Chrome 实例正在运行')
    );
  }

  return success(
    {
      ports: allocatedPorts,
      leaseTokens,
    },
    `已分配 ${allocatedPorts.length} 个端口：${allocatedPorts.join(', ')}（leaseToken 已返回，请妥善保管用于释放和心跳）`
  );
}

/**
 * 释放端口（强制验证 leaseToken）
 * 支持旧版本记录自动迁移
 */
export async function portRelease(params: { port: number; leaseToken?: string }): Promise<ToolResult<{ port: number; released: boolean }>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  let released = false;
  let notFound = false;
  let tokenMismatch = false;

  try {
    await registryMutex.acquire(async () => {
      const registry = readRegistry();
      const portKey = port.toString();

      if (!registry[portKey]) {
        notFound = true;
        return;
      }

      const portInfo = registry[portKey];

      // 迁移：如果记录没有 leaseToken，自动生成并保存
      if (portInfo.allocated && !portInfo.leaseToken) {
        const newToken = randomUUID();
        registry[portKey] = {
          ...portInfo,
          leaseToken: newToken,
        };
        writeRegistryAtomic(registry, tempFile);
        // 对于迁移的记录，接受首次请求（无 token 或任意 token）
        // 但 subsequent 请求必须提供正确的 token
        // 为简化，这里直接释放
        delete registry[portKey];
        released = true;
        return;
      }

      // 强制验证 lease token
      if (leaseToken && portInfo.leaseToken && portInfo.leaseToken !== leaseToken) {
        tokenMismatch = true;
        return;
      }

      // 如果没有提供 leaseToken 且记录有 token，拒绝（防止未授权释放）
      if (!leaseToken && portInfo.leaseToken) {
        tokenMismatch = true;
        return;
      }

      delete registry[portKey];
      released = true;

      // 原子写入注册表
      writeRegistryAtomic(registry, tempFile);
    });
  } catch (err) {
    // 清理临时文件
    try {
      unlinkSync(tempFile);
    } catch {}

    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`端口释放失败：${message}`)
    );
  }

  if (notFound) {
    return success(
      { port, released: false },
      `端口 ${port} 未在注册表中找到`
    );
  }

  if (tokenMismatch) {
    return error(
      networkError(`leaseToken 不匹配，拒绝释放端口 ${port}`)
    );
  }

  return success(
    { port, released },
    `已释放端口 ${port}`
  );
}

/**
 * 更新端口心跳（强制验证 leaseToken）
 * 支持旧版本记录自动迁移
 */
export async function portHeartbeat(params: { port: number; leaseToken?: string }): Promise<ToolResult<{ port: number; ok: boolean }>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  let ok = false;
  let notFound = false;
  let tokenMismatch = false;

  try {
    await registryMutex.acquire(async () => {
      const registry = readRegistry();
      const portKey = port.toString();

      if (!registry[portKey]) {
        notFound = true;
        return;
      }

      const portInfo = registry[portKey];

      // 迁移：如果记录没有 leaseToken，自动生成并保存
      if (portInfo.allocated && !portInfo.leaseToken) {
        const newToken = randomUUID();
        registry[portKey] = {
          ...portInfo,
          leaseToken: newToken,
          lastHeartbeat: Date.now(),
        };
        writeRegistryAtomic(registry, tempFile);
        // 对于迁移的记录，接受首次心跳请求
        ok = true;
        return;
      }

      // 强制验证 lease token
      if (leaseToken && portInfo.leaseToken && portInfo.leaseToken !== leaseToken) {
        tokenMismatch = true;
        return;
      }

      // 如果没有提供 leaseToken 且记录有 token，拒绝
      if (!leaseToken && portInfo.leaseToken) {
        tokenMismatch = true;
        return;
      }

      registry[portKey].lastHeartbeat = Date.now();
      ok = true;

      // 原子写入注册表
      writeRegistryAtomic(registry, tempFile);
    });
  } catch (err) {
    // 清理临时文件
    try {
      unlinkSync(tempFile);
    } catch {}

    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`端口心跳更新失败：${message}`)
    );
  }

  if (notFound) {
    return error(
      networkError(`端口 ${port} 未在注册表中找到`)
    );
  }

  if (tokenMismatch) {
    return error(
      networkError(`leaseToken 不匹配，拒绝更新端口 ${port} 的心跳`)
    );
  }

  return success(
    { port, ok },
    `已更新端口 ${port} 的心跳`
  );
}

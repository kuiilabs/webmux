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
 * 读取端口注册表（带备份恢复）
 * 读取失败时尝试从备份恢复，仍失败则抛出错误
 */
function readRegistry(): Record<string, PortInfo> {
  const dir = dirname(PORT_REGISTRY_FILE);
  mkdirSync(dir, { recursive: true });

  if (!existsSync(PORT_REGISTRY_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(PORT_REGISTRY_FILE, 'utf-8');
    const registry = JSON.parse(content);

    // 验证基本形状
    if (typeof registry !== 'object' || registry === null) {
      throw new Error('注册表格式无效');
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
 * 检测端口状态（在锁外执行）
 */
async function probePortStatus(registry: Record<string, PortInfo>): Promise<{
  staleOccupied: string[];
  staleFree: string[];
  freePorts: number[];
}> {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 30000;

  const staleOccupied: string[] = [];
  const staleFree: string[] = [];
  const freePorts: number[] = [];

  // 检查过期端口
  for (const [portKey, info] of Object.entries(registry)) {
    const port = parseInt(portKey, 10);
    if (!info.lastHeartbeat || now - info.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      const isOccupied = await checkPort(port);
      if (isOccupied) {
        staleOccupied.push(portKey);
      } else {
        staleFree.push(portKey);
      }
    }
  }

  // 扫描可用端口（在锁外进行，减少阻塞）
  for (let port = CDP_PROXY.PORT_RANGE_START; port <= CDP_PROXY.PORT_RANGE_END; port++) {
    const portKey = port.toString();
    const portInfo = registry[portKey];
    if (!portInfo || !portInfo.allocated) {
      const isOccupied = await checkPort(port);
      if (!isOccupied) {
        freePorts.push(port);
      }
    }
  }

  return { staleOccupied, staleFree, freePorts };
}

export async function portAlloc(params: PortAllocParams = {}): Promise<ToolResult<PortAllocResult>> {
  const { count = 1 } = params;

  const allocatedPorts: number[] = [];
  const leaseTokens: Record<number, string> = {};
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  try {
    // 步骤 1: 在锁外探测端口状态（减少锁持有时间）
    let registry = await registryMutex.acquire(() => readRegistry());
    let probeResult = await probePortStatus(registry);

    // 步骤 2: 获取锁，执行原子更新
    await registryMutex.acquire(async () => {
      // 重新读取最新状态
      registry = readRegistry();

      // 更新过期但仍占用的端口心跳
      for (const portKey of probeResult.staleOccupied) {
        if (registry[portKey]) {
          registry[portKey] = {
            ...registry[portKey],
            lastHeartbeat: Date.now(),
          };
        }
      }

      // 删除过期且空闲的端口
      for (const portKey of probeResult.staleFree) {
        delete registry[portKey];
      }

      // 分配端口
      for (const port of probeResult.freePorts) {
        if (allocatedPorts.length >= count) break;

        const portKey = port.toString();
        // 双重检查端口未被其他调用者分配
        if (registry[portKey]?.allocated) {
          continue;
        }

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
 */
export async function portRelease(params: { port: number; leaseToken: string }): Promise<ToolResult<{ port: number; released: boolean }>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  if (!leaseToken) {
    return error(
      networkError('缺少必要参数：leaseToken')
    );
  }

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

      // 强制验证 lease token
      if (registry[portKey].leaseToken !== leaseToken) {
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
 */
export async function portHeartbeat(params: { port: number; leaseToken: string }): Promise<ToolResult<{ port: number; ok: boolean }>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  if (!leaseToken) {
    return error(
      networkError('缺少必要参数：leaseToken')
    );
  }

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

      // 强制验证 lease token
      if (registry[portKey].leaseToken !== leaseToken) {
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

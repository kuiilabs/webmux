/**
 * port_alloc 工具 - 自动分配端口（9222-9299）
 * 使用互斥锁和原子写入防止竞态条件
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

interface PortAllocParams {
  count?: number;
}

interface PortAllocResult {
  ports: number[];
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

/**
 * 检查端口是否可用
 */
async function checkPort(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      method: 'GET',
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 读取端口注册表
 */
function readRegistry(): Record<string, PortInfo> {
  try {
    const dir = dirname(PORT_REGISTRY_FILE);
    mkdirSync(dir, { recursive: true });

    if (!existsSync(PORT_REGISTRY_FILE)) {
      return {};
    }

    const content = readFileSync(PORT_REGISTRY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    // 读取失败时返回空注册表，不抛出错误
    return {};
  }
}

/**
 * 原子写入注册表（使用临时文件 + rename 确保原子性）
 * 失败时抛出错误
 */
function writeRegistryAtomic(registry: Record<string, PortInfo>, tempFile: string): void {
  writeFileSync(tempFile, JSON.stringify(registry, null, 2), 'utf-8');
  renameSync(tempFile, PORT_REGISTRY_FILE);
}

/**
 * 互斥锁实现 - 正确的序列化处理
 */
class Mutex {
  private lock: Promise<void> = Promise.resolve();

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
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
 * 清理过期端口（心跳超时）- 返回全新对象
 */
async function cleanupStalePorts(registry: Record<string, PortInfo>): Promise<Record<string, PortInfo>> {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 30000; // 30 秒

  const cleaned: Record<string, PortInfo> = {};
  for (const [portKey, info] of Object.entries(registry)) {
    const port = parseInt(portKey, 10);
    if (!info.lastHeartbeat || now - info.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      // 端口已过期，检查是否真的被占用
      const isOccupied = await checkPort(port);
      if (isOccupied) {
        // 端口仍被占用，保留并刷新心跳
        cleaned[portKey] = { ...info, lastHeartbeat: now };
      }
      // 否则不保留（端口未被占用，从 cleaned 中排除）
    } else {
      cleaned[portKey] = info;
    }
  }
  return cleaned;
}

export async function portAlloc(params: PortAllocParams = {}): Promise<ToolResult<PortAllocResult>> {
  const { count = 1 } = params;

  const allocatedPorts: number[] = [];
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  try {
    await registryMutex.acquire(async () => {
      let registry = readRegistry();

      // 先清理过期端口
      registry = await cleanupStalePorts(registry);

      // 扫描可用端口
      for (let port = CDP_PROXY.PORT_RANGE_START; port <= CDP_PROXY.PORT_RANGE_END && allocatedPorts.length < count; port++) {
        const portKey = port.toString();
        const portInfo = registry[portKey];

        // 检查端口是否已分配且仍在用
        if (portInfo?.allocated) {
          // 已有分配的端口，跳过（不允许重新分配）
          continue;
        }

        // 尝试分配
        const isOccupied = await checkPort(port);
        if (!isOccupied) {
          allocatedPorts.push(port);
          registry[portKey] = {
            port,
            allocated: true,
            allocatedAt: Date.now(),
            leaseToken: randomUUID(),
            lastHeartbeat: Date.now(),
          };
        }
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
    },
    `已分配 ${allocatedPorts.length} 个端口：${allocatedPorts.join(', ')}`
  );
}

/**
 * 释放端口
 */
export async function portRelease(params: { port: number; leaseToken?: string }): Promise<ToolResult<{ port: number; released: boolean }>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  let released = false;
  let notFound = false;

  try {
    await registryMutex.acquire(async () => {
      const registry = readRegistry();
      const portKey = port.toString();

      if (!registry[portKey]) {
        notFound = true;
        return;
      }

      // 验证 lease token（如果提供）
      if (leaseToken && registry[portKey].leaseToken && registry[portKey].leaseToken !== leaseToken) {
        released = false;
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

  if (!released) {
    return success(
      { port, released: false },
      ` leaseToken 不匹配，拒绝释放端口 ${port}`
    );
  }

  return success(
    { port, released },
    `已释放端口 ${port}`
  );
}

/**
 * 更新端口心跳
 */
export async function portHeartbeat(params: { port: number; leaseToken?: string }): Promise<ToolResult<{ port: number; ok: boolean }>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  let ok = false;
  let notFound = false;

  try {
    await registryMutex.acquire(async () => {
      const registry = readRegistry();
      const portKey = port.toString();

      if (!registry[portKey]) {
        notFound = true;
        return;
      }

      // 验证 lease token（如果提供）
      if (leaseToken && registry[portKey].leaseToken && registry[portKey].leaseToken !== leaseToken) {
        ok = false;
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
    return success(
      { port, ok: false },
      `端口 ${port} 未在注册表中找到`
    );
  }

  if (!ok) {
    return success(
      { port, ok: false },
      `leaseToken 不匹配，拒绝更新端口 ${port} 的心跳`
    );
  }

  return success(
    { port, ok },
    `已更新端口 ${port} 的心跳`
  );
}

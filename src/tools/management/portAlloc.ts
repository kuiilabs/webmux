/**
 * port_alloc 工具 - 自动分配端口（9222-9299）
 * 使用临时文件 + 原子写入防止竞态条件
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, readdirSync } from 'fs';
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
  } catch {
    return {};
  }
}

/**
 * 原子写入注册表（使用临时文件 + rename 确保原子性）
 */
function writeRegistryAtomic(registry: Record<string, PortInfo>): boolean {
  try {
    const dir = dirname(PORT_REGISTRY_FILE);
    mkdirSync(dir, { recursive: true });

    const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;
    writeFileSync(tempFile, JSON.stringify(registry, null, 2), 'utf-8');
    renameSync(tempFile, PORT_REGISTRY_FILE);
    return true;
  } catch (err) {
    // 清理临时文件
    try {
      const dir = dirname(PORT_REGISTRY_FILE);
      const files = readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.tmp')) {
          try {
            unlinkSync(join(dir, f));
          } catch {}
        }
      }
    } catch {}
    return false;
  }
}

/**
 * 带锁的注册表操作（使用文件锁模拟）
 */
let registryLock: Promise<void> = Promise.resolve();

/**
 * 互斥执行注册表操作
 */
async function withRegistryLock<T>(fn: (registry: Record<string, PortInfo>) => Promise<T>): Promise<T> {
  // 等待之前的锁释放
  await registryLock;

  // 创建新的锁
  let releaseLock: () => void;
  registryLock = new Promise(resolve => {
    releaseLock = resolve;
  });

  try {
    const registry = readRegistry();
    const result = await fn(registry);
    writeRegistryAtomic(registry);
    return result;
  } finally {
    releaseLock!();
  }
}

/**
 * 清理过期端口（心跳超时）- 异步版本
 */
async function cleanupStalePortsSync(registry: Record<string, PortInfo>): Promise<Record<string, PortInfo>> {
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
      // 否则不保留（端口未被占用）
    } else {
      cleaned[portKey] = info;
    }
  }
  return cleaned;
}

export async function portAlloc(params: PortAllocParams = {}): Promise<ToolResult<PortAllocResult>> {
  const { count = 1 } = params;

  const allocatedPorts: number[] = [];

  // 使用锁确保并发安全
  await withRegistryLock(async (registry) => {
    // 先清理过期端口
    const cleanedRegistry = await cleanupStalePortsSync(registry);

    // 扫描可用端口
    for (let port = CDP_PROXY.PORT_RANGE_START; port <= CDP_PROXY.PORT_RANGE_END && allocatedPorts.length < count; port++) {
      const portKey = port.toString();
      const portInfo = cleanedRegistry[portKey];

      // 检查端口是否已分配且仍在用
      if (portInfo?.allocated) {
        const isOccupied = await checkPort(port);
        if (isOccupied) {
          continue; // 端口仍被占用
        }
        // 端口未被占用，释放
        delete cleanedRegistry[portKey];
      }

      // 尝试分配
      const isOccupied = await checkPort(port);
      if (!isOccupied) {
        allocatedPorts.push(port);
        cleanedRegistry[portKey] = {
          port,
          allocated: true,
          allocatedAt: Date.now(),
          lastHeartbeat: Date.now(),
        };
      }
    }

    // 更新 registry 引用
    Object.assign(registry, cleanedRegistry);
  });

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
export async function portRelease(params: { port: number }): Promise<ToolResult<{ port: number; released: boolean }>> {
  const { port } = params;

  let released = false;
  await withRegistryLock(async (registry) => {
    const portKey = port.toString();
    if (registry[portKey]) {
      delete registry[portKey];
      released = true;
    }
  });

  return success(
    { port, released },
    released ? `已释放端口 ${port}` : `端口 ${port} 未在注册表中找到`
  );
}

/**
 * 更新端口心跳
 */
export async function portHeartbeat(params: { port: number }): Promise<ToolResult<{ port: number; ok: boolean }>> {
  const { port } = params;

  let ok = false;
  await withRegistryLock(async (registry) => {
    const portKey = port.toString();
    if (registry[portKey]) {
      registry[portKey].lastHeartbeat = Date.now();
      ok = true;
    }
  });

  return success(
    { port, ok },
    ok ? `已更新端口 ${port} 的心跳` : `端口 ${port} 未在注册表中找到`
  );
}

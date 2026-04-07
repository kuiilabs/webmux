/**
 * port_alloc 工具 - 自动分配端口（9222-9299）
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface PortAllocParams {
  count?: number;
}

interface PortAllocResult {
  ports: number[];
  registry: Record<string, PortInfo>;
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
    const dir = PORT_REGISTRY_FILE.substring(0, PORT_REGISTRY_FILE.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });

    const content = readFileSync(PORT_REGISTRY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * 写入端口注册表
 */
function writeRegistry(registry: Record<string, PortInfo>): void {
  try {
    writeFileSync(PORT_REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  } catch {
    // 忽略写入错误
  }
}

/**
 * 清理过期端口（心跳超时）
 */
function cleanupStalePorts(registry: Record<string, PortInfo>): Record<string, PortInfo> {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 30000; // 30 秒

  const cleaned: Record<string, PortInfo> = {};
  for (const [portKey, info] of Object.entries(registry)) {
    const port = parseInt(portKey, 10);
    if (!info.lastHeartbeat || now - info.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      // 端口已过期，检查是否真的被占用
      checkPort(port).then(isOccupied => {
        if (!isOccupied) {
          delete registry[port];
          writeRegistry(registry);
        }
      });
    } else {
      cleaned[portKey] = info;
    }
  }
  return cleaned;
}

export async function portAlloc(params: PortAllocParams = {}): Promise<ToolResult<PortAllocResult>> {
  const { count = 1 } = params;

  const allocatedPorts: number[] = [];
  let registry = readRegistry();
  registry = cleanupStalePorts(registry);

  // 扫描可用端口
  for (let port = CDP_PROXY.PORT_RANGE_START; port <= CDP_PROXY.PORT_RANGE_END && allocatedPorts.length < count; port++) {
    const portKey = port.toString();
    const portInfo = registry[portKey];

    // 检查端口是否已分配且仍在用
    if (portInfo?.allocated) {
      const isOccupied = await checkPort(port);
      if (isOccupied) {
        continue; // 端口仍被占用
      }
      // 端口未被占用，释放
      delete registry[portKey];
    }

    // 尝试分配
    const isOccupied = await checkPort(port);
    if (!isOccupied) {
      allocatedPorts.push(port);
      registry[portKey] = {
        port,
        allocated: true,
        allocatedAt: Date.now(),
        lastHeartbeat: Date.now(),
      };
    }
  }

  writeRegistry(registry);

  if (allocatedPorts.length === 0) {
    return error(
      networkError('无法分配可用端口，请检查是否有 Chrome 实例正在运行')
    );
  }

  return success(
    {
      ports: allocatedPorts,
      registry: registry,
    },
    `已分配 ${allocatedPorts.length} 个端口：${allocatedPorts.join(', ')}`
  );
}

/**
 * 释放端口
 */
export async function portRelease(params: { port: number }): Promise<ToolResult<{ port: number; released: boolean }>> {
  const { port } = params;
  const registry = readRegistry();
  const portKey = port.toString();

  if (registry[portKey]) {
    delete registry[portKey];
    writeRegistry(registry);
    return success(
      { port, released: true },
      `已释放端口 ${port}`
    );
  }

  return success(
    { port, released: false },
    `端口 ${port} 未在注册表中找到`
  );
}

/**
 * 更新端口心跳
 */
export async function portHeartbeat(params: { port: number }): Promise<ToolResult<{ port: number; ok: boolean }>> {
  const { port } = params;
  const registry = readRegistry();
  const portKey = port.toString();

  if (registry[portKey]) {
    registry[portKey].lastHeartbeat = Date.now();
    writeRegistry(registry);
    return success(
      { port, ok: true },
      `已更新端口 ${port} 的心跳`
    );
  }

  return success(
    { port, ok: false },
    `端口 ${port} 未在注册表中找到`
  );
}

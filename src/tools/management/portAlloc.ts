/**
 * port_alloc 工具 - 自动分配端口（9222-9299）
 * 使用文件锁、原子写入和租约机制防止竞态条件
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, rmSync } from 'fs';
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

interface PortHeartbeatResult {
  port: number;
  ok: boolean;
  leaseToken?: string;
}

interface LockMetadata {
  pid: number;
  timestamp: number;
  uuid: string;
}

const PORT_REGISTRY_FILE = join(
  process.env.HOME || '/tmp',
  '.cache',
  'web-agent',
  'ports.json'
);

const PORT_REGISTRY_BACKUP = `${PORT_REGISTRY_FILE}.backup`;

const LOCK_DIR = join(
  process.env.HOME || '/tmp',
  '.cache',
  'web-agent',
  'ports.lock'
);

const LOCK_META_FILE = join(LOCK_DIR, 'meta.json');

const LOCK_TIMEOUT_MS = 30000; // 30 秒锁超时

/**
 * 检查端口是否可用（快速超时）
 */
async function checkPort(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      method: 'GET',
      signal: AbortSignal.timeout(500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 检查进程是否存活
 */
function isProcessAlive(pid: number): boolean {
  try {
    // 发送信号 0 检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取锁元数据
 */
function readLockMeta(): LockMetadata | null {
  try {
    if (!existsSync(LOCK_META_FILE)) {
      return null;
    }
    const content = readFileSync(LOCK_META_FILE, 'utf-8');
    return JSON.parse(content) as LockMetadata;
  } catch {
    return null;
  }
}

/**
 * 写入锁元数据
 */
function writeLockMeta(meta: LockMetadata): void {
  const dir = dirname(LOCK_META_FILE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(LOCK_META_FILE, JSON.stringify(meta), 'utf-8');
}

/**
 * 清理过期锁
 */
function cleanupStaleLock(): void {
  const meta = readLockMeta();
  if (!meta) {
    return;
  }

  const now = Date.now();
  const isExpired = (now - meta.timestamp) > LOCK_TIMEOUT_MS;
  const isDeadProcess = !isProcessAlive(meta.pid);

  if (isExpired || isDeadProcess) {
    // 锁已过期或进程已死亡，清理
    try {
      rmSync(LOCK_DIR, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * 跨进程文件锁（使用带元数据的锁目录）
 */
class FileMutex {
  private lockMeta: LockMetadata | null = null;

  /**
   * 尝试获取锁
   */
  private async tryAcquireLock(): Promise<boolean> {
    try {
      // 首先检查是否有过期锁
      cleanupStaleLock();

      // 尝试创建锁目录
      const dir = dirname(LOCK_DIR);
      mkdirSync(dir, { recursive: true });
      mkdirSync(LOCK_DIR);

      // 写入锁元数据
      this.lockMeta = {
        pid: process.pid,
        timestamp: Date.now(),
        uuid: randomUUID(),
      };
      writeLockMeta(this.lockMeta);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 释放锁
   */
  private releaseLock(): void {
    try {
      rmSync(LOCK_DIR, { recursive: true, force: true });
      this.lockMeta = null;
    } catch {
      // 忽略释放错误
    }
  }

  /**
   * 获取锁，轮询直到成功
   */
  async acquire<T>(fn: () => Promise<T> | T): Promise<T> {
    const maxAttempts = 100;
    const delayMs = 50;

    for (let i = 0; i < maxAttempts; i++) {
      if (await this.tryAcquireLock()) {
        try {
          return await fn();
        } finally {
          this.releaseLock();
        }
      }
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    throw new Error('获取锁超时，可能有其他进程持有锁');
  }
}

const registryMutex = new FileMutex();

/**
 * 读取端口注册表（带备份恢复）
 * 不在读取时迁移，迁移在写入时进行
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
 * 在锁外探测端口状态
 * 返回探测结果供锁内更新使用
 */
async function probePortStatus(
  registry: Record<string, PortInfo>,
  count: number
): Promise<{
  staleOccupied: string[];
  staleFree: string[];
  freePorts: number[];
  occupiedPorts: string[];
}> {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 30000;
  const staleOccupied: string[] = [];
  const staleFree: string[] = [];
  const freePorts: number[] = [];
  const occupiedPorts: string[] = [];

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

  // 扫描可用端口
  for (let port = CDP_PROXY.PORT_RANGE_START; port <= CDP_PROXY.PORT_RANGE_END && freePorts.length < count; port++) {
    const portKey = port.toString();
    const portInfo = registry[portKey];

    if (portInfo?.allocated) {
      // 实时检查已分配端口是否仍被占用（检测崩溃的持有者）
      const isOccupied = await checkPort(port);
      if (isOccupied) {
        occupiedPorts.push(portKey);
      }
      // 未占用的已分配端口将在锁内被释放
    } else {
      // 未分配的端口，检查是否可用
      const isOccupied = await checkPort(port);
      if (!isOccupied) {
        freePorts.push(port);
      }
    }
  }

  return { staleOccupied, staleFree, freePorts, occupiedPorts };
}

/**
 * 在锁下执行注册表更新
 * 基于锁外探测结果进行原子更新
 */
function updateRegistryFromProbe(
  registry: Record<string, PortInfo>,
  probeResult: {
    staleOccupied: string[];
    staleFree: string[];
    freePorts: number[];
    occupiedPorts: string[];
  },
  count: number
): {
  allocatedPorts: number[];
  leaseTokens: Record<number, string>;
} {
  const allocatedPorts: number[] = [];
  const leaseTokens: Record<number, string> = {};

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

  // 释放已分配但实际未占用的端口
  for (const portKey of Object.keys(registry)) {
    const portInfo = registry[portKey];
    if (portInfo?.allocated && !probeResult.occupiedPorts.includes(portKey)) {
      delete registry[portKey];
    }
  }

  // 分配新端口
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

  return { allocatedPorts, leaseTokens };
}

export async function portAlloc(params: PortAllocParams = {}): Promise<ToolResult<PortAllocResult>> {
  const { count = 1 } = params;

  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;
  let allocatedPorts: number[] = [];
  let leaseTokens: Record<number, string> = {};

  try {
    // 步骤 1: 在锁外读取注册表并探测端口状态
    let registry = await registryMutex.acquire(() => readRegistry());
    const probeResult = await probePortStatus(registry, count);

    // 步骤 2: 在锁内更新注册表
    await registryMutex.acquire(async () => {
      // 重新读取最新状态
      registry = readRegistry();
      // 基于探测结果更新
      const result = updateRegistryFromProbe(registry, probeResult, count);
      allocatedPorts = result.allocatedPorts;
      leaseTokens = result.leaseTokens;
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
 * 释放端口（支持旧版本记录和新版本记录）
 * 对于没有 leaseToken 的记录，接受无 token 请求
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

      // 向后兼容：如果记录没有 leaseToken，接受无 token 请求
      if (!portInfo.leaseToken) {
        delete registry[portKey];
        released = true;
        writeRegistryAtomic(registry, tempFile);
        return;
      }

      // 有 leaseToken 的记录，必须验证
      if (!leaseToken) {
        tokenMismatch = true;
        return;
      }

      if (portInfo.leaseToken !== leaseToken) {
        tokenMismatch = true;
        return;
      }

      delete registry[portKey];
      released = true;

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
 * 更新端口心跳（支持旧版本记录和新版本记录）
 * 对于没有 leaseToken 的记录，接受无 token 请求并返回生成的 token
 */
export async function portHeartbeat(params: { port: number; leaseToken?: string }): Promise<ToolResult<PortHeartbeatResult>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  let ok = false;
  let notFound = false;
  let tokenMismatch = false;
  let generatedToken: string | undefined;

  try {
    await registryMutex.acquire(async () => {
      const registry = readRegistry();
      const portKey = port.toString();

      if (!registry[portKey]) {
        notFound = true;
        return;
      }

      const portInfo = registry[portKey];

      // 向后兼容：如果记录没有 leaseToken，接受无 token 请求并生成 token
      if (!portInfo.leaseToken) {
        const newToken = randomUUID();
        generatedToken = newToken;
        registry[portKey] = {
          ...portInfo,
          leaseToken: newToken,
          lastHeartbeat: Date.now(),
        };
        writeRegistryAtomic(registry, tempFile);
        ok = true;
        return;
      }

      // 有 leaseToken 的记录，必须验证
      if (!leaseToken) {
        tokenMismatch = true;
        return;
      }

      if (portInfo.leaseToken !== leaseToken) {
        tokenMismatch = true;
        return;
      }

      registry[portKey].lastHeartbeat = Date.now();
      ok = true;

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
    {
      port,
      ok,
      leaseToken: generatedToken,
    },
    generatedToken
      ? `已更新端口 ${port} 的心跳（leaseToken 已生成，请妥善保管：${generatedToken}）`
      : `已更新端口 ${port} 的心跳`
  );
}

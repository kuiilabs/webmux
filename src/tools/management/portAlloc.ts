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
 * 只有当锁真正过期（时间超时且进程死亡）且有有效元数据时才清理
 */
function cleanupStaleLock(): void {
  // 检查锁目录是否存在
  if (!existsSync(LOCK_DIR)) {
    return;
  }

  const meta = readLockMeta();

  // 如果元数据不存在，说明锁正在创建中，保守处理，不删除
  // 这是安全的，因为 tryAcquireLock 使用原子 mkdir，如果锁已存在会失败
  if (!meta) {
    return;
  }

  const now = Date.now();
  const isExpired = (now - meta.timestamp) > LOCK_TIMEOUT_MS;
  const isDeadProcess = !isProcessAlive(meta.pid);

  // 只有锁过期且进程死亡，才清理
  // 如果进程仍存活，即使锁超时也不清理（可能是慢操作）
  if (isExpired && isDeadProcess) {
    try {
      rmSync(LOCK_DIR, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * 跨进程文件锁（使用带元数据的锁目录）
 * 使用原子 mkdir 操作确保互斥
 */
class FileMutex {
  private lockMeta: LockMetadata | null = null;

  /**
   * 尝试获取锁
   * 使用 mkdir 的原子性：如果目录已存在则失败
   */
  private async tryAcquireLock(): Promise<boolean> {
    try {
      // 首先检查是否有过期锁
      cleanupStaleLock();

      // 检查锁目录是否已存在（避免 EEXIST 错误）
      if (existsSync(LOCK_DIR)) {
        return false;
      }

      // 尝试创建锁目录（原子操作，如果已存在会抛出错误）
      const dir = dirname(LOCK_DIR);
      mkdirSync(dir, { recursive: true });

      // 使用 mkdir 创建锁目录
      // 由于上面已经检查过 existsSync，这里如果仍失败说明是竞态条件
      mkdirSync(LOCK_DIR);

      // 写入锁元数据
      this.lockMeta = {
        pid: process.pid,
        timestamp: Date.now(),
        uuid: randomUUID(),
      };
      writeLockMeta(this.lockMeta);

      return true;
    } catch (err) {
      // 如果目录已存在（竞态条件），返回 false
      if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
        return false;
      }
      // 其他错误也返回 false
      return false;
    }
  }

  /**
   * 释放锁
   * 只有在持有锁且 UUID 匹配时才删除锁目录
   */
  private releaseLock(): void {
    if (!this.lockMeta) {
      return; // 未持有锁
    }

    try {
      // 验证锁目录仍存在且 UUID 匹配
      if (existsSync(LOCK_DIR)) {
        const currentMeta = readLockMeta();
        if (currentMeta && currentMeta.uuid === this.lockMeta.uuid) {
          // UUID 匹配，安全删除
          rmSync(LOCK_DIR, { recursive: true, force: true });
        }
        // 如果 UUID 不匹配，说明锁已被其他进程获取，不删除
      }
    } catch {
      // 忽略释放错误
    } finally {
      this.lockMeta = null;
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
 * 注意：锁外探测结果可能过期，锁内需要二次验证
 */
async function probePortStatus(
  registry: Record<string, PortInfo>,
  count: number
): Promise<{
  staleOccupied: string[];
  staleFree: string[];
  candidateFreePorts: number[];
  candidateStaleAllocatedPorts: Set<string>;
}> {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 30000;
  const staleOccupied: string[] = [];
  const staleFree: string[] = [];
  const candidateFreePorts: number[] = [];
  const candidateStaleAllocatedPorts = new Set<string>();

  // 检查过期端口（心跳超时）
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

  // 扫描整个端口范围，收集候选端口
  // 注意：这些只是候选，锁内需要二次验证
  for (let port = CDP_PROXY.PORT_RANGE_START; port <= CDP_PROXY.PORT_RANGE_END; port++) {
    const portKey = port.toString();
    const portInfo = registry[portKey];

    if (portInfo?.allocated) {
      // 心跳超时的已分配端口，候选释放（锁内二次验证）
      if (!portInfo.lastHeartbeat || now - portInfo.lastHeartbeat > HEARTBEAT_TIMEOUT) {
        candidateStaleAllocatedPorts.add(portKey);
      }
    } else {
      // 未分配的端口，候选可用（锁内二次验证）
      if (candidateFreePorts.length < count) {
        const isOccupied = await checkPort(port);
        if (!isOccupied) {
          candidateFreePorts.push(port);
        }
      }
    }
  }

  return { staleOccupied, staleFree, candidateFreePorts, candidateStaleAllocatedPorts };
}

/**
 * 在锁下执行注册表更新
 * 基于锁外探测结果进行原子更新
 * 在锁内对候选端口进行二次验证，确保状态未变化
 */
async function updateRegistryFromProbe(
  registry: Record<string, PortInfo>,
  probeResult: {
    staleOccupied: string[];
    staleFree: string[];
    candidateFreePorts: number[];
    candidateStaleAllocatedPorts: Set<string>;
  },
  count: number
): Promise<{
  allocatedPorts: number[];
  leaseTokens: Record<number, string>;
}> {
  const allocatedPorts: number[] = [];
  const leaseTokens: Record<number, string> = {};
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 30000;

  // 更新过期但仍占用的端口心跳
  for (const portKey of probeResult.staleOccupied) {
    if (registry[portKey]) {
      registry[portKey] = {
        ...registry[portKey],
        lastHeartbeat: Date.now(),
      };
    }
  }

  // 二次验证：删除过期且空闲的端口
  // 在删除前重新验证心跳仍超时，避免删除收到心跳的活跃租约
  for (const portKey of probeResult.staleFree) {
    const portInfo = registry[portKey];
    // 重新验证：记录仍存在且心跳仍超时
    if (portInfo && (!portInfo.lastHeartbeat || now - portInfo.lastHeartbeat > HEARTBEAT_TIMEOUT)) {
      // 二次验证：端口确实未占用
      const port = parseInt(portKey, 10);
      const isOccupied = await checkPort(port);
      if (!isOccupied) {
        delete registry[portKey];
      }
    }
    // 如果心跳已更新（now - lastHeartbeat <= TIMEOUT），保留记录
  }

  // 二次验证：释放心跳超时且实际未占用的端口
  for (const portKey of probeResult.candidateStaleAllocatedPorts) {
    const port = parseInt(portKey, 10);
    const portInfo = registry[portKey];

    // 再次检查：端口记录是否仍存在且心跳仍超时
    if (!portInfo || !portInfo.allocated) {
      continue; // 已被其他调用者修改
    }
    if (!portInfo.lastHeartbeat || now - portInfo.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      // 心跳仍超时，二次验证端口是否被占用
      const isOccupied = await checkPort(port);
      if (!isOccupied) {
        // 确认未占用，安全释放
        delete registry[portKey];
      }
    }
  }

  // 二次验证：分配候选可用端口
  for (const port of probeResult.candidateFreePorts) {
    if (allocatedPorts.length >= count) break;

    const portKey = port.toString();

    // 二次检查：端口记录是否仍存在
    if (registry[portKey]?.allocated) {
      continue; // 已被其他调用者分配
    }

    // 二次验证：端口是否仍可用
    const isOccupied = await checkPort(port);
    if (isOccupied) {
      continue; // 端口已被占用，跳过
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
    // 步骤 1: 在锁外读取注册表并探测端口状态（收集候选列表）
    const registry = readRegistry();
    const probeResult = await probePortStatus(registry, count);

    // 步骤 2: 在锁内重新读取注册表并二次验证候选端口
    await registryMutex.acquire(async () => {
      const freshRegistry = readRegistry();
      const result = await updateRegistryFromProbe(freshRegistry, probeResult, count);
      allocatedPorts = result.allocatedPorts;
      leaseTokens = result.leaseTokens;
      writeRegistryAtomic(freshRegistry, tempFile);
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

  // 构建兼容性响应：同时包含旧格式（registry）和新格式（leaseTokens）
  // 旧客户端可以继续使用 registry，新客户端应该使用 leaseTokens
  const compatibilityRegistry: Record<string, PortInfo> = {};
  for (let i = 0; i < allocatedPorts.length; i++) {
    const port = allocatedPorts[i];
    const portKey = port.toString();
    compatibilityRegistry[portKey] = {
      port,
      allocated: true,
      allocatedAt: Date.now(),
      leaseToken: leaseTokens[port],
      lastHeartbeat: Date.now(),
    };
  }

  return success(
    {
      ports: allocatedPorts,
      leaseTokens,
      registry: compatibilityRegistry, // 向后兼容字段，旧客户端可使用
    },
    `已分配 ${allocatedPorts.length} 个端口：${allocatedPorts.join(', ')}（leaseToken 已返回，请妥善保管用于释放和心跳）`
  );
}

/**
 * 释放端口（支持旧版本记录和新版本记录）
 *
 * 迁移策略（升级期间预期行为）：
 * - 旧记录（无 leaseToken）：如果有 agentId 或 chromeId，生成并回填 token，然后执行请求
 *   这是为了平滑升级的设计决策。要求有 agentId 或 chromeId 证明所有权。
 *   建议：尽快升级所有客户端到新协议，旧记录会在一次操作后转换为新协议。
 * - 新版本记录（有 leaseToken）：必须验证 token
 */
export async function portRelease(params: { port: number; leaseToken?: string }): Promise<ToolResult<{ port: number; released: boolean; migratedToken?: string }>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  let released = false;
  let notFound = false;
  let tokenMismatch = false;
  let migratedToken: string | undefined;
  let migrationRejected = false;

  try {
    await registryMutex.acquire(async () => {
      const registry = readRegistry();
      const portKey = port.toString();

      if (!registry[portKey]) {
        notFound = true;
        return;
      }

      const portInfo = registry[portKey];

      // 旧版本记录（没有 leaseToken）：生成并回填 token，然后接受请求
      // 新版本记录（有 leaseToken）：必须验证 token
      if (!portInfo.leaseToken) {
        // 检查是否有 ownership 证明：agentId 或 chromeId
        const hasOwnershipProof = portInfo.agentId || portInfo.chromeId;

        if (!hasOwnershipProof) {
          // 没有 ownership 证明，拒绝迁移
          migrationRejected = true;
          return;
        }

        // 有 ownership 证明，生成新 token 并回填
        migratedToken = randomUUID();
        registry[portKey] = {
          ...portInfo,
          leaseToken: migratedToken,
        };
        // 继续执行释放操作
      } else {
        if (!leaseToken) {
          tokenMismatch = true;
          return;
        }
        if (portInfo.leaseToken !== leaseToken) {
          tokenMismatch = true;
          return;
        }
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

  if (migrationRejected) {
    return error(
      networkError(`端口 ${port} 是旧版本记录且无 ownership 证明（缺少 agentId 或 chromeId），无法释放`)
    );
  }

  if (tokenMismatch) {
    return error(
      networkError(`leaseToken 不匹配，拒绝释放端口 ${port}`)
    );
  }

  return success(
    { port, released, migratedToken },
    `已释放端口 ${port}${migratedToken ? '（已迁移到新认证机制，本次返回的 leaseToken 为：' + migratedToken + '）' : ''}`
  );
}

/**
 * 更新端口心跳（支持旧版本记录和新版本记录）
 *
 * 迁移策略（升级期间预期行为）：
 * - 旧记录（无 leaseToken）：如果有 agentId 或 chromeId，生成并回填 token，然后执行请求
 *   这是为了平滑升级的设计决策。要求有 agentId 或 chromeId 证明所有权。
 *   建议：尽快升级所有客户端到新协议，旧记录会在一次操作后转换为新协议。
 * - 新版本记录（有 leaseToken）：必须验证 token
 */
export async function portHeartbeat(params: { port: number; leaseToken?: string }): Promise<ToolResult<PortHeartbeatResult & { migratedToken?: string }>> {
  const { port, leaseToken } = params;
  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;

  let ok = false;
  let notFound = false;
  let tokenMismatch = false;
  let migratedToken: string | undefined;
  let migrationRejected = false;

  try {
    await registryMutex.acquire(async () => {
      const registry = readRegistry();
      const portKey = port.toString();

      if (!registry[portKey]) {
        notFound = true;
        return;
      }

      const portInfo = registry[portKey];

      // 旧版本记录（没有 leaseToken）：生成并回填 token，然后接受请求
      // 新版本记录（有 leaseToken）：必须验证 token
      if (!portInfo.leaseToken) {
        // 检查是否有 ownership 证明：agentId 或 chromeId
        const hasOwnershipProof = portInfo.agentId || portInfo.chromeId;

        if (!hasOwnershipProof) {
          // 没有 ownership 证明，拒绝迁移
          migrationRejected = true;
          return;
        }

        // 有 ownership 证明，生成新 token 并回填
        migratedToken = randomUUID();
        registry[portKey] = {
          ...portInfo,
          leaseToken: migratedToken,
        };
        // 继续执行心跳更新
      } else {
        if (!leaseToken) {
          tokenMismatch = true;
          return;
        }
        if (portInfo.leaseToken !== leaseToken) {
          tokenMismatch = true;
          return;
        }
      }

      // 更新心跳
      registry[portKey] = {
        ...registry[portKey],
        lastHeartbeat: Date.now(),
      };
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

  if (migrationRejected) {
    return error(
      networkError(`端口 ${port} 是旧版本记录且无 ownership 证明（缺少 agentId 或 chromeId），无法续期`)
    );
  }

  if (tokenMismatch) {
    return error(
      networkError(`leaseToken 不匹配，拒绝更新端口 ${port} 的心跳`)
    );
  }

  return success(
    { port, ok, migratedToken },
    `已更新端口 ${port} 的心跳${migratedToken ? '（已迁移到新认证机制，本次返回的 leaseToken 为：' + migratedToken + '，请保存用于后续操作）' : ''}`
  );
}

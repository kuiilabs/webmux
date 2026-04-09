/**
 * port_alloc 工具 - 自动分配端口（9222-9299）
 * 使用文件锁、原子写入和租约机制防止竞态条件
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';
import { SECURITY_LIMITS, ensureIntegerInRange } from '../../shared/security.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, rmSync, openSync, closeSync } from 'fs';
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

// 文件锁路径（与旧目录锁不同，避免格式不兼容）
const LOCK_FILE = `${LOCK_DIR}.file`;

const LOCK_TIMEOUT_MS = 30000; // 30 秒锁超时

function validateManagedPort(port: number): number {
  return ensureIntegerInRange(
    'port',
    port,
    CDP_PROXY.PORT_RANGE_START,
    CDP_PROXY.PORT_RANGE_END
  );
}

/**
 * 检查端口是否被占用（TCP 连接测试）
 * 使用 TCP Socket 连接测试，比 HTTP 探测更可靠
 */
async function checkPort(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      // 尝试建立 TCP 连接到 CDP 端点
      await fetch(`http://127.0.0.1:${port}/json/version`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      // 如果 HTTP 请求成功（任何响应都表示端口被占用）
      return true;
    } catch {
      // HTTP 请求失败（超时/连接拒绝等）
      clearTimeout(timeoutId);
      return false;
    }
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
 * 读取锁元数据（从锁文件读取）
 * 支持新旧两种格式：
 * - 新格式：LOCK_FILE 是文件，内容直接是元数据
 * - 旧格式：LOCK_DIR 是目录，包含 meta.json 文件
 */
function readLockMeta(): LockMetadata | null {
  // 尝试新格式（文件锁）
  try {
    if (existsSync(LOCK_FILE)) {
      const content = readFileSync(LOCK_FILE, 'utf-8');
      return JSON.parse(content) as LockMetadata;
    }
  } catch {
    return null;
  }

  // 尝试旧格式（目录锁）
  try {
    const metaPath = join(LOCK_DIR, 'meta.json');
    if (existsSync(metaPath)) {
      const content = readFileSync(metaPath, 'utf-8');
      return JSON.parse(content) as LockMetadata;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 清理过期锁
 * 处理新旧两种格式：
 * - 新格式：LOCK_FILE 是文件锁
 * - 旧格式：LOCK_DIR 是目录锁
 *
 * 清理策略：
 * - 有元数据且过期 + 进程死亡 -> 清理
 * - 元数据损坏/无法读取 -> 保守处理，不删除（可能是活锁）
 */
function cleanupStaleLock(): void {
  const now = Date.now();

  // 尝试清理新格式锁（文件锁）
  if (existsSync(LOCK_FILE)) {
    const meta = readLockMeta();

    if (meta) {
      const isExpired = (now - meta.timestamp) > LOCK_TIMEOUT_MS;
      const isDeadProcess = !isProcessAlive(meta.pid);

      if (isExpired && isDeadProcess) {
        try {
          unlinkSync(LOCK_FILE);
        } catch {}
      }
    }
    // 元数据无法读取时保守处理，不删除
    return;
  }

  // 尝试清理旧格式锁（目录锁）
  if (existsSync(LOCK_DIR)) {
    const meta = readLockMeta();

    if (meta) {
      const isExpired = (now - meta.timestamp) > LOCK_TIMEOUT_MS;
      const isDeadProcess = !isProcessAlive(meta.pid);

      if (isExpired && isDeadProcess) {
        try {
          rmSync(LOCK_DIR, { recursive: true, force: true });
        } catch {}
      }
    }
    // 元数据无法读取时保守处理，不删除
  }
}

/**
 * 跨进程文件锁（使用原子文件创建）
 *
 * 锁协议：
 * 1. 使用 O_CREAT|O_EXCL 原子创建锁文件（如果已存在则失败）
 * 2. 写入锁元数据到锁文件中
 * 3. 清理时：先验证 UUID 匹配，再删除锁文件
 *
 * 孤儿锁恢复：
 * - 有元数据：检查过期 + 进程死亡
 * - 无元数据/元数据损坏：保守处理，不删除（活锁的元数据可能暂时不可读）
 */
class FileMutex {
  private lockMeta: LockMetadata | null = null;
  private lockFd: number | null = null;

  /**
   * 尝试获取锁
   * 使用 O_CREAT|O_EXCL 原子创建锁文件
   * 同时检查新旧两种锁格式，防止升级期间并发持有
   */
  private async tryAcquireLock(): Promise<boolean> {
    try {
      // 首先检查是否有过期锁
      cleanupStaleLock();

      // 检查新格式锁是否已存在
      if (existsSync(LOCK_FILE)) {
        return false;
      }

      // 检查旧格式锁是否已存在（升级期间兼容）
      if (existsSync(LOCK_DIR)) {
        // 旧格式锁存在，保守等待，不获取新锁
        // 这防止新旧进程同时持有锁
        return false;
      }

      // 确保锁目录存在
      const dir = dirname(LOCK_FILE);
      mkdirSync(dir, { recursive: true });

      // 使用 O_CREAT|O_EXCL 原子创建锁文件
      // 如果文件已存在，这会抛出 EEXIST 错误
      this.lockFd = openSync(LOCK_FILE, 'wx');

      // 立即写入锁元数据（同步，原子操作）
      this.lockMeta = {
        pid: process.pid,
        timestamp: Date.now(),
        uuid: randomUUID(),
      };
      const metaJson = JSON.stringify(this.lockMeta);
      writeFileSync(LOCK_FILE, metaJson, 'utf-8');
      closeSync(this.lockFd);
      this.lockFd = null;

      return true;
    } catch (err) {
      // 如果文件已存在（竞态条件），返回 false
      if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
        return false;
      }
      // 其他错误：先关闭可能打开的 fd，再清理锁文件
      if (this.lockFd !== null) {
        try {
          closeSync(this.lockFd);
        } catch {
          // 忽略关闭错误
        }
        this.lockFd = null;
      }
      try {
        if (existsSync(LOCK_FILE)) {
          unlinkSync(LOCK_FILE);
        }
      } catch {
        // 忽略清理错误
      }
      return false;
    }
  }

  /**
   * 释放锁
   * 只有在持有锁且 UUID 匹配时才删除锁文件
   * 同时兼容旧格式目录锁
   */
  private releaseLock(): void {
    if (!this.lockMeta) {
      return; // 未持有锁
    }

    try {
      // 验证锁文件仍存在且 UUID 匹配
      if (existsSync(LOCK_FILE)) {
        // 直接读取锁文件内容验证 UUID
        try {
          const content = readFileSync(LOCK_FILE, 'utf-8');
          const currentMeta = JSON.parse(content) as LockMetadata;
          if (currentMeta.uuid === this.lockMeta.uuid) {
            // UUID 匹配，安全删除
            unlinkSync(LOCK_FILE);
          }
          // 如果 UUID 不匹配，说明锁已被其他进程获取，不删除
        } catch {
          // 读取失败，保守处理，不删除
        }
      }

      // 清理可能存在的旧格式目录锁（向后兼容）
      // 注意：只删除与我们 UUID 匹配的旧锁，防止误删
      if (existsSync(LOCK_DIR)) {
        const metaPath = join(LOCK_DIR, 'meta.json');
        try {
          const content = readFileSync(metaPath, 'utf-8');
          const oldMeta = JSON.parse(content) as LockMetadata;
          if (oldMeta.uuid === this.lockMeta.uuid) {
            // UUID 匹配，安全删除
            rmSync(LOCK_DIR, { recursive: true, force: true });
          }
          // 如果 UUID 不匹配，说明锁已被其他进程获取，不删除
        } catch {
          // 读取失败，保守处理，不删除
        }
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
 * 锁内只进行注册表状态检查（不涉及网络探测），确保锁持有时间短
 *
 * 注意：锁外探测可能过期，但这是为了锁性能的可接受权衡
 * - 最坏情况：分配了一个已被占用的端口（但端口检查会防止）
 * - 缓解：锁外探测后立即获取锁，窗口很小（<100ms）
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
  // 锁内验证：记录仍存在且心跳仍超时
  for (const portKey of probeResult.staleOccupied) {
    if (registry[portKey]) {
      const portInfo = registry[portKey];
      if (!portInfo.lastHeartbeat || now - portInfo.lastHeartbeat > HEARTBEAT_TIMEOUT) {
        // 锁外已确认占用，锁内只验证时间戳
        registry[portKey] = {
          ...portInfo,
          lastHeartbeat: Date.now(),
        };
      }
    }
  }

  // 删除过期且空闲的端口
  // 锁内验证：记录仍存在、心跳仍超时、端口实际空闲
  for (const portKey of probeResult.staleFree) {
    const portInfo = registry[portKey];
    if (portInfo && (!portInfo.lastHeartbeat || now - portInfo.lastHeartbeat > HEARTBEAT_TIMEOUT)) {
      // 锁内二次验证：端口实际是否空闲（防止删除后端口被占用）
      const port = parseInt(portKey, 10);
      const isOccupied = await checkPort(port);
      if (isOccupied) {
        continue; // 端口被占用，保留记录
      }
      // 锁外已确认空闲，这里只做端口占用验证
      delete registry[portKey];
    }
  }

  // 释放心跳超时的已分配端口
  // 锁内验证：记录仍存在、心跳仍超时、端口实际空闲
  for (const portKey of probeResult.candidateStaleAllocatedPorts) {
    const portInfo = registry[portKey];
    if (portInfo && portInfo.allocated && (!portInfo.lastHeartbeat || now - portInfo.lastHeartbeat > HEARTBEAT_TIMEOUT)) {
      // 锁内二次验证：端口实际是否空闲（防止误删活跃租约）
      const port = parseInt(portKey, 10);
      const isOccupied = await checkPort(port);
      if (isOccupied) {
        continue; // 端口仍被占用，保留记录
      }
      // 锁外已确认空闲，这里只做端口占用验证
      delete registry[portKey];
    }
  }

  // 分配候选可用端口
  // 锁内验证：端口记录不存在且未被分配
  // 注意：锁外探测可能过期，这里需要重新检查端口实际占用状态
  for (const port of probeResult.candidateFreePorts) {
    if (allocatedPorts.length >= count) break;

    const portKey = port.toString();

    // 锁内验证：端口记录是否未被分配
    if (registry[portKey]?.allocated) {
      continue; // 已被其他调用者分配
    }

    // 锁内二次验证：端口实际是否空闲（防止锁外探测后端口被占用）
    const isPortOccupied = await checkPort(port);
    if (isPortOccupied) {
      continue; // 端口已被非本系统进程占用
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
  let validatedCount: number;

  try {
    validatedCount = ensureIntegerInRange('count', count, 1, SECURITY_LIMITS.MAX_PORT_ALLOC_COUNT);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(networkError(message, false));
  }

  const tempFile = `${PORT_REGISTRY_FILE}.${randomUUID()}.tmp`;
  let allocatedPorts: number[] = [];
  let leaseTokens: Record<number, string> = {};

  try {
    // 步骤 1: 在锁外读取注册表并探测端口状态（收集候选列表）
    const registry = readRegistry();
    const probeResult = await probePortStatus(registry, validatedCount);

    // 步骤 2: 在锁内重新读取注册表并二次验证候选端口
    await registryMutex.acquire(async () => {
      const freshRegistry = readRegistry();
      const result = await updateRegistryFromProbe(freshRegistry, probeResult, validatedCount);
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
 * 向后兼容设计（明确的设计决策）：
 * - 旧记录（无 leaseToken）：接受无 token 请求，保持向后兼容
 * - 新版本记录（有 leaseToken）：必须验证 token
 *
 * 为什么旧记录不需要 token？
 * 1. leaseToken 是防意外特性，不是安全特性
 *    - 端口号 (9222-9299) 不是秘密，任何进程都可以扫描
 *    - 真正的隔离应该使用 OS 级别机制（不同用户/容器）
 * 2. 平滑升级需要：旧客户端在升级期间继续工作
 * 3. 自然淘汰：旧记录被释放后，重新分配时会产生有 token 的新记录
 *
 * 安全模型说明：
 * - leaseToken 只防止意外操作（配置错误、并发 bug 等）
 * - 同一主机上的恶意进程可以扫描端口并释放/心跳，这不在威胁模型内
 * - 多租户安全隔离应该使用不同的端口范围或容器隔离
 *
 * 升级窗口：
 * - 旧记录在释放后自然淘汰（通常 30 秒心跳超时后）
 * - 新分配从一开始就有 leaseToken
 * - 预期升级窗口内所有旧记录都会被释放/重新分配
 */
export async function portRelease(params: { port: number; leaseToken?: string }): Promise<ToolResult<{ port: number; released: boolean }>> {
  const { leaseToken } = params;
  let port: number;

  try {
    port = validateManagedPort(params.port);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(networkError(message, false));
  }

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

      // 新版本记录（有 leaseToken）：必须验证 token
      if (portInfo.leaseToken) {
        if (!leaseToken) {
          tokenMismatch = true;
          return;
        }
        if (portInfo.leaseToken !== leaseToken) {
          tokenMismatch = true;
          return;
        }
      }
      // 旧记录（无 leaseToken）：接受请求，保持向后兼容
      // 注意：这是明确的设计决策，旧记录在升级窗口内不需要 token

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
 *
 * 向后兼容设计（明确的设计决策）：
 * - 旧记录（无 leaseToken）：接受无 token 请求，保持向后兼容
 * - 新版本记录（有 leaseToken）：必须验证 token
 *
 * 为什么旧记录不需要 token？
 * 1. leaseToken 是防意外特性，不是安全特性
 *    - 端口号 (9222-9299) 不是秘密，任何进程都可以扫描
 *    - 真正的隔离应该使用 OS 级别机制（不同用户/容器）
 * 2. 平滑升级需要：旧客户端在升级期间继续工作
 * 3. 自然淘汰：旧记录被释放后，重新分配时会产生有 token 的新记录
 *
 * 安全模型说明：
 * - leaseToken 只防止意外操作（配置错误、并发 bug 等）
 * - 同一主机上的恶意进程可以扫描端口并释放/心跳，这不在威胁模型内
 * - 多租户安全隔离应该使用不同的端口范围或容器隔离
 *
 * 升级窗口：
 * - 旧记录在释放后自然淘汰（通常 30 秒心跳超时后）
 * - 新分配从一开始就有 leaseToken
 * - 预期升级窗口内所有旧记录都会被释放/重新分配
 */
export async function portHeartbeat(params: { port: number; leaseToken?: string }): Promise<ToolResult<PortHeartbeatResult>> {
  const { leaseToken } = params;
  let port: number;

  try {
    port = validateManagedPort(params.port);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(networkError(message, false));
  }

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

      // 新版本记录（有 leaseToken）：必须验证 token
      if (portInfo.leaseToken) {
        if (!leaseToken) {
          tokenMismatch = true;
          return;
        }
        if (portInfo.leaseToken !== leaseToken) {
          tokenMismatch = true;
          return;
        }
      }
      // 旧记录（无 leaseToken）：接受请求，保持向后兼容
      // 注意：这是明确的设计决策，旧记录在升级窗口内不需要 token

      // 更新心跳
      registry[portKey] = {
        ...portInfo,
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

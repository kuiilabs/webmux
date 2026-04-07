/**
 * 任务注册中心实现
 * 支持子 Agent 任务的注册、状态追踪、结果收集
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { SubAgentTask, SubAgentResult, SubAgentStatus, TaskRegistry } from './parallelTypes.js';

const TASK_REGISTRY_FILE = join(
  process.env.HOME || '/tmp',
  '.cache',
  'web-agent',
  'task-registry.json'
);

/**
 * 读取任务注册表
 */
function readRegistry(): Record<string, { task: SubAgentTask; result?: SubAgentResult }> {
  try {
    if (!existsSync(TASK_REGISTRY_FILE)) {
      const dir = TASK_REGISTRY_FILE.substring(0, TASK_REGISTRY_FILE.lastIndexOf('/'));
      mkdirSync(dir, { recursive: true });
      return {};
    }
    const content = readFileSync(TASK_REGISTRY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * 写入任务注册表
 */
function writeRegistry(registry: Record<string, { task: SubAgentTask; result?: SubAgentResult }>): void {
  try {
    writeFileSync(TASK_REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (err) {
    console.error('写入任务注册表失败:', err);
  }
}

/**
 * 生成任务 ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * 任务注册中心实现
 */
export const taskRegistry: TaskRegistry = {
  /**
   * 注册任务
   */
  async register(task: SubAgentTask): Promise<string> {
    const registry = readRegistry();
    const taskId = generateTaskId();

    registry[taskId] = {
      task: {
        ...task,
        id: taskId,
        status: 'pending',
        createdAt: Date.now(),
      },
    };

    writeRegistry(registry);
    return taskId;
  },

  /**
   * 更新任务状态
   */
  async updateStatus(taskId: string, status: SubAgentStatus, error?: string): Promise<void> {
    const registry = readRegistry();
    const entry = registry[taskId];

    if (!entry) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    entry.task.status = status;
    if (status === 'running') {
      entry.task.startedAt = Date.now();
    }
    if (error) {
      entry.task.error = error;
    }

    writeRegistry(registry);
  },

  /**
   * 获取任务详情
   */
  async getTask(taskId: string): Promise<SubAgentTask | null> {
    const registry = readRegistry();
    const entry = registry[taskId];
    return entry?.task || null;
  },

  /**
   * 列出所有任务
   */
  async listTasks(status?: SubAgentStatus): Promise<SubAgentTask[]> {
    const registry = readRegistry();
    const tasks = Object.values(registry).map(entry => entry.task);

    if (status) {
      return tasks.filter(t => t.status === status);
    }

    return tasks;
  },

  /**
   * 完成任务
   */
  async complete(taskId: string, result: SubAgentResult): Promise<void> {
    const registry = readRegistry();
    const entry = registry[taskId];

    if (!entry) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    entry.task.status = result.status;
    entry.task.completedAt = Date.now();
    entry.result = result;

    writeRegistry(registry);
  },

  /**
   * 获取任务结果
   */
  async getResult(taskId: string): Promise<SubAgentResult | null> {
    const registry = readRegistry();
    const entry = registry[taskId];
    return entry?.result || null;
  },
};

/**
 * 清理过期任务
 */
export async function cleanupOldTasks(maxAgeHours: number = 24): Promise<number> {
  const registry = readRegistry();
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  let cleaned = 0;

  for (const [taskId, entry] of Object.entries(registry)) {
    const completedAt = entry.task.completedAt || entry.task.createdAt;
    if (now - completedAt > maxAgeMs) {
      delete registry[taskId];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    writeRegistry(registry);
  }

  return cleaned;
}

/**
 * agent_task_register 工具 - 注册子 Agent 任务
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { taskRegistry } from '../../runtime/taskRegistry.js';
import type { SubAgentTask } from '../../runtime/parallelTypes.js';
import type { ChannelType } from '../../shared/types.js';

interface AgentTaskRegisterParams {
  goal: string;
  successCriteria: string[];
  domain?: string;
  allowedChannels?: ChannelType[];
  tokenBudget?: number;
  allocatedPort?: number;
}

interface AgentTaskRegisterResult {
  taskId: string;
  goal: string;
  status: string;
  createdAt: number;
}

export async function agentTaskRegister(params: AgentTaskRegisterParams): Promise<ToolResult<AgentTaskRegisterResult>> {
  const { goal, successCriteria, domain, allowedChannels, tokenBudget, allocatedPort } = params;

  if (!goal) {
    return error({
      type: 'page',
      message: '缺少必要参数：goal',
      suggestion: '请指定任务目标',
      retryable: false,
    });
  }

  if (!successCriteria || successCriteria.length === 0) {
    return error({
      type: 'page',
      message: '缺少必要参数：successCriteria',
      suggestion: '请指定成功标准列表',
      retryable: false,
    });
  }

  try {
    const task: SubAgentTask = {
      id: '', // 将由 registry 生成
      goal,
      successCriteria,
      domain,
      allowedChannels: allowedChannels || ['static', 'browser', 'automation', 'devtools'],
      tokenBudget: tokenBudget || 8000,
      allocatedPort,
      status: 'pending',
      createdAt: Date.now(),
    };

    const taskId = await taskRegistry.register(task);

    return success(
      {
        taskId,
        goal,
        status: 'pending',
        createdAt: Date.now(),
      },
      `已注册子 Agent 任务 ${taskId}，目标：${goal.substring(0, 50)}${goal.length > 50 ? '...' : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error({
      type: 'network',
      message: `注册任务失败：${message}`,
      suggestion: '检查任务注册表是否可写',
      retryable: true,
      retry_delay_ms: 1000,
    });
  }
}

/**
 * agent_task_register 工具 - 注册子 Agent 任务
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { taskRegistry } from '../../runtime/taskRegistry.js';
import type { SubAgentTask } from '../../runtime/parallelTypes.js';
import type { ChannelType } from '../../shared/types.js';
import { SECURITY_LIMITS, ensureTextLength } from '../../shared/security.js';

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

  // 验证 goal
  let validatedGoal: string;
  try {
    validatedGoal = ensureTextLength('goal', goal, SECURITY_LIMITS.MAX_SUBAGENT_GOAL_LENGTH);
  } catch (err) {
    return error({
      type: 'page',
      message: `goal 参数无效：${err instanceof Error ? err.message : String(err)}`,
      suggestion: `任务目标长度不能超过 ${SECURITY_LIMITS.MAX_SUBAGENT_GOAL_LENGTH} 个字符`,
      retryable: false,
    });
  }

  // 验证 successCriteria
  if (!successCriteria || !Array.isArray(successCriteria)) {
    return error({
      type: 'page',
      message: '缺少必要参数：successCriteria',
      suggestion: '请指定成功标准列表（数组格式）',
      retryable: false,
    });
  }

  if (successCriteria.length > SECURITY_LIMITS.MAX_SUCCESS_CRITERIA) {
    return error({
      type: 'page',
      message: `successCriteria 数量超过限制`,
      suggestion: `成功标准数量不能超过 ${SECURITY_LIMITS.MAX_SUCCESS_CRITERIA} 条`,
      retryable: false,
    });
  }

  const validatedSuccessCriteria = successCriteria.map((criteria, index) => {
    try {
      return ensureTextLength(`successCriteria[${index}]`, criteria, SECURITY_LIMITS.MAX_SUCCESS_CRITERION_LENGTH);
    } catch (err) {
      throw new Error(`成功标准 #${index + 1} 长度超过 ${SECURITY_LIMITS.MAX_SUCCESS_CRITERION_LENGTH} 字符`);
    }
  });

  // 验证 domain（可选）
  let validatedDomain: string | undefined;
  if (domain) {
    try {
      validatedDomain = domain; // domain 格式验证在 store 层进行
    } catch (err) {
      return error({
        type: 'page',
        message: `domain 参数无效：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '请提供合法的域名格式',
        retryable: false,
      });
    }
  }

  // 验证 tokenBudget（可选）
  const validatedTokenBudget = tokenBudget || 8000;

  try {
    const task: SubAgentTask = {
      id: '', // 将由 registry 生成
      goal: validatedGoal,
      successCriteria: validatedSuccessCriteria,
      domain: validatedDomain,
      allowedChannels: allowedChannels || ['static', 'browser', 'automation', 'devtools'],
      tokenBudget: validatedTokenBudget,
      allocatedPort,
      status: 'pending',
      createdAt: Date.now(),
    };

    const taskId = await taskRegistry.register(task);

    return success(
      {
        taskId,
        goal: validatedGoal,
        status: 'pending',
        createdAt: Date.now(),
      },
      `已注册子 Agent 任务 ${taskId}，目标：${validatedGoal.substring(0, 50)}${validatedGoal.length > 50 ? '...' : ''}`
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

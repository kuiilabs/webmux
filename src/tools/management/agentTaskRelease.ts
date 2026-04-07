/**
 * agent_task_release 工具 - 释放/完成任务
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { taskRegistry } from '../../runtime/taskRegistry.js';
import type { SubAgentResult, SubAgentStatus } from '../../runtime/parallelTypes.js';

interface AgentTaskReleaseParams {
  taskId: string;
  status: SubAgentStatus;
  result?: SubAgentResult;
}

interface AgentTaskReleaseResult {
  taskId: string;
  released: boolean;
  finalStatus: string;
}

export async function agentTaskRelease(params: AgentTaskReleaseParams): Promise<ToolResult<AgentTaskReleaseResult>> {
  const { taskId, status, result } = params;

  if (!taskId) {
    return error({
      type: 'page',
      message: '缺少必要参数：taskId',
      suggestion: '请指定任务 ID',
      retryable: false,
    });
  }

  try {
    // 更新任务状态
    await taskRegistry.updateStatus(taskId, status);

    // 如果有结果，完成任务
    if (result) {
      await taskRegistry.complete(taskId, result);
    }

    return success(
      {
        taskId,
        released: true,
        finalStatus: status,
      },
      `任务 ${taskId} 已${result ? '完成' : '释放'}，状态：${status}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error({
      type: 'network',
      message: `释放任务失败：${message}`,
      suggestion: '检查任务 ID 是否正确',
      retryable: false,
    });
  }
}

/**
 * agent_result_merge 工具 - 合并多个子 Agent 结果
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { taskRegistry } from '../../runtime/taskRegistry.js';
import { mergeSubAgentResults } from '../../runtime/summaryProtocol.js';
import type { SubAgentResult } from '../../runtime/parallelTypes.js';

interface AgentResultMergeParams {
  taskIds?: string[];
  statusFilter?: 'completed' | 'failed';
}

interface AgentResultMergeResult {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  overall_summary: string;
  key_findings: string[];
  merged_site_facts: Array<{ domain: string; facts: string[] }>;
  total_tokens_estimated: number;
  task_details: Array<{
    id: string;
    goal: string;
    status: string;
    summary: string;
    key_findings: string[];
  }>;
}

export async function agentResultMerge(params: AgentResultMergeParams = {}): Promise<ToolResult<AgentResultMergeResult>> {
  const { taskIds, statusFilter } = params;

  try {
    // 获取任务列表
    let tasks;
    if (taskIds && taskIds.length > 0) {
      tasks = await Promise.all(taskIds.map(id => taskRegistry.getTask(id)));
      tasks = tasks.filter((t): t is NonNullable<typeof t> => t !== null);
    } else {
      tasks = await taskRegistry.listTasks(statusFilter as any);
    }

    if (tasks.length === 0) {
      return success(
        {
          total_tasks: 0,
          completed_tasks: 0,
          failed_tasks: 0,
          overall_summary: '无任务可合并',
          key_findings: [],
          merged_site_facts: [],
          total_tokens_estimated: 0,
          task_details: [],
        },
        '没有找到任务'
      );
    }

    // 获取任务结果
    const resultsWithGoal: Array<{ id: string; goal: string; result: SubAgentResult }> = [];
    for (const task of tasks) {
      const result = await taskRegistry.getResult(task.id);
      if (result) {
        resultsWithGoal.push({
          id: task.id,
          goal: task.goal,
          result,
        });
      }
    }

    if (resultsWithGoal.length === 0) {
      return success(
        {
          total_tasks: tasks.length,
          completed_tasks: 0,
          failed_tasks: 0,
          overall_summary: `共 ${tasks.length} 个任务，但尚未完成`,
          key_findings: [],
          merged_site_facts: [],
          total_tokens_estimated: 0,
          task_details: tasks.map(t => ({
            id: t.id,
            goal: t.goal,
            status: t.status,
            summary: '任务进行中',
            key_findings: [],
          })),
        },
        '任务尚未完成，无法合并结果'
      );
    }

    // 合并结果
    const summary = mergeSubAgentResults(resultsWithGoal);

    return success(
      summary,
      summary.overall_summary
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error({
      type: 'network',
      message: `合并结果失败：${message}`,
      suggestion: '检查任务注册表是否可读',
      retryable: false,
    });
  }
}

/**
 * Phase 4: 并行分治层类型定义
 */

import type { SiteFact } from '../knowledge/store.js';
import type { ChannelType } from '../shared/types.js';

/**
 * 子 Agent 任务状态
 */
export type SubAgentStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 子 Agent 任务定义
 */
export interface SubAgentTask {
  /** 任务 ID */
  id: string;
  /** 任务目标 */
  goal: string;
  /** 成功标准 */
  successCriteria: string[];
  /** 分配的端口（可选） */
  allocatedPort?: number;
  /** 目标域名 */
  domain?: string;
  /** 允许的通道范围 */
  allowedChannels: ChannelType[];
  /** Token 预算 */
  tokenBudget: number;
  /** 状态 */
  status: SubAgentStatus;
  /** 创建时间 */
  createdAt: number;
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 子 Agent 返回结果
 */
export interface SubAgentResult {
  /** 状态 */
  status: SubAgentStatus;
  /** 目标是否达成 */
  goal_met: boolean;
  /** 一句话摘要 */
  summary: string;
  /** 关键发现 */
  key_findings: string[];
  /** 新发现的站点经验 */
  new_site_facts: Array<{
    domain: string;
    fact: string;
    confidence: SiteFact['status'];
  }>;
  /** 估算 token 数 */
  estimated_tokens: number;
  /** artifacts 文件路径 */
  artifacts: string[];
}

/**
 * 主 Agent 摘要协议
 */
export interface MainAgentSummary {
  /** 任务总数 */
  total_tasks: number;
  /** 完成数 */
  completed_tasks: number;
  /** 失败数 */
  failed_tasks: number;
  /** 总体摘要 */
  overall_summary: string;
  /** 关键发现汇总 */
  key_findings: string[];
  /** 合并后的站点经验 */
  merged_site_facts: Array<{
    domain: string;
    facts: string[];
  }>;
  /** 总 token 消耗估算 */
  total_tokens_estimated: number;
  /** 各任务详情 */
  task_details: Array<{
    id: string;
    goal: string;
    status: SubAgentStatus;
    summary: string;
    key_findings: string[];
  }>;
}

/**
 * 端口注册中心接口
 */
export interface PortRegistry {
  /** 分配端口 */
  allocate(count: number): Promise<number[]>;
  /** 释放端口 */
  release(port: number): Promise<boolean>;
  /** 更新心跳 */
  heartbeat(port: number): Promise<boolean>;
  /** 获取已分配端口列表 */
  getAllocatedPorts(): Promise<Array<{ port: number; agentId?: string; allocatedAt: number }>>;
}

/**
 * 任务注册中心接口
 */
export interface TaskRegistry {
  /** 注册任务 */
  register(task: SubAgentTask): Promise<string>;
  /** 更新任务状态 */
  updateStatus(taskId: string, status: SubAgentStatus, error?: string): Promise<void>;
  /** 获取任务详情 */
  getTask(taskId: string): Promise<SubAgentTask | null>;
  /** 列出所有任务 */
  listTasks(status?: SubAgentStatus): Promise<SubAgentTask[]>;
  /** 完成任务 */
  complete(taskId: string, result: SubAgentResult): Promise<void>;
  /** 获取任务结果 */
  getResult(taskId: string): Promise<SubAgentResult | null>;
}

/**
 * 子 Agent Prompt 模板
 */
export interface SubAgentPromptTemplate {
  /** 任务目标 */
  goal: string;
  /** 成功标准 */
  success_criteria: string[];
  /** 允许的操作范围 */
  allowed_actions: string[];
  /** 禁止的操作范围 */
  forbidden_actions: string[];
  /** 输出格式要求 */
  output_format: string;
  /** 上下文传递规则 */
  context_rules: {
    /** 必须传递 */
    must_pass: string[];
    /** 不应传递 */
    should_not_pass: string[];
  };
}

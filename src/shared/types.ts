/**
 * Web Agent Plugin 统一类型定义
 */

/**
 * 通道类型
 */
export type ChannelType = 'static' | 'browser' | 'automation' | 'devtools';

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 站点经验状态
 */
export type SiteFactStatus = 'verified' | 'suspected' | 'stale' | 'invalid';

/**
 * 错误类型
 */
export type ErrorType = 'network' | 'page' | 'antibot' | 'not_found';

/**
 * 统一工具返回结构
 */
export interface ToolResult<T = unknown> {
  /** 是否成功 */
  ok: boolean;
  /** 语义摘要 */
  summary: string;
  /** 结构化数据（小结果直接返回） */
  data?: T;
  /** 大资源文件路径列表（截图、trace 等） */
  artifacts?: string[];
  /** 警告信息 */
  warnings?: string[];
  /** 下一步建议 */
  next_suggestion?: string;
}

/**
 * 错误信息结构
 */
export interface ToolError {
  /** 错误类型 */
  type: ErrorType;
  /** 错误消息 */
  message: string;
  /** 建议的下一步操作 */
  suggestion: string;
  /** 是否可重试 */
  retryable: boolean;
  /** 重试延迟（毫秒） */
  retry_delay_ms?: number;
}

/**
 * 站点经验条目
 */
export interface SiteFact {
  /** 经验事实 */
  fact: string;
  /** 验证日期 */
  verified: string;
  /** TTL 天数 */
  ttl_days: number;
  /** 状态 */
  status: SiteFactStatus;
}

/**
 * 站点经验文件结构
 */
export interface SitePatterns {
  /** 主域名 */
  domain: string;
  /** 别名列表 */
  aliases: string[];
  /** Schema 版本 */
  schema_version: number;
  /** 经验条目列表 */
  entries: SiteFact[];
}

/**
 * Token 预算配置
 */
export interface TokenBudget {
  /** 软限制（触发摘要） */
  soft_limit: number;
  /** 硬限制（强制摘要） */
  hard_limit: number;
  /** 当前估算 */
  estimated: number;
}

/**
 * 端口注册信息
 */
export interface PortRegistration {
  /** 端口号 */
  port: number;
  /** Chrome 实例 ID */
  chrome_id: string;
  /** 分配给哪个 Agent */
  agent_id?: string;
  /** 分配时间戳 */
  allocated_at: number;
  /** 最后心跳时间戳 */
  last_heartbeat: number;
}

/**
 * 子 Agent 任务返回结构
 */
export interface SubAgentResult {
  /** 状态 */
  status: TaskStatus;
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
    confidence: SiteFactStatus;
  }>;
  /** 估算 token 数 */
  estimated_tokens: number;
  /**  artifacts 文件路径 */
  artifacts: string[];
}

/**
 * 通道选择上下文
 */
export interface ChannelContext {
  /** 任务类型 */
  task_type: string;
  /** 目标 URL（已知时） */
  url?: string;
  /** 是否需要登录态 */
  requires_auth?: boolean;
  /** 是否已知有反爬 */
  has_antibot?: boolean;
  /** 是否是开发者任务 */
  is_dev_task?: boolean;
  /** 目标域名 */
  domain?: string;
}

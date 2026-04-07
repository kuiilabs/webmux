/**
 * Web Agent Plugin 常量定义
 */

/**
 * CDP Proxy 默认配置
 */
export const CDP_PROXY = {
  /** 默认端口 */
  DEFAULT_PORT: 3456,
  /** 端口范围起始 */
  PORT_RANGE_START: 9222,
  /** 端口范围结束 */
  PORT_RANGE_END: 9299,
  /** 心跳超时（毫秒） */
  HEARTBEAT_TIMEOUT_MS: 30000,
} as const;

/**
 * Token 预算配置
 */
export const TOKEN_BUDGET = {
  /** 软限制（触发摘要） */
  SOFT_LIMIT: 2000,
  /** 硬限制（强制摘要） */
  HARD_LIMIT: 8000,
  /** 禁止全量返回 */
  MAX_LIMIT: 20000,
} as const;

/**
 * 重试配置
 */
export const RETRY = {
  /** 网络错误最大重试次数 */
  NETWORK_MAX_RETRIES: 3,
  /** 指数退避基数（毫秒） */
  BACKOFF_BASE_MS: 1000,
  /** 最大退避时间（毫秒） */
  MAX_BACKOFF_MS: 10000,
} as const;

/**
 * Jina 配置
 */
export const JINA = {
  /** RPM 上限 */
  RPM_LIMIT: 20,
  /** 熔断阈值（百分比） */
  CIRCUIT_BREAKER_THRESHOLD: 0.8,
  /** 滑动窗口大小（秒） */
  SLIDING_WINDOW_SIZE: 60,
} as const;

/**
 * 通道优先级（数值越小优先级越高）
 */
export const CHANNEL_PRIORITY = {
  static: 1,
  browser: 2,
  automation: 3,
  devtools: 4,
} as const;

/**
 * 端口注册文件路径
 */
export const PORT_REGISTRY_FILE =
  process.env.HOME + '/.cache/web-agent/ports.json';

/**
 * 站点经验目录
 */
export const SITE_PATTERNS_DIR = 'references/site-patterns';

/**
 * 默认超时配置
 */
export const TIMEOUT = {
  /** 页面加载超时（毫秒） */
  PAGE_LOAD_MS: 30000,
  /** 脚本执行超时（毫秒） */
  EVAL_MS: 10000,
  /** 网络请求超时（毫秒） */
  NETWORK_MS: 15000,
} as const;

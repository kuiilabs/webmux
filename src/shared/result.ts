/**
 * Web Agent Plugin 统一结果构造器
 */

import type { ToolResult, ToolError } from './types.js';

/**
 * 成功结果构造器
 */
export function success<T>(data: T, summary: string): ToolResult<T> {
  return {
    ok: true,
    summary,
    data,
  };
}

/**
 * 成功结果（带 artifacts）
 */
export function successWithArtifacts<T>(
  data: T,
  summary: string,
  artifacts: string[]
): ToolResult<T> {
  return {
    ok: true,
    summary,
    data,
    artifacts,
  };
}

/**
 * 错误结果构造器
 */
export function error(err: ToolError): ToolResult<never> {
  return {
    ok: false,
    summary: `错误：${err.message}`,
    warnings: [err.suggestion],
  };
}

/**
 * 网络错误快速构造
 */
export function networkError(message: string, retryable = true): ToolError {
  return {
    type: 'network',
    message,
    suggestion: '将尝试降级到其他通道或稍后重试',
    retryable,
    retry_delay_ms: retryable ? 1000 : undefined,
  };
}

/**
 * 页面错误快速构造
 */
export function pageError(message: string): ToolError {
  return {
    type: 'page',
    message,
    suggestion: '将尝试其他提取方式或通道',
    retryable: false,
  };
}

/**
 * 反爬错误快速构造
 */
export function antibotError(message: string): ToolError {
  return {
    type: 'antibot',
    message,
    suggestion: '将切换到 GUI 交互模式或放慢请求节奏',
    retryable: false,
  };
}

/**
 * 内容不存在错误快速构造
 */
export function notFoundError(message: string): ToolError {
  return {
    type: 'not_found',
    message,
    suggestion: '目标内容确实不存在，建议确认信息来源',
    retryable: false,
  };
}

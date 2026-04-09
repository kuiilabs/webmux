/**
 * 错误分类器
 * 将错误分类为四类：网络错误、页面错误、反爬错误、内容不存在
 */

import type { ErrorType, ToolError } from '../shared/types.js';

/**
 * 错误特征关键词
 */
const ERROR_PATTERNS: Record<ErrorType, RegExp[]> = {
  // 网络错误
  network: [
    /ETIMEDOUT|ESOCKETTIMEDOUT|timeout/i,
    /ENOTFOUND|EAI_AGAIN/i,
    /ECONNREFUSED|ECONNRESET/i,
    /ERR_CONNECTION_.+/i,
    /network error/i,
    /fetch failed/i,
    /429|Too Many Requests/i,
  ],
  // 页面错误
  page: [
    /element not found|no such element/i,
    /selector/i,
    /DOMException|TypeError/i,
    /cannot read property/i,
    /undefined is not a function/i,
  ],
  // 反爬错误
  antibot: [
    /captcha|验证 | 滑块 | 验证码/i,
    /access denied|禁止访问/i,
    /rate limit/i,
    /suspicious activity|异常行为/i,
    /please verify/i,
    /cloudflare|cf-|__cfduid/i,
    /waf|防火墙/i,
    /人机验证|机器人/i,
  ],
  // 内容不存在
  not_found: [
    /404|Not Found/i,
    /page not found|页面不存在/i,
    /content unavailable|内容不可用/i,
    /已删除|已注销/i,
    /does not exist/i,
    /gone/i,
  ],
};

/**
 * HTTP 状态码到错误类型的映射
 */
const HTTP_STATUS_MAP: Record<number, ErrorType> = {
  404: 'not_found',
  410: 'not_found',
  401: 'antibot',
  403: 'antibot',
  429: 'network', // 限流，可重试
  502: 'network',
  503: 'network',
  504: 'network',
};

/**
 * 建议话术模板
 */
const SUGGESTIONS: Record<ErrorType, string> = {
  network: '将尝试降级到其他通道或稍后重试',
  page: '将尝试其他提取方式或通道',
  antibot: '将切换到 GUI 交互模式或放慢请求节奏',
  not_found: '目标内容确实不存在，建议确认信息来源',
};

/**
 * 错误分类器类
 */
export class ErrorClassifier {
  /**
   * 分类错误
   */
  static classify(error: unknown): ToolError {
    const message = this.extractMessage(error);
    const statusCode = this.extractStatusCode(error);

    // 优先从 HTTP 状态码判断
    if (statusCode && HTTP_STATUS_MAP[statusCode]) {
      return this.createError(HTTP_STATUS_MAP[statusCode], message);
    }

    // 从错误消息匹配
    for (const [type, patterns] of Object.entries(ERROR_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          return this.createError(type as ErrorType, message);
        }
      }
    }

    // 默认归类为网络错误（可重试）
    return this.createError('network', message);
  }

  /**
   * 从错误对象提取消息
   */
  private static extractMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as Record<string, unknown>).message);
    }
    return String(error);
  }

  /**
   * 从错误对象提取 HTTP 状态码
   */
  private static extractStatusCode(error: unknown): number | null {
    if (error && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      if (typeof err.status === 'number') return err.status;
      if (typeof err.statusCode === 'number') return err.statusCode;
      if (typeof err.code === 'number') return err.code;
    }

    const message = this.extractMessage(error);
    const httpMatch = message.match(/\bHTTP\s+(\d{3})\b/i) || message.match(/\bstatus\s+(\d{3})\b/i);
    if (httpMatch) {
      return parseInt(httpMatch[1], 10);
    }

    return null;
  }

  /**
   * 创建标准化错误对象
   */
  private static createError(type: ErrorType, message: string): ToolError {
    const isRetryable = type === 'network';
    const retryDelay = isRetryable ? 1000 : undefined;

    return {
      type,
      message,
      suggestion: SUGGESTIONS[type],
      retryable: isRetryable,
      retry_delay_ms: retryDelay,
    };
  }

  /**
   * 判断是否需要切换通道
   */
  static shouldSwitchChannel(error: ToolError): boolean {
    // 页面错误和反爬错误需要切换通道
    return error.type === 'page' || error.type === 'antibot';
  }

  /**
   * 判断是否可以直接重试
   */
  static canRetry(error: ToolError): boolean {
    return error.retryable;
  }
}

export const errorClassifier = ErrorClassifier;

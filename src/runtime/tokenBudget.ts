/**
 * Token 预算控制器
 * 估算 token 消耗，触发摘要和裁剪
 */

import { TOKEN_BUDGET } from '../shared/constants.js';

/**
 * Token 估算结果
 */
export interface TokenEstimate {
  /** 估算的 token 数量 */
  estimated: number;
  /** 是否超过软限制 */
  exceedsSoftLimit: boolean;
  /** 是否超过硬限制 */
  exceedsHardLimit: boolean;
  /** 是否超过最大限制 */
  exceedsMaxLimit: boolean;
  /** 建议的处理策略 */
  strategy: TokenStrategy;
}

/**
 * Token 处理策略
 */
export type TokenStrategy =
  | 'return_full'      // 直接返回全文
  | 'summarize'        // 生成摘要
  | 'extract_main'     // 提取主要内容
  | 'chunked'          // 分块处理
  | 'reject';          // 拒绝处理

/**
 * Token 预算控制器类
 */
export class TokenBudgetController {
  /**
   * 估算字符串的 token 数
   * 粗略估算：字符数 / 4
   */
  static estimate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * 估算对象（JSON）的 token 数
   */
  static estimateObject(obj: unknown): number {
    if (!obj) return 0;
    try {
      const json = JSON.stringify(obj);
      return this.estimate(json);
    } catch {
      return TOKEN_BUDGET.MAX_LIMIT + 1;
    }
  }

  /**
   * 检查 token 预算并返回处理策略
   */
  static check(text: string, customLimits?: Partial<typeof TOKEN_BUDGET>): TokenEstimate {
    const limits = { ...TOKEN_BUDGET, ...customLimits };
    const estimated = this.estimate(text);

    const exceedsSoftLimit = estimated > limits.SOFT_LIMIT;
    const exceedsHardLimit = estimated > limits.HARD_LIMIT;
    const exceedsMaxLimit = estimated > limits.MAX_LIMIT;

    let strategy: TokenStrategy = 'return_full';

    if (exceedsMaxLimit) {
      strategy = 'reject';
    } else if (exceedsHardLimit) {
      strategy = 'chunked';
    } else if (exceedsSoftLimit) {
      strategy = 'extract_main';
    }

    return {
      estimated,
      exceedsSoftLimit,
      exceedsHardLimit,
      exceedsMaxLimit,
      strategy,
    };
  }

  /**
   * 根据策略处理文本
   */
  static async process(
    text: string,
    strategy: TokenStrategy,
    options?: ProcessOptions
  ): Promise<ProcessedResult> {
    switch (strategy) {
      case 'return_full':
        return { text, truncated: false, summary: null };

      case 'summarize':
        return this.summarize(text, options);

      case 'extract_main':
        return this.extractMainContent(text, options);

      case 'chunked':
        return this.chunkText(text, options);

      case 'reject':
        return {
          text: null,
          truncated: true,
          summary: '内容过长，无法处理',
          chunks: undefined,
        };

      default:
        return { text, truncated: false, summary: null };
    }
  }

  /**
   * 生成摘要（简化版：取前 N 个字符）
   * 实际实现时应该调用 LLM
   */
  private static summarize(text: string, options?: ProcessOptions): ProcessedResult {
    const maxLength = options?.summaryMaxLength || 500;
    const summary = text.length > maxLength
      ? text.slice(0, maxLength) + '...'
      : text;

    return {
      text: summary,
      truncated: text.length > maxLength,
      summary,
    };
  }

  /**
   * 提取主要内容（简化版：按段落截取）
   * 实际实现时应该用启发式算法或 LLM
   */
  private static extractMainContent(text: string, options?: ProcessOptions): ProcessedResult {
    const maxParagraphs = options?.maxParagraphs || 10;
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

    if (paragraphs.length <= maxParagraphs) {
      return { text, truncated: false, summary: null };
    }

    const selectedParagraphs = paragraphs.slice(0, maxParagraphs);
    const text_ = selectedParagraphs.join('\n\n');
    const summary = `[已提取前 ${maxParagraphs} 个段落，共 ${paragraphs.length} 段]`;

    return {
      text: text_,
      truncated: true,
      summary,
      totalParagraphs: paragraphs.length,
      selectedParagraphs: maxParagraphs,
    };
  }

  /**
   * 分块处理大文本
   */
  private static chunkText(text: string, options?: ProcessOptions): ProcessedResult {
    const chunkSize = options?.chunkSize || 2000; // 字符数
    const chunks: string[] = [];

    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }

    return {
      text: null,
      truncated: false,
      summary: `内容已分块，共 ${chunks.length} 个区块`,
      chunks,
    };
  }
}

/**
 * 处理选项
 */
export interface ProcessOptions {
  /** 摘要最大长度 */
  summaryMaxLength?: number;
  /** 最大段落数 */
  maxParagraphs?: number;
  /** 分块大小 */
  chunkSize?: number;
}

/**
 * 处理结果
 */
export interface ProcessedResult {
  /** 处理后的文本（可能为 null） */
  text: string | null;
  /** 是否被裁剪 */
  truncated: boolean;
  /** 摘要说明 */
  summary: string | null;
  /** 分块结果（仅 chunked 策略） */
  chunks?: string[];
  /** 总段落数（仅 extract_main 策略） */
  totalParagraphs?: number;
  /** 选中段落数（仅 extract_main 策略） */
  selectedParagraphs?: number;
}

export const tokenBudget = TokenBudgetController;

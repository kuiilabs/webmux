/**
 * site_patterns_invalidate 工具 - 标记站点经验失效
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { invalidateSiteFact, readSitePatterns } from '../../knowledge/store.js';

interface SitePatternsInvalidateParams {
  domain: string;
  factPattern: string;
  exactMatch?: boolean;
}

interface SitePatternsInvalidateResult {
  domain: string;
  factPattern: string;
  invalidatedCount: number;
  success: boolean;
}

export async function sitePatternsInvalidate(params: SitePatternsInvalidateParams): Promise<ToolResult<SitePatternsInvalidateResult>> {
  const { domain, factPattern, exactMatch = false } = params;

  if (!domain) {
    return error({
      type: 'page',
      message: '缺少必要参数：domain',
      suggestion: '请指定域名',
      retryable: false,
    });
  }

  if (!factPattern) {
    return error({
      type: 'page',
      message: '缺少必要参数：factPattern',
      suggestion: '请指定要失效的经验模式（关键词或正则）',
      retryable: false,
    });
  }

  try {
    // 检查是否存在该域名的经验
    const existing = readSitePatterns(domain);
    if (!existing) {
      return success(
        {
          domain,
          factPattern,
          invalidatedCount: 0,
          success: false,
        },
        `域名 ${domain} 没有站点经验`
      );
    }

    // 计算匹配的经验数量
    let matchCount = 0;
    if (exactMatch) {
      matchCount = existing.entries.filter(e => e.fact === factPattern).length;
    } else {
      matchCount = existing.entries.filter(e =>
        e.fact.toLowerCase().includes(factPattern.toLowerCase())
      ).length;
    }

    if (matchCount === 0) {
      return success(
        {
          domain,
          factPattern,
          invalidatedCount: 0,
          success: false,
        },
        `未找到匹配的经验 "${factPattern}"`
      );
    }

    // 标记失效
    const pattern = exactMatch
      ? factPattern
      : new RegExp(factPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const success_ = invalidateSiteFact(domain, pattern);

    return success(
      {
        domain,
        factPattern,
        invalidatedCount: success_ ? matchCount : 0,
        success: success_,
      },
      success_
        ? `已标记 ${matchCount} 条经验失效`
        : `标记失败，请检查文件权限`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error({
      type: 'network',
      message: `标记经验失效失败：${message}`,
      suggestion: '检查站点经验文件是否可写',
      retryable: true,
      retry_delay_ms: 1000,
    });
  }
}

/**
 * site_patterns_read 工具 - 读取单个站点经验
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { readSitePatterns, type SiteFact } from '../../knowledge/store.js';
import { getDaysOverdue } from '../../knowledge/ttl.js';

interface SitePatternsReadParams {
  domain: string;
  statusFilter?: Array<'verified' | 'suspected' | 'stale' | 'invalid'>;
}

interface SitePatternsReadResult {
  domain: string;
  aliases: string[];
  schema_version: number;
  updated: string;
  entries: Array<SiteFact & {
    daysOverdue?: number;
    warning?: string;
  }>;
  summary: {
    total: number;
    verified: number;
    suspected: number;
    stale: number;
    invalid: number;
  };
}

export async function sitePatternsRead(params: SitePatternsReadParams): Promise<ToolResult<SitePatternsReadResult>> {
  const { domain, statusFilter } = params;

  if (!domain) {
    return error({
      type: 'page',
      message: '缺少必要参数：domain',
      suggestion: '请指定要读取的域名',
      retryable: false,
    });
  }

  try {
    const patterns = readSitePatterns(domain);

    if (!patterns) {
      return success(
        {
          domain,
          aliases: [],
          schema_version: 0,
          updated: '',
          entries: [],
          summary: { total: 0, verified: 0, suspected: 0, stale: 0, invalid: 0 },
        },
        `未找到域名 ${domain} 的站点经验`
      );
    }

    // 过滤状态
    let entries = patterns.entries;
    if (statusFilter && statusFilter.length > 0) {
      entries = entries.filter(e => statusFilter.includes(e.status));
    }

    // 添加警告信息
    const enrichedEntries = entries.map(entry => {
      const enriched: SiteFact & { daysOverdue?: number; warning?: string } = { ...entry };

      if (entry.status === 'stale') {
        const daysOverdue = getDaysOverdue(entry);
        enriched.daysOverdue = daysOverdue;
        enriched.warning = `已过期 ${daysOverdue} 天，建议验证后更新`;
      } else if (entry.status === 'suspected') {
        enriched.warning = '此经验未经充分验证，请谨慎参考';
      }

      return enriched;
    });

    // 统计
    const summary = {
      total: patterns.entries.length,
      verified: patterns.entries.filter(e => e.status === 'verified').length,
      suspected: patterns.entries.filter(e => e.status === 'suspected').length,
      stale: patterns.entries.filter(e => e.status === 'stale').length,
      invalid: patterns.entries.filter(e => e.status === 'invalid').length,
    };

    // 生成摘要
    let summaryText = `读取 ${domain} 的站点经验`;
    if (patterns.entries.length > 0) {
      summaryText += `，共 ${patterns.entries.length} 条`;
      if (summary.verified > 0) summaryText += `（${summary.verified} 条有效`;
      if (summary.stale > 0) summaryText += `, ${summary.stale} 条过期`;
      if (summary.verified > 0) summaryText += ')';
    }

    return success(
      {
        domain: patterns.domain,
        aliases: patterns.aliases,
        schema_version: patterns.schema_version,
        updated: patterns.updated,
        entries: enrichedEntries,
        summary,
      },
      summaryText
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error({
      type: 'network',
      message: `读取站点经验失败：${message}`,
      suggestion: '检查站点经验文件是否存在',
      retryable: false,
    });
  }
}

/**
 * site_patterns_write 工具 - 写入新的站点经验
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { addSiteFact, readSitePatterns, writeSitePatterns } from '../../knowledge/store.js';
import { suggestTtl } from '../../knowledge/ttl.js';

interface SitePatternsWriteParams {
  domain: string;
  fact: string;
  status?: 'verified' | 'suspected';
  ttl_days?: number;
  aliases?: string[];
}

interface SitePatternsWriteResult {
  domain: string;
  fact: string;
  status: string;
  written: boolean;
  totalEntries: number;
}

export async function sitePatternsWrite(params: SitePatternsWriteParams): Promise<ToolResult<SitePatternsWriteResult>> {
  const { domain, fact, status = 'verified', ttl_days, aliases } = params;

  if (!domain) {
    return error({
      type: 'page',
      message: '缺少必要参数：domain',
      suggestion: '请指定域名',
      retryable: false,
    });
  }

  if (!fact) {
    return error({
      type: 'page',
      message: '缺少必要参数：fact',
      suggestion: '请指定要写入的经验事实',
      retryable: false,
    });
  }

  // 自动建议 TTL
  const autoTtl = ttl_days || suggestTtl(fact);

  try {
    // 检查是否已存在相似经验
    const existing = readSitePatterns(domain);
    if (existing) {
      const similar = existing.entries.find(e =>
        e.fact.toLowerCase().includes(fact.toLowerCase().substring(0, 20)) ||
        fact.toLowerCase().includes(e.fact.toLowerCase().substring(0, 20))
      );

      if (similar) {
        return success(
          {
            domain,
            fact,
            status: similar.status,
            written: false,
            totalEntries: existing.entries.length,
          },
          `发现相似经验已存在（状态：${similar.status}），未重复写入`
        );
      }
    }

    // 写入新经验
    const success_ = addSiteFact(domain, fact, autoTtl, status);

    // 如果有 aliases，更新
    if (aliases && aliases.length > 0) {
      const patterns = readSitePatterns(domain);
      if (patterns) {
        patterns.aliases = [...new Set([...(patterns.aliases || []), ...aliases])];
        writeSitePatterns(domain, patterns);
      }
    }

    const updatedPatterns = readSitePatterns(domain);

    return success(
      {
        domain,
        fact,
        status,
        written: success_,
        totalEntries: updatedPatterns?.entries.length || 0,
      },
      `已写入新经验${success_ ? `（TTL: ${autoTtl}天，当前共 ${updatedPatterns?.entries.length || 0} 条）` : '失败'}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error({
      type: 'network',
      message: `写入站点经验失败：${message}`,
      suggestion: '检查站点经验目录是否可写',
      retryable: true,
      retry_delay_ms: 1000,
    });
  }
}

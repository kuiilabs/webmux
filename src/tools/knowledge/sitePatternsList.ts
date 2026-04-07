/**
 * site_patterns_list 工具 - 列出所有站点经验
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { listSitePatterns, readSitePatterns } from '../../knowledge/store.js';

interface SitePatternsListParams {
  domain?: string;
  includeStats?: boolean;
}

interface SitePatternsListResult {
  patterns: Array<{
    domain: string;
    entriesCount: number;
    verifiedCount: number;
    staleCount: number;
    lastUpdated: string;
  }>;
  total: number;
}

export async function sitePatternsList(params: SitePatternsListParams = {}): Promise<ToolResult<SitePatternsListResult>> {
  const { domain } = params;

  try {
    if (domain) {
      // 查询单个域名的详细信息
      const patterns = readSitePatterns(domain);
      if (!patterns) {
        return success(
          { patterns: [], total: 0 },
          `未找到域名 ${domain} 的站点经验`
        );
      }

      const verifiedCount = patterns.entries.filter(e => e.status === 'verified').length;
      const staleCount = patterns.entries.filter(e => e.status === 'stale').length;

      return success(
        {
          patterns: [{
            domain: patterns.domain,
            entriesCount: patterns.entries.length,
            verifiedCount,
            staleCount,
            lastUpdated: patterns.updated,
          }],
          total: 1,
        },
        `找到 ${patterns.entries.length} 条经验（${verifiedCount} 条有效，${staleCount} 条过期）`
      );
    }

    // 列出所有域名
    const list = listSitePatterns();
    const patterns: SitePatternsListResult['patterns'] = [];

    for (const item of list) {
      const patternsData = readSitePatterns(item.domain);
      if (!patternsData) continue;

      const verifiedCount = patternsData.entries.filter(e => e.status === 'verified').length;
      const staleCount = patternsData.entries.filter(e => e.status === 'stale').length;

      patterns.push({
        domain: item.domain,
        entriesCount: patternsData.entries.length,
        verifiedCount,
        staleCount,
        lastUpdated: patternsData.updated,
      });
    }

    // 按更新时间排序
    patterns.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

    return success(
      {
        patterns,
        total: patterns.length,
      },
      `共发现 ${patterns.length} 个站点的经验`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error({
      type: 'network',
      message: `列出站点经验失败：${message}`,
      suggestion: '检查站点经验目录是否存在',
      retryable: false,
    });
  }
}

/**
 * site_patterns_write 工具 - 写入新的站点经验
 */

import { success, error } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { addSiteFact, readSitePatterns, writeSitePatterns } from '../../knowledge/store.js';
import { suggestTtl } from '../../knowledge/ttl.js';
import { SECURITY_LIMITS, validateDomain, validateTtlDays, validateAliases, ensureTextLength } from '../../shared/security.js';

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

  // 验证 domain
  let validatedDomain: string;
  try {
    validatedDomain = validateDomain(domain);
  } catch (err) {
    return error({
      type: 'page',
      message: `domain 参数无效：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '请提供合法的域名格式（如 example.com）',
      retryable: false,
    });
  }

  // 验证 fact
  let validatedFact: string;
  try {
    validatedFact = ensureTextLength('fact', fact, SECURITY_LIMITS.MAX_FACT_LENGTH);
  } catch (err) {
    return error({
      type: 'page',
      message: `fact 参数无效：${err instanceof Error ? err.message : String(err)}`,
      suggestion: `经验事实长度不能超过 ${SECURITY_LIMITS.MAX_FACT_LENGTH} 个字符`,
      retryable: false,
    });
  }

  // 验证 aliases
  let validatedAliases: string[];
  try {
    validatedAliases = validateAliases(aliases);
  } catch (err) {
    return error({
      type: 'page',
      message: `aliases 参数无效：${err instanceof Error ? err.message : String(err)}`,
      suggestion: `aliases 数量不能超过 ${SECURITY_LIMITS.MAX_ALIAS_COUNT}，每个别名不能超过 ${SECURITY_LIMITS.MAX_ALIAS_LENGTH} 字符`,
      retryable: false,
    });
  }

  // 验证 TTL
  let validatedTtl: number;
  try {
    validatedTtl = ttl_days ? validateTtlDays(ttl_days) : suggestTtl(validatedFact);
  } catch (err) {
    return error({
      type: 'page',
      message: `ttl_days 参数无效：${err instanceof Error ? err.message : String(err)}`,
      suggestion: `TTL 必须在 ${SECURITY_LIMITS.MIN_TTL_DAYS} 到 ${SECURITY_LIMITS.MAX_TTL_DAYS} 天之间`,
      retryable: false,
    });
  }

  try {
    // 检查是否已存在相似经验
    const existing = readSitePatterns(validatedDomain);
    if (existing) {
      const similar = existing.entries.find(e =>
        e.fact.toLowerCase().includes(validatedFact.toLowerCase().substring(0, 20)) ||
        validatedFact.toLowerCase().includes(e.fact.toLowerCase().substring(0, 20))
      );

      if (similar) {
        return success(
          {
            domain: validatedDomain,
            fact: validatedFact,
            status: similar.status,
            written: false,
            totalEntries: existing.entries.length,
          },
          `发现相似经验已存在（状态：${similar.status}），未重复写入`
        );
      }
    }

    // 写入新经验
    const success_ = addSiteFact(validatedDomain, validatedFact, validatedTtl, status);

    // 如果有 aliases，更新
    if (validatedAliases && validatedAliases.length > 0) {
      const patterns = readSitePatterns(validatedDomain);
      if (patterns) {
        patterns.aliases = [...new Set([...(patterns.aliases || []), ...validatedAliases])];
        writeSitePatterns(validatedDomain, patterns);
      }
    }

    const updatedPatterns = readSitePatterns(validatedDomain);

    return success(
      {
        domain: validatedDomain,
        fact: validatedFact,
        status,
        written: success_,
        totalEntries: updatedPatterns?.entries.length || 0,
      },
      `已写入新经验${success_ ? `（TTL: ${validatedTtl}天，当前共 ${updatedPatterns?.entries.length || 0} 条）` : '失败'}`
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

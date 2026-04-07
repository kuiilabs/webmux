/**
 * TTL 管理工具
 */

import { type SiteFact } from './store.js';

/**
 * 默认 TTL 配置（天）
 */
export const DEFAULT_TTL = {
  verified: 90,      // 已验证经验默认 90 天过期
  suspected: 30,     // 疑似经验 30 天过期
  stale: 180,        // 过期经验 180 天后清理
};

/**
 * 检查经验是否过期
 */
export function checkStale(fact: SiteFact): boolean {
  if (!fact.verified) return true;
  if (fact.status === 'invalid') return false; // 已失效的不需要再标记

  const verifiedDate = new Date(fact.verified);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24));

  return diffDays > fact.ttl_days;
}

/**
 * 获取过期天数
 */
export function getDaysOverdue(fact: SiteFact): number {
  if (!fact.verified) return 0;

  const verifiedDate = new Date(fact.verified);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays - fact.ttl_days);
}

/**
 * 计算建议的 TTL
 */
export function suggestTtl(category: string): number {
  const ttlMap: Record<string, number> = {
    // URL 模式类：相对稳定
    'url': 180,
    'pattern': 180,
    'parameter': 120,

    // 平台特征类：中等稳定
    '特征': 90,
    '架构': 90,
    '反爬': 60,

    // 登录态类：较稳定
    '登录': 120,
    'auth': 120,

    // 陷阱类：可能变化
    '陷阱': 60,
    '限制': 60,
  };

  // 关键词匹配
  for (const [keyword, ttl] of Object.entries(ttlMap)) {
    if (category.toLowerCase().includes(keyword.toLowerCase())) {
      return ttl;
    }
  }

  // 默认 TTL
  return DEFAULT_TTL.verified;
}

/**
 * 批量更新过期状态
 */
export function updateStaleStatus<T extends SiteFact>(facts: T[]): T[] {
  return facts.map(fact => {
    if (fact.status === 'invalid') return fact;
    if (checkStale(fact)) {
      return { ...fact, status: 'stale' as const };
    }
    return fact;
  });
}

/**
 * 获取即将过期的经验
 */
export function getExpiringSoon(facts: SiteFact[], warningDays: number = 7): SiteFact[] {
  return facts.filter(fact => {
    if (!fact.verified || fact.status === 'invalid') return false;
    const daysOverdue = getDaysOverdue(fact);
    return daysOverdue >= -warningDays && daysOverdue <= 0;
  });
}

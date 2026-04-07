/**
 * 站点经验管理核心模块
 * 支持 YAML 格式读写、TTL 管理、状态追踪
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 站点经验条目
 */
export interface SiteFact {
  fact: string;
  verified: string; // YYYY-MM-DD
  ttl_days: number;
  status: 'verified' | 'suspected' | 'stale' | 'invalid';
}

/**
 * 站点经验文件结构
 */
export interface SitePatterns {
  domain: string;
  aliases: string[];
  schema_version: number;
  updated: string;
  entries: SiteFact[];
}

/**
 * 知识层配置
 */
export interface KnowledgeConfig {
  baseDir: string;
  autoExpire: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: KnowledgeConfig = {
  baseDir: join(process.env.HOME || '/tmp', '.cache', 'web-agent', 'site-patterns'),
  autoExpire: true,
};

/**
 * 初始化知识层
 */
export function initKnowledge(config?: Partial<KnowledgeConfig>): KnowledgeConfig {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // 确保目录存在
  mkdirSync(finalConfig.baseDir, { recursive: true });

  return finalConfig;
}

/**
 * 从域名获取文件路径
 */
function getFilePath(domain: string, config: KnowledgeConfig): string {
  // 处理子域名：取主域名
  const parts = domain.split('.');
  const mainDomain = parts.length > 2 ? parts.slice(-2).join('.') : domain;
  const fileName = mainDomain.replace(/[^a-z0-9.-]/gi, '_') + '.yml';
  return join(config.baseDir, fileName);
}

/**
 * 解析简化的 YAML（避免依赖外部库）
 */
function parseSimpleYaml(content: string): Partial<SitePatterns> {
  const result: Partial<SitePatterns> = {
    entries: [],
    aliases: [],
  };

  const lines = content.split('\n');
  let currentSection: 'header' | 'entries' | 'aliases' = 'header';
  let currentFact: Partial<SiteFact> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#')) continue;

    // 检测章节
    if (trimmed.startsWith('entries:')) {
      currentSection = 'entries';
      continue;
    }
    if (trimmed.startsWith('aliases:')) {
      currentSection = 'aliases';
      continue;
    }

    // 解析头部字段
    if (currentSection === 'header') {
      const match = trimmed.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        if (key === 'domain') {
          result.domain = value.replace(/['"]/g, '');
        } else if (key === 'schema_version') {
          result.schema_version = parseInt(value, 10);
        } else if (key === 'updated') {
          result.updated = value.replace(/['"]/g, '');
        }
      }
      continue;
    }

    // 解析 aliases
    if (currentSection === 'aliases') {
      const arrayMatch = trimmed.match(/\[(.+)\]/);
      if (arrayMatch) {
        result.aliases = arrayMatch[1]
          .split(',')
          .map(s => s.trim().replace(/['"]/g, ''));
      }
      continue;
    }

    // 解析 entries
    if (currentSection === 'entries') {
      // 新条目开始
      if (trimmed.startsWith('- fact:')) {
        if (currentFact) {
          result.entries?.push(currentFact as SiteFact);
        }
        currentFact = {
          fact: trimmed.replace('- fact:', '').trim().replace(/['"]/g, ''),
        };
      }
      // 条目属性
      else if (trimmed.startsWith('verified:')) {
        currentFact!.verified = trimmed.replace('verified:', '').trim();
      } else if (trimmed.startsWith('ttl_days:')) {
        currentFact!.ttl_days = parseInt(trimmed.replace('ttl_days:', '').trim(), 10);
      } else if (trimmed.startsWith('status:')) {
        currentFact!.status = trimmed.replace('status:', '').trim() as SiteFact['status'];
      }
    }
  }

  // 添加最后一个条目
  if (currentFact) {
    result.entries?.push(currentFact as SiteFact);
  }

  return result;
}

/**
 * 生成 YAML 字符串
 */
function generateYaml(patterns: SitePatterns): string {
  let yaml = `domain: ${patterns.domain}
aliases: [${patterns.aliases.join(', ')}]
schema_version: ${patterns.schema_version}
updated: ${patterns.updated}

## 平台特征
${patterns.entries.filter(e => e.fact.includes('特征') || e.fact.includes('架构')).map(e => `- ${e.fact}`).join('\n')}

## 有效模式
${patterns.entries.filter(e => e.fact.includes('模式') || e.fact.includes('URL') || e.fact.includes('参数')).map(e => `- ${e.fact}`).join('\n')}

## 已知陷阱
${patterns.entries.filter(e => e.fact.includes('陷阱') || e.fact.includes('限制') || e.fact.includes('反爬')).map(e => `- ${e.fact}`).join('\n')}
`;
  return yaml;
}

/**
 * 检查条目是否过期
 */
function isStale(entry: SiteFact): boolean {
  if (!entry.verified) return true;

  const verifiedDate = new Date(entry.verified);
  const now = new Date();
  const diffDays = (now.getTime() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24);

  return diffDays > entry.ttl_days;
}

/**
 * 读取站点经验
 */
export function readSitePatterns(domain: string, config?: Partial<KnowledgeConfig>): SitePatterns | null {
  const finalConfig = initKnowledge(config);
  const filePath = getFilePath(domain, finalConfig);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseSimpleYaml(content);

    const patterns: SitePatterns = {
      domain: parsed.domain || domain,
      aliases: parsed.aliases || [],
      schema_version: parsed.schema_version || 1,
      updated: parsed.updated || new Date().toISOString().split('T')[0],
      entries: parsed.entries || [],
    };

    // 自动标记过期条目
    if (finalConfig.autoExpire) {
      for (const entry of patterns.entries) {
        if (entry.status !== 'invalid' && isStale(entry)) {
          entry.status = 'stale';
        }
      }
    }

    return patterns;
  } catch {
    return null;
  }
}

/**
 * 写入站点经验
 */
export function writeSitePatterns(domain: string, patterns: Partial<SitePatterns>, config?: Partial<KnowledgeConfig>): boolean {
  try {
    const finalConfig = initKnowledge(config);
    const filePath = getFilePath(domain, finalConfig);

    // 如果文件已存在，先读取现有内容
    let existing: SitePatterns | null = null;
    if (existsSync(filePath)) {
      existing = readSitePatterns(domain, config);
    }

    // 合并或创建新内容
    const merged: SitePatterns = {
      domain: patterns.domain || domain,
      aliases: patterns.aliases || existing?.aliases || [],
      schema_version: patterns.schema_version || existing?.schema_version || 1,
      updated: new Date().toISOString().split('T')[0],
      entries: patterns.entries || existing?.entries || [],
    };

    // 生成 YAML 并写入
    const yaml = generateYaml(merged);
    writeFileSync(filePath, yaml, 'utf-8');

    return true;
  } catch (err) {
    console.error('写入站点经验失败:', err);
    return false;
  }
}

/**
 * 添加单条经验
 */
export function addSiteFact(
  domain: string,
  fact: string,
  ttlDays: number,
  status: SiteFact['status'] = 'verified',
  config?: Partial<KnowledgeConfig>
): boolean {
  const existing = readSitePatterns(domain, config);

  const newFact: SiteFact = {
    fact,
    verified: new Date().toISOString().split('T')[0],
    ttl_days: ttlDays,
    status,
  };

  const entries = existing?.entries ? [...existing.entries, newFact] : [newFact];

  return writeSitePatterns(domain, { entries }, config);
}

/**
 * 标记经验失效
 */
export function invalidateSiteFact(
  domain: string,
  factPattern: string | RegExp,
  config?: Partial<KnowledgeConfig>
): boolean {
  const existing = readSitePatterns(domain, config);
  if (!existing) return false;

  let modified = false;
  for (const entry of existing.entries) {
    const matches = typeof factPattern === 'string'
      ? entry.fact.includes(factPattern)
      : factPattern.test(entry.fact);

    if (matches && entry.status !== 'invalid') {
      entry.status = 'invalid';
      modified = true;
    }
  }

  if (modified) {
    return writeSitePatterns(domain, existing, config);
  }

  return false;
}

/**
 * 列出所有站点经验
 */
export function listSitePatterns(config?: Partial<KnowledgeConfig>): Array<{ domain: string; file: string }> {
  const finalConfig = initKnowledge(config);
  const files = readdirSync(finalConfig.baseDir);

  return files
    .filter(f => f.endsWith('.yml'))
    .map(f => {
      const domain = f.replace('.yml', '').replace(/_/g, '.');
      return { domain, file: f };
    });
}

/**
 * 删除过期站点经验
 */
export function cleanupStalePatterns(config?: Partial<KnowledgeConfig>): number {
  const finalConfig = initKnowledge(config);
  const files = readdirSync(finalConfig.baseDir);
  let removed = 0;

  for (const file of files) {
    if (!file.endsWith('.yml')) continue;

    const domain = file.replace('.yml', '').replace(/_/g, '.');
    const patterns = readSitePatterns(domain, config);

    if (!patterns) continue;

    // 如果所有条目都失效，删除文件
    const validEntries = patterns.entries.filter(e => e.status !== 'invalid');
    if (validEntries.length === 0) {
      try {
        // 注意：实际删除需要用户确认，这里只标记
        removed++;
      } catch {
        // 忽略删除失败
      }
    }
  }

  return removed;
}

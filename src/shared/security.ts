/**
 * 统一安全辅助函数
 */

import { mkdirSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve } from 'path';

export const SECURITY_LIMITS = {
  MAX_URL_LENGTH: 4096,
  MAX_SCRIPT_LENGTH: 20000,
  MAX_SELECTOR_LENGTH: 1000,
  MAX_TEXT_LENGTH: 4000,
  MAX_INPUT_VALUE_LENGTH: 20000,
  MAX_WAIT_TIMEOUT_MS: 60000,
  MIN_POLL_INTERVAL_MS: 100,
  MAX_POLL_INTERVAL_MS: 5000,
  MAX_BROWSER_TARGETS: 20,
  MAX_PORT_ALLOC_COUNT: 8,
  MIN_TTL_DAYS: 1,
  MAX_TTL_DAYS: 365,
  MAX_FACT_LENGTH: 1000,
  MAX_ALIAS_COUNT: 20,
  MAX_ALIAS_LENGTH: 100,
  MAX_SUBAGENT_GOAL_LENGTH: 2000,
  MAX_SUCCESS_CRITERIA: 20,
  MAX_SUCCESS_CRITERION_LENGTH: 500,
  MAX_SUBAGENT_SUMMARY_LENGTH: 2000,
  MAX_KEY_FINDINGS: 20,
  MAX_KEY_FINDING_LENGTH: 500,
  MAX_ARTIFACTS: 20,
  MAX_ARTIFACT_PATH_LENGTH: 512,
  MAX_ESTIMATED_TOKENS: 200000,
  MAX_HTTP_RESPONSE_BYTES: 2_000_000,
  MAX_CACHE_ENTRIES: 32,
  MAX_RESULT_ITEMS: 100,
} as const;

const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/i;

export function serializeJsString(value: string): string {
  return JSON.stringify(value);
}

export function sanitizeFileComponent(value: string, fallback = 'value'): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
}

export function ensureTextLength(name: string, value: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${name} 必须是字符串`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} 不能为空`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${name} 长度不能超过 ${maxLength} 个字符`);
  }

  return trimmed;
}

export function ensureOptionalTextLength(name: string, value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return ensureTextLength(name, value, maxLength);
}

export function ensureNumberInRange(
  name: string,
  value: number,
  min: number,
  max: number
): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} 必须是有限数字`);
  }

  if (value < min || value > max) {
    throw new Error(`${name} 必须位于 ${min} 到 ${max} 之间`);
  }

  return value;
}

export function ensureIntegerInRange(
  name: string,
  value: number,
  min: number,
  max: number
): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} 必须是整数`);
  }

  return ensureNumberInRange(name, value, min, max);
}

export function validateHttpUrl(rawUrl: string): string {
  const value = ensureTextLength('url', rawUrl, SECURITY_LIMITS.MAX_URL_LENGTH);
  const parsed = new URL(value);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅允许 http/https URL');
  }

  return parsed.toString();
}

export function validateDomain(domain: string): string {
  const normalized = ensureTextLength('domain', domain, 253).toLowerCase();

  if (!DOMAIN_PATTERN.test(normalized)) {
    throw new Error('domain 格式无效');
  }

  return normalized;
}

export function validateAliases(aliases: string[] | undefined): string[] {
  if (!aliases) {
    return [];
  }

  if (aliases.length > SECURITY_LIMITS.MAX_ALIAS_COUNT) {
    throw new Error(`aliases 数量不能超过 ${SECURITY_LIMITS.MAX_ALIAS_COUNT}`);
  }

  return Array.from(
    new Set(
      aliases.map((alias) =>
        ensureTextLength('alias', alias, SECURITY_LIMITS.MAX_ALIAS_LENGTH)
      )
    )
  );
}

export function validateTtlDays(ttlDays: number): number {
  return ensureIntegerInRange(
    'ttl_days',
    ttlDays,
    SECURITY_LIMITS.MIN_TTL_DAYS,
    SECURITY_LIMITS.MAX_TTL_DAYS
  );
}

export function getSandboxRoot(): string {
  return resolve(process.env.WEB_AGENT_SANDBOX_DIR || process.cwd());
}

export function getFileSandboxRoot(): string {
  return resolve(process.env.WEB_AGENT_FILE_SANDBOX_DIR || getSandboxRoot());
}

export function getOutputRoot(): string {
  return resolve(process.env.WEB_AGENT_OUTPUT_DIR || join(getSandboxRoot(), '.web-agent'));
}

export function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

export function assertPathInSandbox(filePath: string, kind = '文件'): string {
  const sandboxRoot = getFileSandboxRoot();
  const resolvedPath = resolve(filePath);

  if (!isPathInside(sandboxRoot, resolvedPath)) {
    throw new Error(`${kind}路径超出沙盒目录：${sandboxRoot}`);
  }

  return resolvedPath;
}

export function resolveOutputPath(
  subdir: string,
  defaultFileName: string,
  requestedPath?: string
): string {
  const baseDir = resolve(getOutputRoot(), subdir);
  const fallbackPath = resolve(baseDir, defaultFileName);

  if (!requestedPath) {
    return fallbackPath;
  }

  const resolvedPath = requestedPath.startsWith('/')
    ? resolve(requestedPath)
    : resolve(baseDir, requestedPath);

  if (!isPathInside(baseDir, resolvedPath)) {
    throw new Error(`输出路径必须位于 ${baseDir}`);
  }

  return resolvedPath;
}

export function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export async function readResponseTextWithLimit(
  response: Response,
  maxBytes = SECURITY_LIMITS.MAX_HTTP_RESPONSE_BYTES
): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new Error(`响应体超过上限 ${maxBytes} bytes`);
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf-8') > maxBytes) {
      throw new Error(`响应体超过上限 ${maxBytes} bytes`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`响应体超过上限 ${maxBytes} bytes`);
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

export function trimOldestCacheEntries<T>(cache: Map<string, T>, maxEntries: number): void {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    cache.delete(oldestKey);
  }
}

export function limitArray<T>(items: T[], maxItems = SECURITY_LIMITS.MAX_RESULT_ITEMS): {
  items: T[];
  truncated: boolean;
} {
  if (items.length <= maxItems) {
    return { items, truncated: false };
  }

  return {
    items: items.slice(0, maxItems),
    truncated: true,
  };
}

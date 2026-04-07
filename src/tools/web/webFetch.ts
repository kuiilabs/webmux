/**
 * web_fetch 工具 - 静态网页抓取（支持 Jina、缓存、token 预估）
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { tokenBudget } from '../../runtime/tokenBudget.js';
import { errorClassifier } from '../../runtime/errorClassifier.js';

interface WebFetchParams {
  url: string;
  useJina?: boolean;
  useCache?: boolean;
}

interface WebFetchResult {
  url: string;
  content: string;
  source: 'jina' | 'fetch' | 'cache';
  tokens: number;
  truncated: boolean;
}

// 简易内存缓存
const cache: Map<string, { content: string; timestamp: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

export async function webFetch(params: WebFetchParams): Promise<ToolResult<WebFetchResult>> {
  const { url, useJina = true, useCache = true } = params;

  if (!url) {
    return error(networkError('缺少必要参数：url'));
  }

  // 检查缓存
  if (useCache) {
    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      const tokens = tokenBudget.estimate(cached.content);
      return success(
        {
          url,
          content: cached.content,
          source: 'cache',
          tokens,
          truncated: false,
        },
        `从缓存获取内容，估算 ${tokens} tokens`
      );
    }
  }

  // 优先尝试 Jina
  if (useJina) {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const response = await fetch(jinaUrl, {
        headers: {
          'Accept': 'application/json',
          'X-Timeout': '10',
        },
      });

      if (response.ok) {
        const data = await response.json() as { content?: string; text?: string };
        const content = data.content || data.text || '';

        if (content) {
          // 检查 token 预算
          const estimate = tokenBudget.check(content);
          let finalContent = content;
          let truncated = false;

          if (estimate.exceedsHardLimit) {
            const processed = await tokenBudget.process(content, 'chunked');
            finalContent = processed.chunks?.[0] || content;
            truncated = true;
          } else if (estimate.exceedsSoftLimit) {
            const processed = await tokenBudget.process(content, 'extract_main');
            finalContent = processed.text || content;
            truncated = processed.truncated;
          }

          // 写入缓存
          cache.set(url, { content, timestamp: Date.now() });

          const tokens = tokenBudget.estimate(finalContent);
          return success(
            {
              url,
              content: finalContent,
              source: 'jina',
              tokens,
              truncated,
            },
            `通过 Jina 获取内容，估算 ${tokens} tokens${truncated ? '（已裁剪）' : ''}`
          );
        }
      }
    } catch (err) {
      // Jina 失败，降级到原生 fetch
      const toolError = errorClassifier.classify(err);
      if (toolError.type !== 'network') {
        return error(toolError);
      }
      // 网络错误，继续降级
    }
  }

  // 降级：原生 fetch
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; WebAgent/1.0)',
      },
    });

    if (!response.ok) {
      const toolError = errorClassifier.classify(new Error(`HTTP ${response.status}`));
      return error(toolError);
    }

    const html = await response.text();

    // 简单提取正文（去除 script、style 等）
    const content = extractTextFromHtml(html);
    const estimate = tokenBudget.check(content);

    let finalContent = content;
    let truncated = false;

    if (estimate.exceedsHardLimit) {
      const processed = await tokenBudget.process(content, 'chunked');
      finalContent = processed.chunks?.[0] || content;
      truncated = true;
    } else if (estimate.exceedsSoftLimit) {
      const processed = await tokenBudget.process(content, 'extract_main');
      finalContent = processed.text || content;
      truncated = processed.truncated;
    }

    // 写入缓存
    cache.set(url, { content, timestamp: Date.now() });

    const tokens = tokenBudget.estimate(finalContent);
    return success(
      {
        url,
        content: finalContent,
        source: 'fetch',
        tokens,
        truncated,
      },
      `获取页面内容，估算 ${tokens} tokens${truncated ? '（已裁剪）' : ''}`
    );
  } catch (err) {
    const toolError = errorClassifier.classify(err);
    return error(toolError);
  }
}

/**
 * 从 HTML 中提取纯文本（简化版）
 */
function extractTextFromHtml(html: string): string {
  // 去除 script、style
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

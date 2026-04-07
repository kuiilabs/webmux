/**
 * browser_open 工具 - 在新的后台 tab 中打开指定 URL
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface OpenResult {
  targetId: string;
  url: string;
  title?: string;
}

export async function browserOpen(params: {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}): Promise<ToolResult<OpenResult>> {
  const { url, waitUntil = 'domcontentloaded' } = params;

  if (!url) {
    return error(
      networkError('缺少必要参数：url')
    );
  }

  try {
    const response = await fetch(
      `http://localhost:${CDP_PROXY.DEFAULT_PORT}/new?url=${encodeURIComponent(url)}&waitUntil=${waitUntil}`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      return error(
        networkError(`打开 URL 失败：${response.statusText}`)
      );
    }

    const data = await response.json() as { targetId?: string; id?: string; title?: string };
    const targetId = data.targetId || data.id || '';

    return success(
      {
        targetId,
        url,
        title: data.title,
      },
      `已在新 tab 中打开 ${url}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

/**
 * browser_open 工具 - 在新的后台 tab 中打开指定 URL
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { buildCdpProxyUrl } from '../../shared/cdpProxy.js';
import { SECURITY_LIMITS, validateHttpUrl } from '../../shared/security.js';

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
    const validatedUrl = validateHttpUrl(url);

    const targetsResponse = await fetch(buildCdpProxyUrl('/targets'));
    if (targetsResponse.ok) {
      const targets = await targetsResponse.json() as unknown[];
      if (targets.length >= SECURITY_LIMITS.MAX_BROWSER_TARGETS) {
        return error(
          networkError(`当前浏览器连接数已达上限 ${SECURITY_LIMITS.MAX_BROWSER_TARGETS}`, false)
        );
      }
    }

    const response = await fetch(
      buildCdpProxyUrl('/new', { url: validatedUrl, waitUntil }),
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
        url: validatedUrl,
        title: data.title,
      },
      `已在新 tab 中打开 ${validatedUrl}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

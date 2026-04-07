/**
 * browser_close 工具 - 关闭指定的浏览器 tab
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface CloseResult {
  targetId: string;
  closed: boolean;
}

export async function browserClose(params: {
  targetId: string;
}): Promise<ToolResult<CloseResult>> {
  const { targetId } = params;

  if (!targetId) {
    return error(
      pageError('缺少必要参数：targetId')
    );
  }

  try {
    const response = await fetch(
      `http://localhost:${CDP_PROXY.DEFAULT_PORT}/close?target=${targetId}`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      return error(
        pageError(`关闭 tab 失败：${response.statusText}`)
      );
    }

    return success(
      { targetId, closed: true },
      `已关闭 tab ${targetId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

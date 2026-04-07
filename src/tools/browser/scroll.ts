/**
 * browser_scroll 工具 - 滚动页面（触发懒加载）
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface BrowserScrollParams {
  targetId: string;
  direction?: 'top' | 'bottom' | 'up' | 'down';
  amount?: number;
}

interface ScrollResult {
  targetId: string;
  direction: string;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * 滚动 JS 脚本
 */
const SCROLL_SCRIPT = (direction: string, amount?: number) => `
(function() {
  const result = {
    scrollTop: document.documentElement.scrollTop,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight
  };

  if ('${direction}' === 'bottom') {
    window.scrollTo(0, document.documentElement.scrollHeight);
  } else if ('${direction}' === 'top') {
    window.scrollTo(0, 0);
  } else if ('${direction}' === 'down' && ${amount || 500}) {
    window.scrollBy(0, ${amount || 500});
  } else if ('${direction}' === 'up' && ${amount || 500}) {
    window.scrollBy(0, -${amount || 500});
  }

  result.scrollTop = document.documentElement.scrollTop;
  return result;
})();
`.trim();

export async function browserScroll(params: BrowserScrollParams): Promise<ToolResult<ScrollResult>> {
  const { targetId, direction = 'bottom', amount } = params;

  if (!targetId) {
    return error(pageError('缺少必要参数：targetId'));
  }

  try {
    const script = SCROLL_SCRIPT(direction, amount);
    const response = await fetch(
      `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: script,
      }
    );

    if (!response.ok) {
      return error(pageError(`滚动失败：${response.statusText}`));
    }

    const result = await response.json() as { scrollTop?: number; scrollHeight?: number; clientHeight?: number };

    return success(
      {
        targetId,
        direction,
        scrollTop: result.scrollTop || 0,
        scrollHeight: result.scrollHeight || 0,
        clientHeight: result.clientHeight || 0,
      },
      `已滚动到${direction === 'bottom' ? '底部' : direction === 'top' ? '顶部' : direction}，当前位置 ${result.scrollTop || 0}/${result.scrollHeight || 0}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

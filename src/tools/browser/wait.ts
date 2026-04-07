/**
 * browser_wait 工具 - 等待元素或文本出现
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface BrowserWaitParams {
  targetId: string;
  selector?: string;
  text?: string;
  timeout?: number;
  pollInterval?: number;
}

interface WaitResult {
  targetId: string;
  found: boolean;
  type: 'selector' | 'text' | 'timeout';
  waitTime: number;
}

/**
 * 检查元素或文本是否存在的 JS 脚本
 */
const CHECK_SCRIPT = (selector?: string, text?: string) => `
(function() {
  const result = { found: false };

  if ('${selector || ''}') {
    const el = document.querySelector('${selector?.replace(/'/g, "\\'") || ''}');
    result.selectorFound = !!el;
    result.visible = el ? el.offsetParent !== null : false;
  }

  if ('${text || ''}') {
    const textFound = document.body.innerText.includes('${text || ''}');
    result.textFound = textFound;
  }

  result.found = result.selectorFound || result.textFound || false;
  return result;
})();
`.trim();

export async function browserWait(params: BrowserWaitParams): Promise<ToolResult<WaitResult>> {
  const { targetId, selector, text, timeout = 10000, pollInterval = 500 } = params;

  if (!targetId) {
    return error(pageError('缺少必要参数：targetId'));
  }

  if (!selector && !text) {
    return error(pageError('需要指定 selector 或 text 参数'));
  }

  const startTime = Date.now();
  let found = false;

  try {
    while (Date.now() - startTime < timeout) {
      const checkScript = CHECK_SCRIPT(selector, text);
      const response = await fetch(
        `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: checkScript,
        }
      );

      if (!response.ok) {
        return error(pageError(`检查失败：${response.statusText}`));
      }

      const result = await response.json() as { found?: boolean };

      if (result.found) {
        found = true;
        break;
      }

      // 等待下一次轮询
      await sleep(pollInterval);
    }

    const waitTime = Date.now() - startTime;

    return success(
      {
        targetId,
        found,
        type: found ? (selector ? 'selector' : 'text') : 'timeout',
        waitTime,
      },
      found
        ? `等待 ${waitTime}ms 后找到${selector ? `元素 ${selector}` : `文本 "${text}"`}`
        : `等待超时（${timeout}ms），未找到目标`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * browser_click 工具 - 点击元素
 * 支持两种模式：JS click 和真实鼠标事件
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface BrowserClickParams {
  targetId: string;
  selector: string;
  mode?: 'js' | 'mouse';
}

interface ClickResult {
  targetId: string;
  selector: string;
  mode: string;
  success: boolean;
  message?: string;
}

/**
 * JS click 脚本（简单快速，覆盖大多数场景）
 */
const JS_CLICK_SCRIPT = (selector: string) => `
(function() {
  const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
  if (!el) {
    return { found: false, error: '元素未找到' };
  }

  // 尝试多种方式点击
  if (typeof el.click === 'function') {
    el.click();
    return { clicked: true, method: 'click' };
  }

  // 如果没有 click 方法，触发事件
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  el.dispatchEvent(event);
  return { clicked: true, method: 'dispatchEvent' };
})();
`.trim();

/**
 * 真实鼠标事件脚本（用于文件上传对话框等需要手势的场景）
 */
const MOUSE_CLICK_SCRIPT = (selector: string) => `
(function() {
  const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
  if (!el) {
    return { found: false, error: '元素未找到' };
  }

  // 获取元素位置
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  return {
    found: true,
    x: x,
    y: y,
    tagName: el.tagName,
    visible: el.offsetParent !== null
  };
})();
`.trim();

export async function browserClick(params: BrowserClickParams): Promise<ToolResult<ClickResult>> {
  const { targetId, selector, mode = 'js' } = params;

  if (!targetId) {
    return error(pageError('缺少必要参数：targetId'));
  }

  if (!selector) {
    return error(pageError('缺少必要参数：selector'));
  }

  try {
    if (mode === 'js') {
      // JS click 模式
      const script = JS_CLICK_SCRIPT(selector);
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
        return error(pageError(`执行失败：${response.statusText}`));
      }

      const result = await response.json() as { found?: boolean; error?: string; clicked?: boolean; method?: string };

      if (result.found === false || result.error) {
        return error(pageError(`元素未找到：${selector}`));
      }

      return success(
        {
          targetId,
          selector,
          mode: 'js',
          success: true,
          message: `已通过 JS 点击 ${selector}`,
        },
        `已点击元素 ${selector}`
      );
    } else {
      // 真实鼠标模式
      // 第一步：获取元素位置
      const script = MOUSE_CLICK_SCRIPT(selector);
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
        return error(pageError(`获取元素位置失败：${response.statusText}`));
      }

      const result = await response.json() as { found?: boolean; visible?: boolean };

      if (result.found === false) {
        return error(pageError(`元素未找到：${selector}`));
      }

      if (result.visible === false) {
        return error(pageError(`元素不可见：${selector}，可能需要先滚动`));
      }

      // 第二步：调用 CDP 真实鼠标事件
      const clickAtResponse = await fetch(
        `http://localhost:${CDP_PROXY.DEFAULT_PORT}/clickAt?target=${targetId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: selector,
        }
      );

      if (!clickAtResponse.ok) {
        return error(pageError(`鼠标点击失败：${clickAtResponse.statusText}`));
      }

      return success(
        {
          targetId,
          selector,
          mode: 'mouse',
          success: true,
          message: `已通过真实鼠标事件点击 ${selector}`,
        },
        `已点击元素 ${selector}（真实鼠标事件）`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

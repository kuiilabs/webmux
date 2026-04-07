/**
 * browser_fill 工具 - 填写表单字段
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface BrowserFillParams {
  targetId: string;
  selector: string;
  value: string;
  clear?: boolean;
  submit?: boolean;
}

interface FillResult {
  targetId: string;
  selector: string;
  value: string;
  filled: boolean;
  submitted?: boolean;
}

/**
 * 填写表单的 JS 脚本
 */
const FILL_SCRIPT = (selector: string, value: string, clear: boolean) => `
(function() {
  const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
  if (!el) {
    return { found: false, error: '元素未找到' };
  }

  // 聚焦
  el.focus();

  // 清空（如果需要）
  if (${clear} && el.value) {
    el.value = '';
  }

  // 设置值
  el.value = ${JSON.stringify(value)};

  // 触发输入事件（让 React/Vue 等框架感知变化）
  const inputEvent = new Event('input', { bubbles: true });
  el.dispatchEvent(inputEvent);

  const changeEvent = new Event('change', { bubbles: true });
  el.dispatchEvent(changeEvent);

  return { filled: true, tagName: el.tagName, type: el.type };
})();
`.trim();

/**
 * 提交表单的 JS 脚本
 */
const SUBMIT_SCRIPT = (selector: string) => `
(function() {
  const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
  if (!el) {
    return { found: false, error: '元素未找到' };
  }

  // 查找最近的 form
  const form = el.closest('form');
  if (form) {
    form.submit();
    return { submitted: true, method: 'form.submit' };
  }

  // 尝试点击 submit 按钮
  const submitBtn = document.querySelector('button[type=submit], input[type=submit]');
  if (submitBtn && typeof submitBtn.click === 'function') {
    submitBtn.click();
    return { submitted: true, method: 'click' };
  }

  return { submitted: false, error: '未找到 form 或 submit 按钮' };
})();
`.trim();

export async function browserFill(params: BrowserFillParams): Promise<ToolResult<FillResult>> {
  const { targetId, selector, value, clear = true, submit = false } = params;

  if (!targetId) {
    return error(pageError('缺少必要参数：targetId'));
  }

  if (!selector) {
    return error(pageError('缺少必要参数：selector'));
  }

  if (value === undefined || value === null) {
    return error(pageError('缺少必要参数：value'));
  }

  try {
    // 第一步：填写值
    const fillScript = FILL_SCRIPT(selector, value, clear);
    const fillResponse = await fetch(
      `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: fillScript,
      }
    );

    if (!fillResponse.ok) {
      return error(pageError(`填写失败：${fillResponse.statusText}`));
    }

    const fillResult = await fillResponse.json() as { found?: boolean; error?: string; filled?: boolean };

    if (fillResult.found === false || fillResult.error) {
      return error(pageError(`元素未找到：${selector}`));
    }

    // 第二步：提交表单（如果需要）
    let submitted = false;
    if (submit) {
      const submitScript = SUBMIT_SCRIPT(selector);
      const submitResponse = await fetch(
        `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: submitScript,
        }
      );

      if (submitResponse.ok) {
        const submitResult = await submitResponse.json() as { submitted?: boolean };
        submitted = submitResult.submitted === true;
      }
    }

    return success(
      {
        targetId,
        selector,
        value,
        filled: true,
        submitted,
      },
      `已填写 ${selector}${submitted ? ' 并提交表单' : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

/**
 * browser_dialog 工具 - 处理浏览器弹窗（alert/confirm/prompt）
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface BrowserDialogParams {
  targetId: string;
  action: 'accept' | 'dismiss' | 'prompt';
  promptText?: string;
  waitForDialog?: boolean;
  timeout?: number;
}

interface DialogResult {
  targetId: string;
  action: string;
  handled: boolean;
  dialogType?: string;
  dialogMessage?: string;
}

/**
 * 设置对话框处理器的 JS 脚本
 */
const DIALOG_HANDLER_SCRIPT = (action: string, promptText?: string) => `
(function() {
  // 记录已处理的对话框
  if (!window.__webAgentDialogs) {
    window.__webAgentDialogs = [];
  }

  // 设置处理器
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;

  window.alert = function(message) {
    window.__webAgentDialogs.push({ type: 'alert', message, handled: true });
    return true;
  };

  window.confirm = function(message) {
    window.__webAgentDialogs.push({ type: 'confirm', message, handled: ${action === 'accept'} });
    return ${action === 'accept'};
  };

  window.prompt = function(message, defaultValue) {
    window.__webAgentDialogs.push({ type: 'prompt', message, defaultValue, handled: true, response: ${promptText ? JSON.stringify(promptText) : 'null'} });
    return ${promptText ? JSON.stringify(promptText) : 'null'};
  };

  return { setup: true, dialogs: window.__webAgentDialogs };
})();
`.trim();

/**
 * 检查是否有未处理的对话框
 */
const CHECK_DIALOG_SCRIPT = `
(function() {
  // 尝试触发一个对话框来检测
  return {
    hasHandler: typeof window.__webAgentDialogs !== 'undefined',
    dialogs: window.__webAgentDialogs || []
  };
})();
`.trim();

export async function browserDialog(params: BrowserDialogParams): Promise<ToolResult<DialogResult>> {
  const { targetId, action, promptText, waitForDialog = false, timeout = 5000 } = params;

  if (!targetId) {
    return error(pageError('缺少必要参数：targetId'));
  }

  try {
    // 第一步：设置对话框处理器
    const handlerScript = DIALOG_HANDLER_SCRIPT(action, promptText);
    const handlerResponse = await fetch(
      `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: handlerScript,
      }
    );

    if (!handlerResponse.ok) {
      return error(pageError(`设置对话框处理器失败：${handlerResponse.statusText}`));
    }

    await handlerResponse.json();

    // 如果设置了 waitForDialog，等待对话框出现
    let dialogType: string | undefined;
    let dialogMessage: string | undefined;

    if (waitForDialog) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const checkResponse = await fetch(
          `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain',
            },
            body: CHECK_DIALOG_SCRIPT,
          }
        );

        if (checkResponse.ok) {
          const checkResult = await checkResponse.json() as { dialogs?: Array<{ type: string; message: string }> };
          if (checkResult.dialogs && checkResult.dialogs.length > 0) {
            const lastDialog = checkResult.dialogs[checkResult.dialogs.length - 1];
            dialogType = lastDialog.type;
            dialogMessage = lastDialog.message;
            break;
          }
        }

        await sleep(200);
      }
    }

    return success(
      {
        targetId,
        action,
        handled: true,
        dialogType,
        dialogMessage,
      },
      dialogType
        ? `已处理 ${dialogType} 对话框${dialogMessage ? `: "${dialogMessage}"` : ''}`
        : `已设置对话框处理器，${waitForDialog ? '但未检测到对话框' : '等待对话框出现'}`
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

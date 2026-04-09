/**
 * browser_upload 工具 - 文件上传
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { existsSync } from 'fs';
import { buildCdpProxyUrl } from '../../shared/cdpProxy.js';
import { SECURITY_LIMITS, assertPathInSandbox, ensureTextLength, serializeJsString } from '../../shared/security.js';

interface BrowserUploadParams {
  targetId: string;
  selector: string;
  files: string[];
}

interface UploadResult {
  targetId: string;
  selector: string;
  files: string[];
  uploaded: boolean;
}

/**
 * 检查 input[file] 元素是否存在
 */
const CHECK_INPUT_SCRIPT = (selector: string) => `
(function() {
  const el = document.querySelector(${serializeJsString(selector)});
  if (!el) {
    return { found: false, error: '元素未找到' };
  }
  if (el.tagName !== 'INPUT' || el.type !== 'file') {
    return { found: false, error: '不是文件输入元素', tagName: el.tagName, type: el.type };
  }
  return { found: true, disabled: el.disabled, multiple: el.multiple };
})();
`.trim();

export async function browserUpload(params: BrowserUploadParams): Promise<ToolResult<UploadResult>> {
  const { targetId, selector, files } = params;

  if (!targetId) {
    return error(pageError('缺少必要参数：targetId'));
  }

  if (!selector) {
    return error(pageError('缺少必要参数：selector'));
  }

  if (!files || files.length === 0) {
    return error(pageError('缺少必要参数：files'));
  }

  let validatedSelector: string;
  let sandboxedFiles: string[];
  try {
    validatedSelector = ensureTextLength('selector', selector, SECURITY_LIMITS.MAX_SELECTOR_LENGTH);
    sandboxedFiles = files.map(file => assertPathInSandbox(file, '上传文件'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(pageError(message));
  }

  // 检查文件是否存在
  const existingFiles = sandboxedFiles.filter(f => existsSync(f));
  if (existingFiles.length === 0) {
    return error(pageError(`文件不存在：${sandboxedFiles.join(', ')}`));
  }
  if (existingFiles.length < sandboxedFiles.length) {
    const missing = sandboxedFiles.filter(f => !existsSync(f));
    return error(pageError(`部分文件不存在：${missing.join(', ')}`));
  }

  try {
    // 第一步：检查元素
    const checkScript = CHECK_INPUT_SCRIPT(validatedSelector);
    const checkResponse = await fetch(
      buildCdpProxyUrl('/eval', { target: targetId }),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: checkScript,
      }
    );

    if (!checkResponse.ok) {
      return error(pageError(`检查元素失败：${checkResponse.statusText}`));
    }

    const checkResult = await checkResponse.json() as { found?: boolean; error?: string };

    if (checkResult.found === false) {
      return error(pageError(checkResult.error || '元素未找到'));
    }

    // 第二步：调用 setFiles API
    const setFilesBody = JSON.stringify({ selector: validatedSelector, files: existingFiles });
    const setFilesResponse = await fetch(
      buildCdpProxyUrl('/setFiles', { target: targetId }),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: setFilesBody,
      }
    );

    if (!setFilesResponse.ok) {
      return error(pageError(`文件上传失败：${setFilesResponse.statusText}`));
    }

    return success(
      {
        targetId,
        selector: validatedSelector,
        files: existingFiles,
        uploaded: true,
      },
      `已上传 ${existingFiles.length} 个文件到 ${validatedSelector}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

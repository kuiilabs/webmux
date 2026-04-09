/**
 * browser_extract 工具 - 语义提取主内容
 * 从 DOM 中智能提取正文、标题、发布时间等
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { buildCdpProxyUrl } from '../../shared/cdpProxy.js';
import { tokenBudget } from '../../runtime/tokenBudget.js';
import {
  SECURITY_LIMITS,
  ensureIntegerInRange,
  ensureOptionalTextLength,
  limitArray,
  serializeJsString,
} from '../../shared/security.js';

interface BrowserExtractParams {
  targetId: string;
  mode?: 'main' | 'links' | 'images' | 'text' | 'custom';
  selector?: string;
  maxLength?: number;
}

interface ExtractResult {
  targetId: string;
  mode: string;
  content: unknown;
  tokens: number;
  metadata?: Record<string, unknown>;
}

/**
 * 提取主内容的 JS 脚本（穿透 Shadow DOM）
 */
const EXTRACT_MAIN_CONTENT_SCRIPT = `
(function() {
  // 尝试多种策略提取主内容

  // 策略 1：查找 article 标签
  const article = document.querySelector('article');
  if (article) {
    return {
      title: document.title,
      content: article.innerText,
      source: 'article'
    };
  }

  // 策略 2：查找 main 标签
  const main = document.querySelector('main');
  if (main) {
    return {
      title: document.title,
      content: main.innerText,
      source: 'main'
    };
  }

  // 策略 3：查找最大文本区块
  const paragraphs = Array.from(document.querySelectorAll('p'));
  const sorted = paragraphs.sort((a, b) => b.innerText.length - a.innerText.length);
  if (sorted.length > 0 && sorted[0].innerText.length > 100) {
    return {
      title: document.title,
      content: sorted.map(p => p.innerText).join('\\n\\n'),
      source: 'paragraphs'
    };
  }

  // 策略 4：返回 body 全部文本
  return {
    title: document.title,
    content: document.body.innerText,
    source: 'body'
  };
})();
`.trim();

/**
 * 提取链接的 JS 脚本
 */
const EXTRACT_LINKS_SCRIPT = `
(function() {
  const links = Array.from(document.querySelectorAll('a[href]'));
  return links.map(link => ({
    text: link.innerText?.slice(0, 100) || '',
    href: link.href,
    visible: link.offsetParent !== null
  }));
})();
`.trim();

/**
 * 提取图片的 JS 脚本
 */
const EXTRACT_IMAGES_SCRIPT = `
(function() {
  const images = Array.from(document.querySelectorAll('img[src]'));
  return images.map(img => ({
    src: img.src,
    alt: img.alt || '',
    visible: img.offsetParent !== null,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height
  }));
})();
`.trim();

export async function browserExtract(params: BrowserExtractParams): Promise<ToolResult<ExtractResult>> {
  const { targetId, mode = 'main', selector, maxLength = 10000 } = params;

  if (!targetId) {
    return error(pageError('缺少必要参数：targetId'));
  }

  let validatedSelector: string | undefined;
  let validatedMaxLength: number;
  try {
    validatedSelector = ensureOptionalTextLength('selector', selector, SECURITY_LIMITS.MAX_SELECTOR_LENGTH);
    validatedMaxLength = ensureIntegerInRange('maxLength', maxLength, 1, SECURITY_LIMITS.MAX_INPUT_VALUE_LENGTH);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(pageError(message));
  }

  // 选择提取脚本
  let script: string;
  switch (mode) {
    case 'links':
      script = EXTRACT_LINKS_SCRIPT;
      break;
    case 'images':
      script = EXTRACT_IMAGES_SCRIPT;
      break;
    case 'custom':
      if (!validatedSelector) {
        return error(pageError('custom 模式需要 selector 参数'));
      }
      script = `(function() {
        const el = document.querySelector(${serializeJsString(validatedSelector)});
        return el ? { content: el.innerText } : { content: null, error: '元素未找到' };
      })();`;
      break;
    case 'main':
    default:
      script = EXTRACT_MAIN_CONTENT_SCRIPT;
  }

  try {
    // 执行 JS 提取
    const response = await fetch(
      buildCdpProxyUrl('/eval', { target: targetId }),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: script,
      }
    );

    if (!response.ok) {
      return error(pageError(`提取失败：${response.statusText}`));
    }

    const content = await response.json();

    // 处理结果
    let resultContent: unknown = content;
    let metadata: Record<string, unknown> | undefined;

    if (mode === 'main' && typeof content === 'object' && content !== null) {
      const obj = content as Record<string, unknown>;
      resultContent = obj.content || obj.text;
      metadata = {
        source: obj.source,
        title: obj.title,
      };
    }

    // 处理文本长度
    if (typeof resultContent === 'string') {
      // Token 估算
      const estimate = tokenBudget.check(resultContent);

      // 如果超过限制，进行裁剪
      if (estimate.strategy === 'reject') {
        return error(pageError('提取内容超过 token 上限，已拒绝返回'));
      }

      if (estimate.strategy === 'chunked') {
        const processed = await tokenBudget.process(resultContent, 'chunked');
        resultContent = processed.chunks?.[0] || resultContent;
      } else if (estimate.strategy === 'extract_main') {
        resultContent = resultContent.slice(0, validatedMaxLength);
      }

      const tokens = tokenBudget.estimate(resultContent as string);
      return success(
        {
          targetId,
          mode,
          content: resultContent as string,
          tokens,
          metadata,
        },
        `提取完成，估算 ${tokens} tokens`
      );
    }

    // 非文本内容（链接、图片等数组）
    let finalContent = resultContent;
    if (Array.isArray(resultContent)) {
      const limited = limitArray(resultContent, SECURITY_LIMITS.MAX_RESULT_ITEMS);
      finalContent = limited.items;

      if (limited.truncated) {
        metadata = {
          ...metadata,
          truncated: true,
          totalItems: resultContent.length,
          returnedItems: limited.items.length,
        };
      }
    }

    const tokens = tokenBudget.estimateObject(finalContent);
    return success(
      {
        targetId,
        mode,
        content: finalContent,
        tokens,
        metadata,
      },
      `提取完成，共 ${(finalContent as Array<unknown>).length || 1} 项`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

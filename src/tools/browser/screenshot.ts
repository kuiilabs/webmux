/**
 * browser_screenshot 工具 - 截图（viewport 或全页）
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';
import { mkdirSync } from 'fs';
import { join } from 'path';

interface BrowserScreenshotParams {
  targetId: string;
  fullPage?: boolean;
  file?: string;
}

interface ScreenshotResult {
  targetId: string;
  filePath: string;
  fullPage: boolean;
  timestamp: number;
}

/**
 * 截图 JS 脚本（获取 viewport 信息）
 */
const VIEWPORT_SCRIPT = `
(function() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth
  };
})();
`.trim();

export async function browserScreenshot(params: BrowserScreenshotParams): Promise<ToolResult<ScreenshotResult>> {
  const { targetId, fullPage = false, file } = params;

  if (!targetId) {
    return error(pageError('缺少必要参数：targetId'));
  }

  // 生成文件路径
  const filePath = file || join(
    process.env.HOME || '/tmp',
    '.cache',
    'web-agent',
    'screenshots',
    `${targetId}_${Date.now()}.png`
  );

  // 确保目录存在
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // 目录可能已存在
  }

  try {
    // 如果是全页截图，先获取页面尺寸
    if (fullPage) {
      const viewportResponse = await fetch(
        `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: VIEWPORT_SCRIPT,
        }
      );

      if (viewportResponse.ok) {
        await viewportResponse.json();
        // 可以记录日志或用于后续处理
      }
    }

    // 调用截图 API
    const screenshotUrl = `http://localhost:${CDP_PROXY.DEFAULT_PORT}/screenshot?target=${targetId}&file=${encodeURIComponent(filePath)}&fullPage=${fullPage}`;

    const response = await fetch(screenshotUrl, {
      method: 'POST',
    });

    if (!response.ok) {
      return error(pageError(`截图失败：${response.statusText}`));
    }

    // 检查文件是否创建成功
    try {
      await import('fs/promises').then(fs => fs.access(filePath));
    } catch {
      // 文件不存在，可能是 API 返回了错误
      return error(pageError('截图文件未创建成功'));
    }

    return success(
      {
        targetId,
        filePath,
        fullPage,
        timestamp: Date.now(),
      },
      `已${fullPage ? '全页' : '当前视口'}截图，保存至 ${filePath}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`截图失败：${message}`)
    );
  }
}

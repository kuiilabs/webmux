/**
 * browser_list 工具 - 列出所有浏览器 tab
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface TabInfo {
  targetId: string;
  title: string;
  url: string;
  type: string;
}

export async function browserList(): Promise<ToolResult<TabInfo[]>> {
  try {
    const response = await fetch(`http://localhost:${CDP_PROXY.DEFAULT_PORT}/targets`);

    if (!response.ok) {
      if (response.status === 404 || response.status === 503) {
        return error(
          networkError('CDP Proxy 未运行，将尝试自动启动')
        );
      }
      return error(
        networkError(`获取 tab 列表失败：${response.statusText}`)
      );
    }

    const tabs = await response.json() as TabInfo[];

    return success(
      tabs,
      `共发现 ${tabs.length} 个 tab`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

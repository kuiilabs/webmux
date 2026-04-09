/**
 * console_list 工具 - 列出控制台消息
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { buildCdpProxyUrl } from '../../shared/cdpProxy.js';

interface ConsoleListParams {
  targetId: string;
  levels?: ('log' | 'warn' | 'error' | 'info' | 'debug')[];
}

interface ConsoleMessage {
  level: string;
  text: string;
  timestamp: number;
  source?: string;
  line?: number;
  column?: number;
}

export async function consoleList(params: ConsoleListParams): Promise<ToolResult<ConsoleMessage[]>> {
  const { targetId, levels } = params;

  if (!targetId) {
    return error(networkError('缺少必要参数：targetId'));
  }

  try {
    // 获取控制台消息列表
    const url = buildCdpProxyUrl('/console', { target: targetId });
    const response = await fetch(url);

    if (!response.ok) {
      return error(networkError(`获取控制台消息失败：${response.statusText}`));
    }

    let messages = await response.json() as ConsoleMessage[];

    // 过滤级别
    if (levels && levels.length > 0) {
      messages = messages.filter(msg =>
        levels.some(level => msg.level.toLowerCase() === level.toLowerCase())
      );
    }

    // 按时间排序
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    return success(
      messages,
      `共发现 ${messages.length} 条控制台消息`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

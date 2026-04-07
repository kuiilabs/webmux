/**
 * network_list 工具 - 列出网络请求
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface NetworkListParams {
  targetId: string;
  types?: ('xhr' | 'fetch' | 'document' | 'stylesheet' | 'script' | 'image')[];
  statusRange?: [number, number];
}

interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  type: string;
  size?: number;
  duration?: number;
}

export async function networkList(params: NetworkListParams): Promise<ToolResult<NetworkRequest[]>> {
  const { targetId, types, statusRange } = params;

  if (!targetId) {
    return error(networkError('缺少必要参数：targetId'));
  }

  try {
    // 获取网络请求列表
    const url = `http://localhost:${CDP_PROXY.DEFAULT_PORT}/network?target=${targetId}`;
    const response = await fetch(url);

    if (!response.ok) {
      return error(networkError(`获取网络请求失败：${response.statusText}`));
    }

    let requests = await response.json() as NetworkRequest[];

    // 过滤类型
    if (types && types.length > 0) {
      requests = requests.filter(req =>
        types.some(t => req.type.toLowerCase().includes(t.toLowerCase()))
      );
    }

    // 过滤状态码
    if (statusRange) {
      const [min, max] = statusRange;
      requests = requests.filter(req =>
        req.status >= min && req.status <= max
      );
    }

    return success(
      requests,
      `共发现 ${requests.length} 个网络请求`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

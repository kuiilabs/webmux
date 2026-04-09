/**
 * CDP Proxy URL 辅助函数
 */

import { CDP_PROXY } from './constants.js';

export function buildCdpProxyUrl(
  pathname: string,
  params: Record<string, string | number | boolean | undefined> = {}
): string {
  const url = new URL(`http://localhost:${CDP_PROXY.DEFAULT_PORT}${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

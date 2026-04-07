/**
 * perf_trace_start 工具 - 开始性能追踪
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface PerfTraceStartParams {
  targetId: string;
  duration?: number; // 追踪时长（毫秒）
  categories?: string[]; // 追踪类别
}

interface PerfTraceStartResult {
  targetId: string;
  tracing: boolean;
  startedAt: number;
  duration?: number;
}

/**
 * 开始性能追踪的 JS 脚本
 * 使用 Performance API 和 CDP Performance 域
 */
const START_TRACE_SCRIPT = `
(function() {
  if (!window.__webAgentPerfTrace) {
    window.__webAgentPerfTrace = {
      entries: [],
      started: Date.now(),
      observer: null
    };

    // 监听性能条目
    window.__webAgentPerfTrace.observer = new PerformanceObserver((list) => {
      window.__webAgentPerfTrace.entries.push(...list.getEntries());
    });

    // 观察所有类型的性能条目
    try {
      window.__webAgentPerfTrace.observer.observe({ entryTypes: ['resource', 'navigation', 'paint', 'longtask'] });
    } catch (e) {
      // 某些 entryTypes 可能不支持
    }
  }

  return {
    tracing: true,
    started: window.__webAgentPerfTrace.started,
    entryCount: window.__webAgentPerfTrace.entries.length
  };
})();
`.trim();

export async function perfTraceStart(params: PerfTraceStartParams): Promise<ToolResult<PerfTraceStartResult>> {
  const { targetId, duration } = params;

  if (!targetId) {
    return error(networkError('缺少必要参数：targetId'));
  }

  try {
    const response = await fetch(
      `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: START_TRACE_SCRIPT,
      }
    );

    if (!response.ok) {
      return error(networkError(`启动性能追踪失败：${response.statusText}`));
    }

    const result = await response.json() as { started?: number; tracing?: boolean };

    return success(
      {
        targetId,
        tracing: true,
        startedAt: result.started || Date.now(),
        duration,
      },
      `已开始性能追踪${duration ? `（时长 ${duration}ms）` : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

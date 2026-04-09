/**
 * perf_trace_stop 工具 - 停止性能追踪并收集数据
 */

import { success, error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { writeFileSync } from 'fs';
import { buildCdpProxyUrl } from '../../shared/cdpProxy.js';
import { ensureParentDirectory, resolveOutputPath, sanitizeFileComponent } from '../../shared/security.js';

interface PerfTraceStopParams {
  targetId: string;
  saveFile?: boolean;
}

interface PerformanceEntry {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
  initiatorType?: string;
}

interface PerfTraceStopResult {
  targetId: string;
  tracing: false;
  stoppedAt: number;
  entries: PerformanceEntry[];
  metrics: PerformanceMetrics;
  filePath?: string;
}

interface PerformanceMetrics {
  // Navigation timing
  domContentLoaded: number;
  loadComplete: number;
  firstPaint: number;
  firstContentfulPaint: number;

  // Resource timing
  totalResources: number;
  totalResourceSize: number;
  slowestResources: Array<{ name: string; duration: number }>;

  // Long tasks
  longTaskCount: number;
  totalLongTaskTime: number;
}

/**
 * 停止追踪并获取性能数据的 JS 脚本
 */
const STOP_TRACE_SCRIPT = `
(function() {
  if (!window.__webAgentPerfTrace) {
    return { error: '性能追踪未启动' };
  }

  const entries = window.__webAgentPerfTrace.entries || [];
  const started = window.__webAgentPerfTrace.started;
  const stopped = Date.now();

  // 计算指标
  const metrics = {
    domContentLoaded: 0,
    loadComplete: 0,
    firstPaint: 0,
    firstContentfulPaint: 0,
    totalResources: 0,
    totalResourceSize: 0,
    slowestResources: [],
    longTaskCount: 0,
    totalLongTaskTime: 0
  };

  // 处理条目
  entries.forEach(entry => {
    if (entry.entryType === 'navigation') {
      metrics.domContentLoaded = entry.domContentLoadedEventEnd || 0;
      metrics.loadComplete = entry.loadEventEnd || 0;
    } else if (entry.entryType === 'paint') {
      if (entry.name === 'first-paint') {
        metrics.firstPaint = entry.startTime;
      } else if (entry.name === 'first-contentful-paint') {
        metrics.firstContentfulPaint = entry.startTime;
      }
    } else if (entry.entryType === 'resource') {
      metrics.totalResources++;
      metrics.totalResourceSize += (entry.transferSize || 0);
    } else if (entry.entryType === 'longtask') {
      metrics.longTaskCount++;
      metrics.totalLongTaskTime += entry.duration;
    }
  });

  // 找出最慢的资源
  const resources = entries.filter(e => e.entryType === 'resource');
  resources.sort((a, b) => b.duration - a.duration);
  metrics.slowestResources = resources.slice(0, 5).map(r => ({
    name: r.name,
    duration: r.duration
  }));

  // 清理
  if (window.__webAgentPerfTrace.observer) {
    window.__webAgentPerfTrace.observer.disconnect();
  }
  window.__webAgentPerfTrace = null;

  return {
    entries,
    metrics,
    started,
    stopped
  };
})();
`.trim();

export async function perfTraceStop(params: PerfTraceStopParams): Promise<ToolResult<PerfTraceStopResult>> {
  const { targetId, saveFile = true } = params;

  if (!targetId) {
    return error(networkError('缺少必要参数：targetId'));
  }

  try {
    const response = await fetch(
      buildCdpProxyUrl('/eval', { target: targetId }),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: STOP_TRACE_SCRIPT,
      }
    );

    if (!response.ok) {
      return error(networkError(`停止性能追踪失败：${response.statusText}`));
    }

    const result = await response.json() as {
      error?: string;
      entries?: PerformanceEntry[];
      metrics?: PerformanceMetrics;
      stopped?: number;
    };

    if (result.error) {
      return error(networkError(result.error));
    }

    let filePath: string | undefined;

    // 保存文件
    if (saveFile) {
      filePath = resolveOutputPath(
        'perf-traces',
        `trace_${sanitizeFileComponent(targetId, 'target')}_${Date.now()}.json`
      );
      ensureParentDirectory(filePath);
      writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
    }

    return success(
      {
        targetId,
        tracing: false,
        stoppedAt: result.stopped || Date.now(),
        entries: result.entries || [],
        metrics: result.metrics as PerformanceMetrics,
        filePath,
      },
      `已停止性能追踪，发现 ${result.entries?.length || 0} 个性能条目${filePath ? `，详情见 ${filePath}` : ''}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}

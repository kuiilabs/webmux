/**
 * perf_analyze 工具 - 分析性能数据（Lighthouse + CrUX 风格）
 */

import { success } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';

interface PerfAnalyzeParams {
  metrics: {
    domContentLoaded?: number;
    loadComplete?: number;
    firstPaint?: number;
    firstContentfulPaint?: number;
    totalResources?: number;
    totalResourceSize?: number;
    longTaskCount?: number;
    totalLongTaskTime?: number;
  };
  url?: string;
}

interface PerfAnalyzeResult {
  overall: 'good' | 'needs_improvement' | 'poor';
  score: number;
  metrics: MetricAnalysis[];
  recommendations: string[];
}

interface MetricAnalysis {
  name: string;
  value: number;
  unit: string;
  rating: 'good' | 'needs_improvement' | 'poor';
  description: string;
}

/**
 * Lighthouse 风格评分阈值（毫秒）
 */
const THRESHOLDS = {
  fcp: { good: 1800, needsImprovement: 3000 },
  lcp: { good: 2500, needsImprovement: 4000 },
  tti: { good: 3800, needsImprovement: 7300 },
  tbt: { good: 200, needsImprovement: 600 },
  cls: { good: 0.1, needsImprovement: 0.25 },
};

/**
 * 评分权重
 */
const WEIGHTS = {
  fcp: 0.1,
  lcp: 0.25,
  tti: 0.1,
  tbt: 0.3,
  cls: 0.25,
};

export async function perfAnalyze(params: PerfAnalyzeParams): Promise<ToolResult<PerfAnalyzeResult>> {
  const { metrics } = params;

  const analyses: MetricAnalysis[] = [];
  let weightedScore = 0;

  // FCP 分析
  if (metrics.firstContentfulPaint !== undefined) {
    const fcp = metrics.firstContentfulPaint;
    const rating = getRating(fcp, THRESHOLDS.fcp);
    analyses.push({
      name: 'First Contentful Paint',
      value: fcp,
      unit: 'ms',
      rating,
      description: `首内容绘制时间 ${formatTime(fcp)}${rating === 'good' ? '（优秀）' : rating === 'needs_improvement' ? '（需改进）' : '（较差）'}`,
    });
    weightedScore += getScore(rating) * WEIGHTS.fcp;
  }

  // LCP 近似分析（使用 domContentLoaded 作为参考）
  if (metrics.domContentLoaded !== undefined) {
    const dcl = metrics.domContentLoaded;
    const rating = getRating(dcl, THRESHOLDS.lcp);
    analyses.push({
      name: 'DOM Content Loaded (LCP 近似)',
      value: dcl,
      unit: 'ms',
      rating,
      description: `DOM 加载完成时间 ${formatTime(dcl)}${rating === 'good' ? '（优秀）' : rating === 'needs_improvement' ? '（需改进）' : '（较差）'}`,
    });
    weightedScore += getScore(rating) * WEIGHTS.lcp;
  }

  // 长任务分析
  if (metrics.longTaskCount !== undefined && metrics.totalLongTaskTime !== undefined) {
    const count = metrics.longTaskCount;
    const totalTime = metrics.totalLongTaskTime;
    const rating = count === 0 ? 'good' : count <= 2 ? 'needs_improvement' : 'poor';
    analyses.push({
      name: 'Long Tasks',
      value: count,
      unit: '个',
      rating,
      description: `发现 ${count} 个长任务，总计 ${totalTime}ms${rating === 'good' ? '（优秀）' : rating === 'needs_improvement' ? '（需改进）' : '（较差）'}`,
    });
    weightedScore += getScore(rating) * WEIGHTS.tbt;
  }

  // 资源分析
  if (metrics.totalResources !== undefined) {
    const count = metrics.totalResources;
    const size = metrics.totalResourceSize || 0;
    const rating = count <= 20 ? 'good' : count <= 50 ? 'needs_improvement' : 'poor';
    analyses.push({
      name: 'Resource Count',
      value: count,
      unit: '个',
      rating,
      description: `加载 ${count} 个资源，总计 ${formatSize(size)}${rating === 'good' ? '（优秀）' : rating === 'needs_improvement' ? '（需改进）' : '（较差）'}`,
    });
  }

  // 生成推荐
  const recommendations = generateRecommendations(analyses);

  // 总体评级
  const overall = weightedScore >= 0.9 ? 'good' : weightedScore >= 0.5 ? 'needs_improvement' : 'poor';

  return success(
    {
      overall,
      score: Math.round(weightedScore * 100),
      metrics: analyses,
      recommendations,
    },
    `性能分析完成，综合评分 ${Math.round(weightedScore * 100)}/100 - ${overall === 'good' ? '优秀' : overall === 'needs_improvement' ? '需改进' : '较差'}`
  );
}

function getRating(value: number, thresholds: { good: number; needsImprovement: number }): 'good' | 'needs_improvement' | 'poor' {
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.needsImprovement) return 'needs_improvement';
  return 'poor';
}

function getScore(rating: 'good' | 'needs_improvement' | 'poor'): number {
  switch (rating) {
    case 'good': return 1;
    case 'needs_improvement': return 0.5;
    case 'poor': return 0;
  }
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function generateRecommendations(analyses: MetricAnalysis[]): string[] {
  const recommendations: string[] = [];

  for (const analysis of analyses) {
    if (analysis.rating === 'poor') {
      switch (analysis.name) {
        case 'First Contentful Paint':
          recommendations.push('优化 FCP：减少服务器响应时间，消除渲染阻塞资源，启用关键 CSS 内联');
          break;
        case 'DOM Content Loaded (LCP 近似)':
          recommendations.push('优化 LCP：优化最大内容绘制元素，使用预加载，优化图片加载');
          break;
        case 'Long Tasks':
          recommendations.push('减少长任务：拆分大型 JavaScript 任务，使用 Web Worker，优化事件处理');
          break;
        case 'Resource Count':
          recommendations.push('减少资源数量：合并文件，使用雪碧图，移除未使用的依赖');
          break;
      }
    } else if (analysis.rating === 'needs_improvement') {
      switch (analysis.name) {
        case 'First Contentful Paint':
          recommendations.push('改进 FCP：考虑启用 Gzip/Brotli 压缩，优化图片格式');
          break;
        case 'DOM Content Loaded (LCP 近似)':
          recommendations.push('改进 LCP：使用图片懒加载，优化字体加载策略');
          break;
        case 'Long Tasks':
          recommendations.push('改进长任务：考虑代码分割，延迟加载非关键 JS');
          break;
      }
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('性能表现良好，继续保持！');
  }

  return recommendations;
}

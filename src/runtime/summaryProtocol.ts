/**
 * 主 Agent 摘要协议实现
 * 合并多个子 Agent 结果为结构化摘要
 */

import type { SubAgentResult, MainAgentSummary } from './parallelTypes.js';

/**
 * 合并子 Agent 结果为主 Agent 摘要
 */
export function mergeSubAgentResults(
  results: Array<{ id: string; goal: string; result: SubAgentResult }>
): MainAgentSummary {
  const completedTasks = results.filter(r => r.result.status === 'completed');
  const failedTasks = results.filter(r => r.result.status === 'failed');

  // 合并关键发现
  const allFindings = new Map<string, number>();
  for (const r of results) {
    for (const finding of r.result.key_findings) {
      const count = allFindings.get(finding) || 0;
      allFindings.set(finding, count + 1);
    }
  }

  // 合并站点经验（按域名分组）
  const domainFacts = new Map<string, Set<string>>();
  for (const r of results) {
    for (const fact of r.result.new_site_facts) {
      if (!domainFacts.has(fact.domain)) {
        domainFacts.set(fact.domain, new Set());
      }
      domainFacts.get(fact.domain)!.add(fact.fact);
    }
  }

  // 生成总体摘要
  const overallSummary = generateOverallSummary(results, completedTasks.length, failedTasks.length);

  return {
    total_tasks: results.length,
    completed_tasks: completedTasks.length,
    failed_tasks: failedTasks.length,
    overall_summary: overallSummary,
    key_findings: Array.from(allFindings.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([finding]) => finding),
    merged_site_facts: Array.from(domainFacts.entries()).map(([domain, facts]) => ({
      domain,
      facts: Array.from(facts),
    })),
    total_tokens_estimated: results.reduce((sum, r) => sum + r.result.estimated_tokens, 0),
    task_details: results.map(r => ({
      id: r.id,
      goal: r.goal,
      status: r.result.status,
      summary: r.result.summary,
      key_findings: r.result.key_findings,
    })),
  };
}

/**
 * 生成总体摘要
 */
function generateOverallSummary(
  results: Array<{ id: string; goal: string; result: SubAgentResult }>,
  completedCount: number,
  failedCount: number
): string {
  if (results.length === 0) {
    return '无任务';
  }

  const successRate = Math.round((completedCount / results.length) * 100);

  // 提取共同主题
  const allSummaries = results.map(r => r.result.summary);
  const commonThemes = extractCommonThemes(allSummaries);

  let summary = `共执行 ${results.length} 个子任务，`;

  if (completedCount > 0) {
    summary += `${completedCount} 个成功完成`;
    if (failedCount > 0) {
      summary += `，${failedCount} 个失败`;
    }
    summary += `，成功率 ${successRate}%`;
  } else {
    summary += `全部失败`;
  }

  if (commonThemes.length > 0) {
    summary += `。主要发现：${commonThemes.slice(0, 3).join('；')}`;
  }

  return summary;
}

/**
 * 提取共同主题
 */
function extractCommonThemes(summaries: string[]): string[] {
  // 简单实现：提取高频词汇
  const wordCount = new Map<string, number>();

  for (const summary of summaries) {
    const words = summary.split(/[\s,，.]+/).filter(w => w.length >= 2);
    for (const word of words) {
      const count = wordCount.get(word) || 0;
      wordCount.set(word, count + 1);
    }
  }

  // 返回出现次数最多的词
  return Array.from(wordCount.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * 生成子 Agent Prompt 模板
 */
export function generateSubAgentPrompt(params: {
  goal: string;
  successCriteria: string[];
  domain?: string;
  allowedChannels?: string[];
  tokenBudget?: number;
}): string {
  const { goal, successCriteria, domain, allowedChannels, tokenBudget } = params;

  return `# 子 Agent 任务

## 任务目标
${goal}

## 成功标准
${successCriteria.map(c => `- ${c}`).join('\n')}

## 约束条件
${domain ? `- 目标域名：${domain}` : ''}
${allowedChannels && allowedChannels.length > 0 ? `- 允许的通道：${allowedChannels.join(', ')}` : ''}
${tokenBudget ? `- Token 预算：${tokenBudget}` : ''}

## 输出要求
任务完成后必须返回结构化 JSON：

\`\`\`json
{
  "status": "completed|failed",
  "goal_met": true,
  "summary": "一句话摘要",
  "key_findings": ["发现 1", "发现 2"],
  "new_site_facts": [
    {
      "domain": "example.com",
      "fact": "经验内容",
      "confidence": "verified"
    }
  ],
  "estimated_tokens": 0,
  "artifacts": []
}
\`\`\`

## 注意事项
- 不要传递中间步骤和未经验证的推测
- 只返回关键发现和最终结果
- 如果发现新的站点经验，请记录到 new_site_facts
- token 估算要准确，避免超出预算`;
}

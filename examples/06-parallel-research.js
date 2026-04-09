/**
 * 示例 6: 多目标并行调研
 *
 * 演示如何使用子 Agent 并行调研多个目标
 */

// 自然语言调用方式：
// "同时调研这 5 个竞品的定价页面，给我对比摘要"

// 步骤 1: 注册子 Agent 任务
{
  "tool": "agent_task_register",
  "arguments": {
    "goal": "获取 competitor1.com 的定价信息",
    "successCriteria": [
      "找到定价页面",
      "提取基础版价格",
      "提取专业版价格",
      "提取企业版价格"
    ],
    "domain": "competitor1.com",
    "tokenBudget": 5000
  }
}

{
  "tool": "agent_task_register",
  "arguments": {
    "goal": "获取 competitor2.com 的定价信息",
    "successCriteria": [
      "找到定价页面",
      "提取基础版价格",
      "提取专业版价格",
      "提取企业版价格"
    ],
    "domain": "competitor2.com",
    "tokenBudget": 5000
  }
}

{
  "tool": "agent_task_register",
  "arguments": {
    "goal": "获取 competitor3.com 的定价信息",
    "successCriteria": [
      "找到定价页面",
      "提取基础版价格",
      "提取专业版价格",
      "提取企业版价格"
    ],
    "domain": "competitor3.com",
    "tokenBudget": 5000
  }
}

// 返回结果：
{
  "ok": true,
  "taskId": "task_001",
  "summary": "已注册子 Agent 任务 task_001，目标：获取 competitor1.com 的定价信息"
}

// 步骤 2: 等待所有任务完成
// （系统自动并行执行）

// 步骤 3: 合并结果
{
  "tool": "agent_result_merge",
  "arguments": {
    "taskIds": ["task_001", "task_002", "task_003"]
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "5 个竞品定价对比完成",
  "data": {
    "comparison_table": {
      "competitor1": { "basic": "$9", "pro": "$29", "enterprise": "Contact" },
      "competitor2": { "basic": "$12", "pro": "$39", "enterprise": "$99" },
      "competitor3": { "basic": "$15", "pro": "$45", "enterprise": "Contact" }
    },
    "key_findings": [
      "Competitor1 价格最低，但功能受限",
      "Competitor2 提供 14 天免费试用",
      "Competitor3 只有企业版"
    ]
  },
  "total_tokens": 8500
}

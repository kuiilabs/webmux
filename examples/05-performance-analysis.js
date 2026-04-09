/**
 * 示例 5: 网站性能分析
 *
 * 演示如何使用 DevTools 工具进行性能分析
 */

// 自然语言调用方式：
// "分析一下 https://example.com 的性能问题"

// 步骤 1: 打开页面
{
  "tool": "browser_open",
  "arguments": {
    "url": "https://example.com"
  }
}

// 步骤 2: 开始性能追踪
{
  "tool": "perf_trace_start",
  "arguments": {
    "tabId": "tab_12345"
  }
}

// 步骤 3: 等待页面完全加载
{
  "tool": "browser_wait",
  "arguments": {
    "tabId": "tab_12345",
    "selector": "body",
    "timeout": 30000
  }
}

// 步骤 4: 停止追踪并收集数据
{
  "tool": "perf_trace_stop",
  "arguments": {
    "tabId": "tab_12345"
  }
}

// 步骤 5: 分析性能
{
  "tool": "perf_analyze",
  "arguments": {
    "tabId": "tab_12345"
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "发现 3 个性能问题",
  "data": {
    "performance_score": 65,
    "metrics": {
      "fcp": "1.8s",
      "lcp": "3.2s",
      "tti": "4.5s",
      "cls": "0.15"
    },
    "issues": [
      {
        "type": "Large Images",
        "impact": "High",
        "savings": "2.3s",
        "url": "https://example.com/hero.jpg"
      },
      {
        "type": "Render Blocking JS",
        "impact": "Medium",
        "savings": "0.8s"
      }
    ]
  }
}

// 步骤 6: 查看网络请求
{
  "tool": "network_list",
  "arguments": {
    "tabId": "tab_12345",
    "filter": {
      "status": "failed"
    }
  }
}

// 步骤 7: 查看控制台错误
{
  "tool": "console_list",
  "arguments": {
    "tabId": "tab_12345",
    "level": "error"
  }
}

// 步骤 8: 关闭页面
{
  "tool": "browser_close",
  "arguments": {
    "tabId": "tab_12345"
  }
}

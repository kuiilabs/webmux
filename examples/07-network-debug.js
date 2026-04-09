/**
 * 示例 7: 网络请求调试
 *
 * 演示如何使用 network_list 和 console_list 调试 API 问题
 */

// 自然语言调用方式：
// "https://example.com 的 API 调用失败了，帮我看看"

// 步骤 1: 打开页面
{
  "tool": "browser_open",
  "arguments": {
    "url": "https://example.com"
  }
}

// 步骤 2: 等待页面加载完成
{
  "tool": "browser_wait",
  "arguments": {
    "tabId": "tab_12345",
    "selector": "body",
    "timeout": 10000
  }
}

// 步骤 3: 列出所有网络请求
{
  "tool": "network_list",
  "arguments": {
    "tabId": "tab_12345"
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "共发现 85 个网络请求",
  "data": {
    "requests": [
      {
        "url": "https://api.example.com/data",
        "method": "GET",
        "status": 200,
        "duration": "245ms",
        "size": "12KB"
      },
      {
        "url": "https://api.example.com/user",
        "method": "GET",
        "status": 401,
        "duration": "89ms",
        "error": "Unauthorized"
      }
    ],
    "failed_count": 2
  }
}

// 步骤 4: 筛选失败的请求
{
  "tool": "network_list",
  "arguments": {
    "tabId": "tab_12345",
    "filter": {
      "status_gte": 400
    }
  }
}

// 步骤 5: 查看控制台错误
{
  "tool": "console_list",
  "arguments": {
    "tabId": "tab_12345",
    "level": "error"
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "发现 2 个控制台错误",
  "data": {
    "errors": [
      {
        "message": "Failed to fetch: Network error",
        "source": "app.js:123",
        "timestamp": "2026-04-10T10:30:45.123Z"
      },
      {
        "message": "Uncaught TypeError: Cannot read property 'data' of undefined",
        "source": "main.js:45",
        "timestamp": "2026-04-10T10:30:46.456Z"
      }
    ]
  }
}

// 步骤 6: 关闭页面
{
  "tool": "browser_close",
  "arguments": {
    "tabId": "tab_12345"
  }
}

// 分析结论：
{
  "summary": "发现 2 个失败的 API 请求",
  "data": {
    "failed_requests": [
      {
        "url": "https://api.example.com/user",
        "status": 401,
        "error": "Unauthorized - Missing authentication token"
      }
    ],
    "suggestion": "需要在请求头中添加 Authorization: Bearer <token>"
  }
}

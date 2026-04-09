/**
 * 示例 4: 登录态页面访问
 *
 * 演示如何访问需要登录的页面（使用用户现有 Chrome 会话）
 */

// 自然语言调用方式：
// "帮我看看 GitHub 有什么新通知"

// 步骤 1: 列出当前所有 tab
{
  "tool": "browser_list",
  "arguments": {}
}

// 返回结果：
{
  "ok": true,
  "tabs": [
    { "tabId": "tab_001", "url": "https://github.com", "title": "GitHub" },
    { "tabId": "tab_002", "url": "https://gmail.com", "title": "Gmail" }
  ]
}

// 步骤 2: 检查是否有 GitHub tab
// 如果有，直接读取；如无，打开通知页面

{
  "tool": "browser_open",
  "arguments": {
    "url": "https://github.com/notifications"
  }
}

// 步骤 3: 等待页面加载
{
  "tool": "browser_wait",
  "arguments": {
    "tabId": "tab_12345",
    "selector": ".notification-list",
    "timeout": 10000
  }
}

// 步骤 4: 提取通知列表
{
  "tool": "browser_extract",
  "arguments": {
    "tabId": "tab_12345",
    "selector": ".notification-list",
    "extract": "list"
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "发现 3 条新通知",
  "data": {
    "notifications": [
      { "type": "PR Review Requested", "repo": "user/repo", "time": "2 小时前" },
      { "type": "Issue Comment", "repo": "user/project", "time": "5 小时前" }
    ]
  }
}

// 注意：不关闭 tab，因为用户可能还要用
// 如果要关闭：
// { "tool": "browser_close", "arguments": { "tabId": "tab_12345" } }

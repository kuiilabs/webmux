/**
 * 示例 2: 打开页面并截图
 *
 * 演示如何使用 browser_open 和 browser_screenshot
 */

// 自然语言调用方式：
// "打开 https://example.com 并截图"

// 步骤 1: 打开页面
{
  "tool": "browser_open",
  "arguments": {
    "url": "https://example.com"
  }
}

// 返回结果：
{
  "ok": true,
  "tabId": "tab_12345",
  "summary": "已打开页面 https://example.com"
}

// 步骤 2: 截图（viewport）
{
  "tool": "browser_screenshot",
  "arguments": {
    "tabId": "tab_12345",
    "fullPage": false
  }
}

// 步骤 3: 截图（全页）
{
  "tool": "browser_screenshot",
  "arguments": {
    "tabId": "tab_12345",
    "fullPage": true
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "已截取全页截图",
  "artifacts": ["/tmp/web-agent-output/screenshot-tab_12345.png"]
}

// 步骤 4: 关闭页面
{
  "tool": "browser_close",
  "arguments": {
    "tabId": "tab_12345"
  }
}

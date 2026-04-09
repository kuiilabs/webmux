/**
 * 示例 3: 填写表单并提交
 *
 * 演示如何使用 browser_fill 和 browser_click
 */

// 自然语言调用方式：
// "在 example.com/contact 填写联系表单并提交"

// 步骤 1: 打开联系页面
{
  "tool": "browser_open",
  "arguments": {
    "url": "https://example.com/contact"
  }
}

// 步骤 2: 填写表单字段
{
  "tool": "browser_fill",
  "arguments": {
    "tabId": "tab_12345",
    "selector": "#name",
    "value": "张三"
  }
}

{
  "tool": "browser_fill",
  "arguments": {
    "tabId": "tab_12345",
    "selector": "#email",
    "value": "zhangsan@example.com"
  }
}

{
  "tool": "browser_fill",
  "arguments": {
    "tabId": "tab_12345",
    "selector": "#message",
    "value": "您好，我想咨询产品价格..."
  }
}

// 步骤 3: 点击提交按钮
{
  "tool": "browser_click",
  "arguments": {
    "tabId": "tab_12345",
    "selector": "button[type='submit']"
  }
}

// 步骤 4: 等待提交结果
{
  "tool": "browser_wait",
  "arguments": {
    "tabId": "tab_12345",
    "selector": ".success-message",
    "timeout": 10000
  }
}

// 步骤 5: 截图确认
{
  "tool": "browser_screenshot",
  "arguments": {
    "tabId": "tab_12345",
    "fullPage": false
  }
}

// 步骤 6: 关闭页面
{
  "tool": "browser_close",
  "arguments": {
    "tabId": "tab_12345"
  }
}

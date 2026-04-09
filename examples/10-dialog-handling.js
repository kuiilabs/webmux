/**
 * 示例 10: 处理弹窗
 *
 * 演示如何使用 browser_dialog 处理 JavaScript 弹窗
 */

// 自然语言调用方式：
// "处理页面上的确认弹窗"

// 步骤 1: 打开可能触发弹窗的页面
{
  "tool": "browser_open",
  "arguments": {
    "url": "https://example.com/delete-item"
  }
}

// 步骤 2: 点击删除按钮（触发弹窗）
{
  "tool": "browser_click",
  "arguments": {
    "tabId": "tab_12345",
    "selector": ".delete-button"
  }
}

// 步骤 3: 等待弹窗出现
{
  "tool": "browser_wait",
  "arguments": {
    "tabId": "tab_12345",
    "selector": ".ui-dialog",
    "timeout": 5000
  }
}

// 步骤 4: 处理弹窗

// 确认（OK）
{
  "tool": "browser_dialog",
  "arguments": {
    "tabId": "tab_12345",
    "action": "accept"
  }
}

// 或取消（Cancel）
{
  "tool": "browser_dialog",
  "arguments": {
    "tabId": "tab_12345",
    "action": "dismiss"
  }
}

// 或输入文本（prompt）
{
  "tool": "browser_dialog",
  "arguments": {
    "tabId": "tab_12345",
    "action": "accept",
    "promptText": "用户输入的内容"
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "已处理确认弹窗，用户选择确认",
  "data": {
    "dialogType": "confirm",
    "action": "accept"
  }
}

// 步骤 5: 等待操作完成
{
  "tool": "browser_wait",
  "arguments": {
    "tabId": "tab_12345",
    "selector": ".success-message",
    "timeout": 5000
  }
}

// 步骤 6: 关闭页面
{
  "tool": "browser_close",
  "arguments": {
    "tabId": "tab_12345"
  }
}

/**
 * 示例 9: 文件上传
 *
 * 演示如何使用 browser_upload 上传文件
 */

// 自然语言调用方式：
// "在 example.com/upload 上传文件 test.pdf"

// 步骤 1: 打开上传页面
{
  "tool": "browser_open",
  "arguments": {
    "url": "https://example.com/upload"
  }
}

// 步骤 2: 上传文件
{
  "tool": "browser_upload",
  "arguments": {
    "tabId": "tab_12345",
    "selector": "input[type='file']",
    "filePath": "/path/to/test.pdf"
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "文件上传成功",
  "data": {
    "fileName": "test.pdf",
    "fileSize": "1.2MB",
    "uploadedPath": "/uploads/2026/04/test.pdf"
  }
}

// 步骤 3: 点击提交按钮（如果需要）
{
  "tool": "browser_click",
  "arguments": {
    "tabId": "tab_12345",
    "selector": "button[type='submit']"
  }
}

// 步骤 4: 等待上传完成
{
  "tool": "browser_wait",
  "arguments": {
    "tabId": "tab_12345",
    "selector": ".upload-success",
    "timeout": 30000
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

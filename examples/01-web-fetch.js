/**
 * 示例 1: 静态网页抓取
 *
 * 演示如何使用 web_fetch 抓取静态网页内容
 */

// 自然语言调用方式：
// "帮我抓取 https://react.dev 的核心内容"

// MCP 工具调用方式：
{
  "tool": "web_fetch",
  "arguments": {
    "url": "https://react.dev"
  }
}

// 返回结果示例：
{
  "ok": true,
  "summary": "React 官方文档首页，包含入门教程、API 参考、社区资源",
  "data": {
    "title": "React",
    "main_content": "React lets you build user interfaces out of individual pieces called components...",
    "links": [
      "https://react.dev/learn",
      "https://react.dev/reference/react"
    ]
  },
  "estimated_tokens": 3500
}

// 进阶：抓取指定深度的页面
{
  "tool": "web_fetch",
  "arguments": {
    "url": "https://react.dev/learn",
    "max_depth": 2,
    "include_images": false
  }
}

/**
 * 示例 8: 站点经验积累
 *
 * 演示如何使用 site_patterns_* 工具积累和复用站点经验
 */

// 自然语言调用方式：
// "把小红书的抓取经验记录下来"

// 步骤 1: 写入站点经验
{
  "tool": "site_patterns_write",
  "arguments": {
    "domain": "xiaohongshu.com",
    "fact": "公开笔记在未登录状态下无法稳定获取",
    "status": "verified",
    "ttl_days": 90
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "已写入新经验（TTL: 90 天，当前共 5 条）",
  "data": {
    "domain": "xiaohongshu.com",
    "fact": "公开笔记在未登录状态下无法稳定获取",
    "status": "verified",
    "written": true,
    "totalEntries": 5
  }
}

// 步骤 2: 列出所有站点经验
{
  "tool": "site_patterns_list",
  "arguments": {}
}

// 返回结果：
{
  "ok": true,
  "domains": [
    { "domain": "xiaohongshu.com", "file": "xiaohongshu.com.yml", "entries": 5 },
    { "domain": "weibo.com", "file": "weibo.com.yml", "entries": 3 },
    { "domain": "bilibili.com", "file": "bilibili.com.yml", "entries": 2 }
  ]
}

// 步骤 3: 读取特定站点经验
{
  "tool": "site_patterns_read",
  "arguments": {
    "domain": "xiaohongshu.com"
  }
}

// 返回结果：
{
  "ok": true,
  "data": {
    "domain": "xiaohongshu.com",
    "aliases": ["小红书", "xhs"],
    "entries": [
      {
        "fact": "公开笔记在未登录状态下无法稳定获取",
        "verified": "2026-04-08",
        "ttl_days": 90,
        "status": "verified"
      },
      {
        "fact": "搜索结果 URL 中常带额外上下文参数",
        "verified": "2026-04-01",
        "ttl_days": 60,
        "status": "verified"
      }
    ]
  }
}

// 步骤 4: 标记经验失效
{
  "tool": "site_patterns_invalidate",
  "arguments": {
    "domain": "xiaohongshu.com",
    "factPattern": "搜索结果"
  }
}

// 返回结果：
{
  "ok": true,
  "summary": "已标记 1 条经验失效",
  "data": {
    "domain": "xiaohongshu.com",
    "invalidated_count": 1
  }
}

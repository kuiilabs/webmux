---
name: web-agent
license: MIT
github: https://github.com/kuiilabs/webmux
description:
  面向 Agent 的统一网络操作系统。整合搜索、网页抓取、浏览器自动化、性能分析于一体。
metadata:
  author: Web Agent Team
  version: "0.1.0"
---

# Web Agent Skill

## 前置检查

在执行任何联网操作前，必须先检查依赖可用性：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/check-deps.mjs"
```

检查项：
- **Node.js 22+**：必需
- **Chrome remote-debugging**：访问 `chrome://inspect/#remote-debugging`，勾选 "Allow remote debugging"

---

## 成功标准锚定

开始任何任务前，必须先声明：

```text
任务目标：
- 要获取/验证/操作什么

完成标准：
- 至少拿到什么结果
- 结果需要什么可信度

非完成状态：
- 什么情况不算完成
```

---

## 通道选择决策树

### 一级决策：任务类型

| 任务类型 | 首选通道 |
|---------|---------|
| 搜索信息、找来源 | 静态通道 |
| 读取动态页面、登录态页面 | 浏览器通道 |
| 表单填写、文件上传、复杂交互 | 自动化通道 |
| 性能分析、网络调试、console 错误 | DevTools 通道 |

### 二级修正：优先级提升

- 需要登录态 → 浏览器/自动化优先
- 强反爬站点 → 浏览器优先
- 开发者任务 → DevTools 优先
- 页面极长 → 先采样再决定范围
- 有历史经验 → 按经验修正

### 降级链

**通用任务：**
```
Jina → WebFetch → curl → Browser → Automation
```

**开发者任务：**
```
DevTools → Browser → Automation → Static
```

**规则：**
- 降级必须记录原因
- 不对同一失败方式无意义重试

---

## Token 控制

### 预估规则
`estimated_tokens = 字符数 / 4`

### 分级处理

| 估算 token | 策略 |
|-----------|------|
| < 2k | 直接返回 |
| 2k - 8k | 局部摘要 + 保留关键段 |
| > 8k | 强制采样 / 主内容提取 |
| > 20k | 只返回摘要和文件引用 |

---

## 错误分类与处理

| 错误类型 | 示例 | 策略 |
|---------|------|------|
| 网络错误 | 超时、DNS 失败、Jina 限流 | 可重试，指数退避 |
| 页面错误 | 元素不存在、结构不符 | 换方式，不重试同一方法 |
| 反爬错误 | 验证页、访问受限 | 换 GUI 交互，放慢节奏 |
| 内容不存在 | 官方确认无此资源 | 直接结束，不重试 |

---

## 站点经验读取

确定目标网站后，检查 `references/site-patterns/` 是否有匹配文件：

```bash
ls "${CLAUDE_SKILL_DIR}/references/site-patterns/" | grep -i <domain>
```

若有匹配，必须先读取：
```bash
cat "${CLAUDE_SKILL_DIR}/references/site-patterns/<domain>.yml"
```

经验条目状态：
- `verified`：可信，直接使用
- `suspected`：谨慎对待，需验证
- `stale`：超过 TTL，以 warning 级别对待

---

## 子 Agent 协议

### 必须传递
- 任务目标
- 成功标准
- 目标站点
- 是否读取站点经验
- 允许的通道范围
- token 预算

### 不应传递
- 未经验证的推测
- 冗长的中间试错过程
- 手工猜测的 URL
- 无关页面原文

### 返回格式

子 Agent 必须返回结构化 JSON：

```json
{
  "status": "completed|failed",
  "goal_met": true,
  "summary": "一句话摘要",
  "key_findings": ["发现 1", "发现 2"],
  "new_site_facts": [],
  "estimated_tokens": 0,
  "artifacts": ["/path/to/file.png"]
}
```

---

## 浏览器操作规范

### 打开页面
优先使用后台 tab，不操作用户已有 tab。

### 关闭页面
任务完成后必须关闭自己创建的 tab，保留用户原有 tab。

### 登录判断
核心问题：**目标内容拿到了吗？**

只有当确认目标内容无法获取且登录能解决时，才告知用户：
> "当前页面在未登录状态下无法获取 [具体内容]，请在你的 Chrome 中登录 [网站名]，完成后告诉我继续。"

---

## 知识写入

任务结束后，若发现新的可复用经验，主动写入：

```bash
cat >> "${CLAUDE_SKILL_DIR}/references/site-patterns/<domain>.yml" <<EOF
  - fact: "经验内容"
    verified: $(date +%Y-%m-%d)
    ttl_days: 90
    status: verified
EOF
```

**只写验证过的事实，不写推测。**

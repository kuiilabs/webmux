# webmux 功能说明与使用教程

**版本**: 0.1.0  
**更新日期**: 2026-04-10

---

## 一、项目简介

**webmux** 是一个面向 AI Agent 的统一网络操作系统，提供完整的浏览器自动化和联网能力。

### 核心价值

> 让 Claude Code / Cursor / VS Code / Gemini CLI 等 AI 客户端都能以一致方式完成：
> - 🔍 搜索与信息发现
> - 📄 网页抓取与内容提取
> - 🖱️ 浏览器交互与表单填写
> - 🔐 登录态页面访问
> - 📊 性能分析与网络调试
> - 🔄 多目标并行调研

### 核心能力

| 能力 | 描述 |
|------|------|
| **四类通道调度** | 静态/浏览器/自动化/DevTools 智能切换 |
| **链式降级策略** | Jina → WebFetch → curl → Browser → Automation |
| **Token 预算控制** | 自动摘要 + 分块处理，防止 LLM 超支 |
| **站点经验积累** | YAML 格式存储 + TTL 过期管理 |
| **子 Agent 并行** | 多任务分治 + 结果自动合并 |

---

## 二、完整功能清单

### 28 个 MCP 工具总览

| Phase | 类别 | 工具数 |
|-------|------|--------|
| Phase 1 | 核心能力 | 11 个 |
| Phase 2 | 增强能力 | 10 个 |
| Phase 3 | 知识积累 | 4 个 |
| Phase 4 | 并行分治 | 3 个 |

---

### Phase 1 - 核心能力（11 个工具）

#### 管理类

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `health_check` | - | 检查 Node.js 版本、Chrome 远程调试可用性 |
| `browser_list` | - | 列出所有浏览器 tab（ID、URL、标题） |
| `browser_close` | `tabId` | 关闭指定 tab |

#### 浏览器核心类

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `browser_open` | `url` | 打开新 tab（后台打开，不干扰用户） |
| `browser_eval` | `tabId`, `script` | 在页面执行 JavaScript 代码 |
| `browser_extract` | `tabId`, `selector` | 智能提取主内容/链接/图片 |
| `browser_click` | `tabId`, `selector` | 点击元素（JS 点击/真实鼠标双模式） |
| `browser_scroll` | `tabId`, `direction` | 滚动页面（触发懒加载） |
| `browser_screenshot` | `tabId`, `fullPage` | 页面截图（viewport/全页） |

#### Web 抓取类

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `web_fetch` | `url` | 静态网页抓取（Jina + 缓存 + Token 控制） |

#### DevTools 类

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `network_list` | `tabId` | 列出网络请求（URL、状态码、耗时） |
| `console_list` | `tabId` | 列出控制台消息（log/error/warn） |

---

### Phase 2 - 增强能力（10 个工具）

#### 浏览器交互类

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `browser_fill` | `tabId`, `selector`, `value` | 填写表单（自动触发 React/Vue 事件） |
| `browser_upload` | `tabId`, `selector`, `filePath` | 文件上传 |
| `browser_wait` | `tabId`, `selector`, `timeout` | 等待元素/文本出现（轮询检测） |
| `browser_dialog` | `tabId`, `action` | 处理弹窗（alert/confirm/prompt） |

#### 管理类

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `port_alloc` | - | 自动分配端口（9222-9299，文件锁保护） |
| `port_release` | `port` | 释放端口 |
| `port_heartbeat` | `port` | 更新端口心跳（防止超时回收） |

#### DevTools 性能类

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `perf_trace_start` | `tabId` | 开始性能追踪 |
| `perf_trace_stop` | `tabId` | 停止追踪并收集数据 |
| `perf_analyze` | `tabId` | Lighthouse 风格性能分析 |

---

### Phase 3 - 知识积累层（4 个工具）

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `site_patterns_list` | - | 列出所有站点经验 |
| `site_patterns_read` | `domain` | 读取单个站点经验（带状态过滤） |
| `site_patterns_write` | `domain`, `fact`, `status`, `ttl_days` | 写入新经验（自动 TTL 建议） |
| `site_patterns_invalidate` | `domain`, `factPattern` | 标记经验失效 |

---

### Phase 4 - 并行分治层（3 个工具）

| 工具 | 参数 | 功能描述 |
|------|------|---------|
| `agent_task_register` | `goal`, `successCriteria`, `domain` | 注册子 Agent 任务 |
| `agent_task_release` | `taskId` | 释放/完成任务 |
| `agent_result_merge` | `taskIds` | 合并多个子 Agent 结果 |

---

## 三、安装与配置

### 3.1 系统要求

| 组件 | 版本要求 | 检查命令 |
|------|---------|---------|
| Node.js | >= 22.0.0 | `node --version` |
| npm | >= 9.0 | `npm --version` |
| Chrome | 最新版 | `chrome://version` |

### 3.2 安装步骤

```bash
# 1. 克隆项目
git clone <repo-url> webmux
cd webmux

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build

# 4. 验证安装
npm run check-deps
```

### 3.3 Chrome 配置

**必须步骤**：开启 Chrome 远程调试

1. 打开 Chrome，地址栏输入：
   ```
   chrome://inspect/#remote-debugging
   ```

2. 勾选 **"Allow remote debugging for this browser instance"**

3. 保持该页面打开（不要关闭）

### 3.4 MCP Server 配置

在 Claude Code 的 `settings.json` 中添加：

```json
{
  "mcpServers": {
    "web-agent": {
      "command": "node",
      "args": ["/path/to/webmux/dist/index.js"],
      "env": {
        "WEB_AGENT_SANDBOX_DIR": "/tmp/web-agent-work",
        "WEB_AGENT_FILE_SANDBOX_DIR": "/tmp/web-agent-files"
      }
    }
  }
}
```

---

## 四、使用教程

### 4.1 基础使用流程

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 前置检查                                           │
│  → 调用 health_check 确认环境就绪                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 声明任务目标                                       │
│  → 任务目标/完成标准/非完成状态                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 选择通道                                           │
│  → 静态/浏览器/自动化/DevTools                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 执行任务                                           │
│  → 调用对应工具                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5: 清理资源                                           │
│  → 关闭 tab / 释放端口                                      │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 通道选择决策树

| 任务类型 | 首选通道 | 降级链 |
|---------|---------|--------|
| 搜索信息/找来源 | 静态通道 | Jina → WebFetch → curl |
| 读取动态页面 | 浏览器通道 | Browser → Automation |
| 登录态页面 | 浏览器通道 | Browser（不降级） |
| 表单填写/上传 | 自动化通道 | Automation → Browser |
| 性能分析/调试 | DevTools 通道 | DevTools → Browser |

### 4.3 Token 控制策略

| 估算 Token | 处理策略 |
|-----------|---------|
| < 2k | 直接返回全文 |
| 2k - 8k | 局部摘要 + 保留关键段 |
| > 8k | 强制采样 / 主内容提取 |
| > 20k | 只返回摘要和文件引用 |

---

## 五、使用示例

### 示例 1：静态网页抓取

**场景**：抓取 React 官方文档页面内容

```
用户：帮我抓取 https://react.dev 的核心内容

Agent 执行流程：
1. 调用 health_check 确认环境就绪
2. 调用 web_fetch，参数：{ url: "https://react.dev" }
3. 系统自动选择静态通道（Jina → WebFetch）
4. 返回内容（自动 Token 控制，>8k 时触发摘要）

返回结果：
{
  "ok": true,
  "summary": "React 官方文档首页，包含入门教程、API 参考、社区资源",
  "data": {
    "title": "React",
    "main_content": "React lets you build user interfaces out of individual pieces called components...",
    "links": ["https://react.dev/learn", "https://react.dev/reference/react"]
  },
  "estimated_tokens": 3500
}
```

---

### 示例 2：动态页面内容提取

**场景**：读取小红书上的热门笔记

```
用户：读取小红书上关于"AI 工具"的最新笔记

Agent 执行流程：
1. 检查是否需要登录态 → 是，使用用户现有 Chrome 会话
2. 调用 browser_open 打开小红书搜索页
3. 调用 browser_fill 填写搜索词"AI 工具"
4. 调用 browser_click 点击搜索按钮
5. 调用 browser_wait 等待搜索结果加载
6. 调用 browser_extract 提取笔记列表
7. 调用 browser_close 关闭 tab

返回结果：
{
  "ok": true,
  "summary": "找到 15 篇 AI 工具相关笔记，按热度排序",
  "data": {
    "notes": [
      { "title": "10 款必备 AI 工具推荐", "likes": 5200, "url": "..." },
      { "title": "AI 写作工具横评", "likes": 3800, "url": "..." }
    ]
  }
}
```

---

### 示例 3：登录态页面访问

**场景**：读取 GitHub 通知列表

```
用户：帮我看看 GitHub 有什么新通知

Agent 执行流程：
1. 判断需要登录态 → 使用用户现有 Chrome 会话
2. 检查 chrome://inspect 是否有 GitHub tab
3. 如有，直接读取；如无，打开 github.com/notifications
4. 调用 browser_extract 提取通知列表
5. 返回结果（不关闭 tab，因为用户可能还要用）

返回结果：
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
```

---

### 示例 4：表单填写与提交

**场景**：自动填写联系表单

```
用户：帮我在 example.com/contact 填写并提交咨询表单

Agent 执行流程：
1. 调用 browser_open 打开联系页面
2. 调用 browser_fill 填写姓名、邮箱、主题、内容
   （自动触发 React onChange 事件）
3. 调用 browser_click 点击提交按钮
4. 调用 browser_wait 等待提交成功提示
5. 调用 browser_screenshot 截图确认
6. 调用 browser_close 关闭 tab

返回结果：
{
  "ok": true,
  "summary": "表单已成功提交，收到确认号 #12345",
  "artifacts": ["/tmp/web-agent-output/screenshot-xxx.png"]
}
```

---

### 示例 5：性能分析

**场景**：分析网站性能问题

```
用户：分析一下 https://example.com 的性能问题

Agent 执行流程：
1. 调用 browser_open 打开页面
2. 调用 perf_trace_start 开始性能追踪
3. 等待页面完全加载
4. 调用 perf_trace_stop 停止追踪并收集数据
5. 调用 perf_analyze 生成分析报告
6. 调用 network_list 查看网络请求
7. 调用 console_list 查看错误信息
8. 调用 browser_close 关闭 tab

返回结果：
{
  "ok": true,
  "summary": "发现 3 个性能问题",
  "data": {
    "performance_score": 65,
    "issues": [
      { "type": "Large Images", "impact": "High", "savings": "2.3s" },
      { "type": "Render Blocking JS", "impact": "Medium", "savings": "0.8s" }
    ],
    "network_requests": { "total": 85, "failed": 2 },
    "console_errors": 1
  }
}
```

---

### 示例 6：多目标并行调研

**场景**：调研 5 个竞品的定价页面

```
用户：同时调研这 5 个竞品的定价页面，给我对比摘要
     - competitor1.com/pricing
     - competitor2.com/pricing
     - competitor3.com/pricing
     - competitor4.com/pricing
     - competitor5.com/pricing

Agent 执行流程：
1. 注册 5 个子 Agent 任务
   → agent_task_register(goal: "获取 competitor1.com 定价信息", ...)
   → agent_task_register(goal: "获取 competitor2.com 定价信息", ...)
   → ...
2. 并行执行 5 个任务（每个任务独立浏览器 tab）
3. 等待所有任务完成
4. 调用 agent_result_merge 合并结果
5. 生成对比摘要

返回结果：
{
  "ok": true,
  "summary": "5 个竞品定价对比完成",
  "data": {
    "comparison_table": {
      "competitor1": { "basic": "$9", "pro": "$29", "enterprise": "Contact" },
      "competitor2": { "basic": "$12", "pro": "$39", "enterprise": "$99" },
      ...
    },
    "key_findings": [
      "Competitor1 价格最低，但功能受限",
      "Competitor3 提供 14 天免费试用",
      "Competitor5 只有企业版"
    ]
  },
  "total_tokens": 8500
}
```

---

### 示例 7：网络请求分析

**场景**：调试 API 调用失败

```
用户：https://example.com 的 API 调用失败了，帮我看看

Agent 执行流程：
1. 调用 browser_open 打开页面
2. 调用 network_list 列出所有网络请求
3. 筛选失败的请求（状态码 4xx/5xx）
4. 调用 console_list 查看错误信息
5. 分析请求头、响应头、错误信息
6. 调用 browser_close 关闭 tab

返回结果：
{
  "ok": true,
  "summary": "发现 2 个失败的 API 请求",
  "data": {
    "failed_requests": [
      {
        "url": "https://api.example.com/data",
        "status": 401,
        "error": "Unauthorized - Missing authentication token"
      },
      {
        "url": "https://api.example.com/upload",
        "status": 413,
        "error": "Payload Too Large"
      }
    ],
    "suggestion": "需要在请求头中添加 Authorization: Bearer <token>"
  }
}
```

---

### 示例 8：站点经验积累

**场景**：记录小红书抓取经验

```
用户：把小红书的抓取经验记录下来

Agent 执行流程：
1. 调用 site_patterns_write 写入经验
   参数：{
     domain: "xiaohongshu.com",
     fact: "公开笔记在未登录状态下无法稳定获取",
     status: "verified",
     ttl_days: 90
   }
2. 系统自动保存到 references/site-patterns/xiaohongshu.com.yml

返回结果：
{
  "ok": true,
  "summary": "已写入新经验（TTL: 90 天，当前共 5 条）",
  "data": {
    "domain": "xiaohongshu.com",
    "fact": "公开笔记在未登录状态下无法稳定获取",
    "status": "verified",
    "written": true
  }
}
```

---

## 六、错误处理

### 错误分类与应对策略

| 错误类型 | 示例 | 应对策略 |
|---------|------|---------|
| **网络错误** | 超时、DNS 失败、Jina 限流 | 指数退避重试，超过上限降级 |
| **页面错误** | 元素不存在、结构不符 | 换方式，不重试同一方法 |
| **反爬错误** | 验证页、访问受限 | 换 GUI 交互，放慢节奏 |
| **内容不存在** | 官方确认无此资源 | 直接结束，不重试 |

### 错误返回格式

```json
{
  "ok": false,
  "error": {
    "type": "network",
    "message": "请求超时（>30s）",
    "suggestion": "尝试使用浏览器通道直接访问",
    "retryable": true,
    "retry_delay_ms": 2000
  }
}
```

---

## 七、最佳实践

### 7.1 任务执行原则

1. **成功标准锚定** - 开始前声明：
   - 任务目标是什么
   - 什么叫完成
   - 哪些结果不算完成

2. **最小权限原则** - 只访问必要页面，不操作用户 tab

3. **资源及时清理** - 任务完成后关闭 tab、释放端口

4. **经验及时积累** - 发现新站点模式，及时写入站点经验

### 7.2 Token 控制技巧

| 场景 | 建议 |
|------|------|
| 大页面抓取 | 使用 browser_extract 提取主内容 |
| 列表页 | 只提取标题 + 链接，不抓取正文 |
| 多目标调研 | 使用子 Agent 并行，最后合并摘要 |
| 大文件下载 | 只返回文件路径，不返回内容 |

### 7.3 并发控制建议

| 场景 | 推荐并发数 |
|------|----------|
| 单任务 | 1-2 tabs |
| 多目标调研 | 5-10 tabs |
| 大规模爬取 | 10-20 tabs（需端口管理） |

---

## 八、常见问题 (FAQ)

### Q1: Chrome 远程调试无法连接？

**A**: 检查以下几点：
1. 确认 Chrome 已打开 `chrome://inspect/#remote-debugging`
2. 确认已勾选 "Allow remote debugging"
3. 尝试重启 Chrome

### Q2: 打开页面后无法操作？

**A**: 可能原因：
1. 页面需要登录态 → 使用用户现有 Chrome 会话
2. 页面是动态加载 → 调用 browser_wait 等待元素
3. 元素被 iframe 包裹 → 需要切换到对应 iframe

### Q3: Token 超支怎么办？

**A**: 系统会自动处理：
1. <2k: 直接返回
2. 2k-8k: 局部摘要
3. >8k: 强制采样
4. >20k: 只返回摘要和文件引用

### Q4: 如何查看已打开的 tab？

**A**: 调用 `browser_list` 列出所有 tab

### Q5: 如何复用登录态？

**A**: 不要关闭用户的 Chrome，系统会自动检测并使用现有会话

---

## 九、附录

### 9.1 环境变量配置

```bash
# 沙盒目录限制（推荐配置）
export WEB_AGENT_SANDBOX_DIR=/tmp/web-agent-work
export WEB_AGENT_FILE_SANDBOX_DIR=/tmp/web-agent-files
export WEB_AGENT_OUTPUT_DIR=/tmp/web-agent-output
```

### 9.2 安全限制常量

| 常量 | 默认值 | 说明 |
|------|--------|------|
| MAX_URL_LENGTH | 4096 | URL 最大长度 |
| MAX_SCRIPT_LENGTH | 20000 | 注入脚本最大长度 |
| MAX_HTTP_RESPONSE_BYTES | 2MB | HTTP 响应最大大小 |
| MAX_BROWSER_TARGETS | 20 | 最大浏览器 tab 数 |
| MAX_PORT_ALLOC_COUNT | 8 | 最大端口分配数 |

### 9.3 相关文档

| 文档 | 说明 |
|------|------|
| [SKILL.md](./SKILL.md) | 决策层文档 |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | 安全审计报告 |
| [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) | 竞品分析报告 |
| [OPTIMIZATION_ROADMAP.md](./OPTIMIZATION_ROADMAP.md) | 优化路线图 |

---

*文档版本：1.0*  
*最后更新：2026-04-10*

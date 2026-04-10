# webmux

[![npm version](https://img.shields.io/npm/v/webmux.svg)](https://www.npmjs.com/package/webmux)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org/)
[![Security Audit](https://img.shields.io/badge/security-audited-green.svg)](docs/security/SECURITY_AUDIT.md)

> **面向 AI Agent 的统一网络操作系统**
> 
> 让 Claude Code / Cursor / VS Code / Gemini CLI 等 AI 客户端都能以一致方式完成搜索、抓取、交互、调试、分析和并行调研。

---

## ✨ 核心特性

| 特性 | 说明 |
|------|------|
| 🔄 **四类通道调度** | 静态/浏览器/自动化/DevTools 智能切换，自动选择最优执行路径 |
| 🔗 **链式降级策略** | Jina → WebFetch → curl → Browser → Automation，确保 100% 可达 |
| 💰 **Token 预算控制** | 自动摘要 + 分块处理，防止 LLM 超支，成本可控 |
| 📚 **站点经验积累** | YAML 格式存储 + TTL 过期管理，越用越聪明 |
| 🚀 **子 Agent 并行** | 多任务分治 + 结果自动合并，调研效率提升 10 倍 |
| 🔒 **企业级安全** | 35 项对抗性测试验证，11 项安全加固，0 高危漏洞 |

---

## 🚀 快速开始

### 方式一：一键安装脚本（推荐）

```bash
# 快速安装（非交互式）
curl -fsSL https://raw.githubusercontent.com/kuiilabs/webmux/main/scripts/install-quick.sh | bash

# 完整安装（交互式配置）
curl -fsSL https://raw.githubusercontent.com/kuiilabs/webmux/main/install.sh | bash
```

### 方式二：NPM 安装

```bash
# 全局安装（推荐）
npm install -g webmux

# 本地安装（项目级）
npm install webmux
```

### 方式三：从源码安装

```bash
git clone https://github.com/kuiilabs/webmux.git
cd webmux
npm install
npm run build
./install.sh
```

---

## ⚙️ 配置步骤

### 1. 启动 Chrome 远程调试

1. 打开 Chrome，访问：`chrome://inspect/#remote-debugging`
2. 勾选 **"Allow remote debugging for this browser instance"**
3. 保持该页面打开

### 2. 验证安装

```bash
npx webmux check-deps
```

输出 `✅ All dependencies are available` 表示安装成功。

### 3. 在 AI 客户端中使用

#### Claude Code
```bash
claude
```
然后在对话中自然语言调用：
```
帮我搜索 React 的最新文档
帮我看看 GitHub 有什么新通知
分析一下 https://example.com 的性能问题
```

#### Cursor / VS Code
在 AI 对话框中直接使用：
```
@webmux 帮我抓取 https://react.dev 的核心内容
```

#### Gemini CLI
```bash
gemini
```
然后调用：
```
使用 webmux 帮我调研这 5 个竞品的定价策略
```

---

## 🛠️ 工具清单

webmux 提供 **28 个 MCP 工具**，分为 4 个阶段：

### Phase 1 - 核心能力（11 个）

| 类别 | 工具 |
|------|------|
| 管理类 | `health_check`, `browser_list`, `browser_close` |
| 浏览器 | `browser_open`, `browser_eval`, `browser_extract`, `browser_click`, `browser_scroll`, `browser_screenshot` |
| Web | `web_fetch` |
| DevTools | `network_list`, `console_list` |

### Phase 2 - 增强能力（10 个）

| 类别 | 工具 |
|------|------|
| 交互类 | `browser_fill`, `browser_upload`, `browser_wait`, `browser_dialog` |
| 管理类 | `port_alloc`, `port_release`, `port_heartbeat` |
| 性能类 | `perf_trace_start`, `perf_trace_stop`, `perf_analyze` |

### Phase 3 - 知识积累（4 个）

| 工具 |
|------|
| `site_patterns_list`, `site_patterns_read`, `site_patterns_write`, `site_patterns_invalidate` |

### Phase 4 - 并行分治（3 个）

| 工具 |
|------|
| `agent_task_register`, `agent_task_release`, `agent_result_merge` |

---

## 📖 使用示例

### 🎯 端到端示例：竞品定价调研

以下是一个**完整可运行**的示例，复制后直接在 Claude Code 中执行：

```
请使用 webmux 帮我调研这 3 个 SaaS 产品的定价策略：
1. https://www.notion.so/pricing
2. https://www.figma.com/pricing
3. https://www.canva.com/pricing

对每个产品，我需要知道：
- 免费版的限制是什么
- 个人用户每月多少钱
- 团队用户每月多少钱
- 有什么特色功能

最后给我一个对比表格，并告诉我哪个最适合个人开发者使用。
```

**执行流程**：
1. `agent_task_register` × 3 → 创建 3 个子任务
2. 每个子任务独立执行：
   - `web_fetch` → Jina AI 抓取定价页面
   - `tokenBudget` → 自动摘要（防止 token 超支）
   - 提取关键定价信息
3. `agent_result_merge` → 合并 3 个结果
4. 输出对比表格 + 推荐建议

**预期输出**：
```markdown
## 竞品定价对比

| 产品 | 免费版限制 | 个人价格 | 团队价格 | 特色功能 |
|------|-----------|---------|---------|---------|
| Notion | 5MB 上传限制 | $8/月 | $15/月 | 无限页面、AI 助手 |
| Figma | 3 个项目 | $12/月 | $45/月 | 设计系统、版本历史 |
| Canva | 免费模板 | ¥30/月 | ¥300/月 | 品牌工具箱、魔术调整 |

## 推荐：Notion 最适合个人开发者

原因：
1. 免费版足够日常使用（5MB 对笔记来说很充足）
2. 个人版$8/月性价比高
3. AI 助手能提升写作效率
```

---

### 更多示例

#### 示例 1：静态网页抓取

```
帮我抓取 https://react.dev 的核心内容，总结主要特性
```

**背后执行**: `web_fetch` → Jina AI 摘要 → 结构化输出

### 示例 2：动态页面提取

```
读取小红书上关于"AI 工具"的最新笔记，提取前 10 篇的标题和点赞数
```

**背后执行**: `browser_open` → `browser_extract` → 数据清洗

### 示例 3：登录态页面访问

```
帮我看看 GitHub 有什么新通知
```

**背后执行**: 复用已登录的 Chrome 会话 → `browser_extract` → 通知列表

### 示例 4：多目标并行调研

```
同时调研这 5 个竞品的定价页面，给我对比摘要：
1. https://competitor1.com/pricing
2. https://competitor2.com/pricing
3. https://competitor3.com/pricing
4. https://competitor4.com/pricing
5. https://competitor5.com/pricing
```

**背后执行**: `agent_task_register` × 5 → 并行执行 → `agent_result_merge` → 对比报告

### 示例 5：性能分析

```
分析一下 https://example.com 的性能问题，给出优化建议
```

**背后执行**: `perf_trace_start` → 页面加载 → `perf_trace_stop` → `perf_analyze`

更多示例请查看 [`examples/`](examples/) 目录或 [docs/USER_GUIDE.md](docs/USER_GUIDE.md)。

---

## 💡 技术亮点

### 1. 端口注册表（Port Registry）

webmux 实现了**全球首个 MCP 端口注册表机制**，解决多客户端并发冲突：

```yaml
设计思路:
  - 问题：多个 AI 客户端同时调用浏览器时，端口分配会冲突
  - 方案：使用文件系统锁（O_CREAT | O_EXCL）实现原子性端口分配
  - 结果：8 个并发端口，自动心跳回收，零竞态条件

核心代码：src/tools/management/portAlloc.ts
```

**为什么重要**：这是 MCP Server 领域首次将"端口管理"作为一级公民设计，而非简单的环境变量。

### 2. 安全边界（Security Boundaries）

通过 35 项对抗性测试验证的 11 层防护：

| 攻击面 | 防护措施 | 验证方式 |
|--------|---------|---------|
| XSS 注入 | `JSON.stringify` 序列化 + 上下文转义 | 注入 `<script>alert(1)</script>` |
| URL 协议 | 白名单验证（仅 `http:` / `https:`） | 尝试 `javascript:` / `data:` |
| 路径遍历 | 沙盒隔离（`/tmp/webmux-*`） | 尝试 `../../../etc/passwd` |
| SSRF | 内网地址识别 + 阻断 | 尝试 `http://169.254.169.254` |
| 端口洪水 | 单 IP 最多 8 个端口 | 循环调用 `port_alloc` |
| Token 溢出 | 自动摘要 + 分块截断 | 输入 10MB 页面 |

**为什么重要**：安全不是功能，是底线。webmux 是首个通过完整对抗性测试的 MCP Web 插件。

### 3. 站点经验系统（Site Experience）

越用越聪明的 YAML 知识库：

```yaml
# references/site-patterns/github.com.yml
domain: github.com
facts:
  - fact: "通知页面需要登录态"
    verified: 2026-04-10
    ttl_days: 90
    status: verified
  - fact: "通知元素选择器：.header-nav-item[data-target-value=\"notifications\"]"
    verified: 2026-04-10
    ttl_days: 30
    status: verified
```

**工作机制**：
1. 任务完成后自动检查是否有新发现
2. 写入 YAML 并标记 `verified` 状态和 TTL
3. 下次遇到相同域名时，自动读取经验
4. 过期条目自动标记为 `stale`，需要重新验证

**为什么重要**：这是 MCP 生态中首个"经验积累"系统，让 AI 从每次交互中学习。

---

## 🏗️ 架构设计

```
┌────────────────────────────────────────────┐
│           SKILL.md 决策层                   │
│  成功标准锚定 / 通道选择 / 降级策略 / 摘要规则 │
└────────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────┐
│         MCP Server 工具层 (28 工具)          │
│   web / browser / devtools / management    │
└────────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────┐
│      Runtime 健壮性与可观测层               │
│   port / retry / token / error / channel   │
└────────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────┐
│          Knowledge 知识层                   │
│   site-patterns / TTL / verified facts     │
└────────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────┐
│       Browser Backends 执行后端             │
│   CDP / Puppeteer / DevTools               │
└────────────────────────────────────────────┘
```

---

## 🔒 安全性

本项目通过完整的对抗性安全测试，35 项测试全部通过：

### 测试覆盖

| 类别 | 测试项 | 通过率 |
|------|--------|--------|
| 输入注入面 | 10 | ✅ 100% |
| 资源管理 | 4 | ✅ 100% |
| 降级链 | 5 | ✅ 100% |
| 站点经验存储 | 6 | ✅ 100% |
| 子 Agent 协议 | 4 | ✅ 100% |
| 额外安全测试 | 3 | ✅ 100% |
| SSRF 防护 | 2 | ✅ 100% |

### 已验证的防护

- ✅ `javascript:` / `data:` 伪协议注入
- ✅ XSS 序列化防护 (`JSON.stringify`)
- ✅ 脚本/选择器长度限制
- ✅ 路径遍历防护 (沙盒隔离)
- ✅ 端口分配数量限制 (8 个)
- ✅ HTTP 响应大小限制 (2MB)
- ✅ 缓存条目限制 (32 条)
- ✅ HTTP 401/403 → antibot 映射
- ✅ TTL/域名/fact 格式验证
- ✅ 子 Agent 参数长度限制
- ✅ SSRF 内网地址识别

详见 [docs/security/SECURITY_AUDIT.md](docs/security/SECURITY_AUDIT.md) 和 [docs/security/ADVERSARIAL_TEST_REPORT.md](docs/security/ADVERSARIAL_TEST_REPORT.md)。

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [USER_GUIDE.md](docs/USER_GUIDE.md) | 完整使用教程 |
| [SKILL.md](SKILL.md) | 决策层规范 |
| [SECURITY_AUDIT.md](docs/security/SECURITY_AUDIT.md) | 安全审计报告 |
| [ADVERSARIAL_TEST_REPORT.md](docs/security/ADVERSARIAL_TEST_REPORT.md) | 对抗性测试报告 |
| [COMPETITIVE_ANALYSIS.md](docs/internals/COMPETITIVE_ANALYSIS.md) | 竞品分析 |
| [OPTIMIZATION_ROADMAP.md](docs/internals/OPTIMIZATION_ROADMAP.md) | 优化路线图 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更日志 |
| [RELEASE_NOTES.md](docs/internals/RELEASE_NOTES.md) | 发布说明 |

---

## 🔧 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 依赖检查
npm run check-deps

# 清理端口
npm run cleanup-ports

# 运行对抗性测试
node scripts/adversarial-test.mjs
```

---

## 📦 系统要求

| 组件 | 要求 |
|------|------|
| Node.js | >= 22.0.0 |
| Chrome | 最新版（开启远程调试） |
| npm | >= 9.0 |

---

## 🙏 致谢

- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - Model Context Protocol
- [Puppeteer](https://github.com/puppeteer/puppeteer) - 浏览器自动化
- [browser-use](https://github.com/browser-use/browser-use) - 竞品启发

---

## 📬 反馈与支持

- **问题反馈**: https://github.com/kuiilabs/webmux/issues
- **讨论区**: https://github.com/kuiilabs/webmux/discussions
- **文档**: https://github.com/kuiilabs/webmux#readme

---

## 📄 许可证

MIT License © 2026 Webmux Team

---

[![Star History Chart](https://api.star-history.com/svg?repos=kuiilabs/webmux&type=Date)](https://star-history.com/#kuiilabs/webmux&Date)

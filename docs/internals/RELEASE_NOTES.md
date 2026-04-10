# webmux v0.1.0 发布说明

**发布日期**: 2026-04-10  
**版本**: 0.1.0 (Alpha)  
**状态**: 可公开发布

---

## 🎉 发布亮点

### 核心功能
- ✅ **28 个 MCP 工具** 全部实现并可用
- ✅ **四层架构** 完整落地（决策层、工具层、健壮性层、知识层）
- ✅ **四类通道** 统一调度（静态、浏览器、自动化、DevTools）
- ✅ **企业级安全** - 通过对抗性测试，11 个安全问题已修复
- ✅ **完整文档** - 8 份详细文档，10 个实用示例

### 与竞品对比

| 项目 | 工具数 | 通道路由 | 知识积累 | 并行分治 | 安全审计 |
|------|--------|---------|---------|---------|---------|
| **webmux** | **28** | ✅ | ✅ | ✅ | ✅ |
| web-access | ~10 | ⚠️ | ⚠️ | ⚠️ | ❌ |
| browser-use | ~15 | ❌ | ❌ | ❌ | ❌ |
| Stagehand | ~8 | ❌ | ❌ | ❌ | ❌ |

---

## 📦 安装方式

### 方式一：一键安装脚本（推荐）

```bash
# 快速安装
curl -fsSL https://raw.githubusercontent.com/kuiilabs/webmux/main/scripts/install-quick.sh | bash

# 或完整安装（带交互配置）
curl -fsSL https://raw.githubusercontent.com/kuiilabs/webmux/main/install.sh | bash
```

### 方式二：NPM 安装

```bash
# 全局安装
npm install -g webmux

# 本地安装
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

### 1. Chrome 远程调试

1. 打开 Chrome，访问：`chrome://inspect/#remote-debugging`
2. 勾选 **"Allow remote debugging for this browser instance"**
3. 保持该页面打开

### 2. 验证安装

```bash
npx web-agent check-deps
```

### 3. 在 Claude Code 中使用

安装完成后，重启 Claude Code，然后可以自然语言调用：

```
帮我搜索 React 的最新文档
帮我看看 GitHub 有什么新通知
分析一下 https://example.com 的性能问题
```

---

## 🛠️ 工具清单

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

### 1. 静态网页抓取
```
帮我抓取 https://react.dev 的核心内容
```

### 2. 动态页面提取
```
读取小红书上关于"AI 工具"的最新笔记
```

### 3. 登录态页面访问
```
帮我看看 GitHub 有什么新通知
```

### 4. 多目标并行调研
```
同时调研这 5 个竞品的定价页面，给我对比摘要
```

### 5. 性能分析
```
分析一下 https://example.com 的性能问题
```

更多示例请查看 `examples/` 目录或 [USER_GUIDE.md](./USER_GUIDE.md)。

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 项目介绍和快速开始 |
| [USER_GUIDE.md](./USER_GUIDE.md) | 完整使用教程 |
| [SKILL.md](./SKILL.md) | 决策层规范 |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | 安全审计报告 |
| [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) | 竞品分析报告 |
| [OPTIMIZATION_ROADMAP.md](./OPTIMIZATION_ROADMAP.md) | 优化路线图 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更日志 |

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
```

---

## 🛡️ 安全性

本项目通过完整的对抗性安全测试，修复了 11 个安全问题：

- ✅ XSS 注入防护（`browser_eval`, `browser_fill`）
- ✅ URL 协议验证（`browser_open`）
- ✅ 路径遍历防护（文件操作）
- ✅ 端口锁竞态条件修复（`port_alloc`）
- ✅ HTTP 响应大小限制（`webFetch`）
- ✅ Token 预算异常处理（`tokenBudget`）

详见 [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)。

---

## 📊 系统要求

| 组件 | 要求 |
|------|------|
| Node.js | >= 22.0.0 |
| Chrome | 最新版（开启远程调试） |
| npm | >= 9.0 |

---

## 🚧 已知限制（Alpha 版本）

1. **多 LLM 支持** - 当前主要支持 MCP 默认 LLM，多提供商支持在开发中
2. **LangChain 集成** - 计划在 v0.2.0 实现
3. **自然语言控制** - 计划在 v0.3.0 实现
4. **CV 元素定位** - 计划在 v1.0.0 探索

---

## 🗺️ 路线图

### v0.2.0 (2026 Q2)
- [ ] 多 LLM 提供商支持（OpenAI/Google/Groq/Ollama）
- [ ] LangChain 集成
- [ ] GitHub 1k stars

### v0.3.0 (2026 Q3)
- [ ] 自然语言控制
- [ ] 性能优化
- [ ] 月活 100+ 用户

### v1.0.0 (2026 Q4)
- [ ] CV 融合探索
- [ ] 云服务方案
- [ ] 付费用户 10+

详见 [OPTIMIZATION_ROADMAP.md](./OPTIMIZATION_ROADMAP.md)。

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

**发布人**: webmux Team  
**发布日期**: 2026-04-10

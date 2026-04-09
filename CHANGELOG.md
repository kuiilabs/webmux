# 变更日志

所有重要的项目变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 计划功能
- 多 LLM 提供商支持（OpenAI/Google/Groq/Ollama）
- LangChain 集成
- 自然语言控制
- CV 元素定位

## [0.1.0] - 2026-04-10

### 新增
- **28 个 MCP 工具** 全部实现并可用
  - Phase 1: 健康检查、浏览器基础操作、web_fetch、DevTools
  - Phase 2: 表单填写、文件上传、端口管理、性能分析
  - Phase 3: 站点经验读写、TTL 管理
  - Phase 4: 子 Agent 并行分治

### 架构
- 四层架构完整落地（决策层、工具层、健壮性层、知识层）
- 四类通道统一调度（静态、浏览器、自动化、DevTools）
- 链式降级策略实现
- Token 预算控制系统

### 安全
- 通过对抗性安全测试
- 修复 11 个安全问题
  - XSS 注入防护（browser_eval, browser_fill）
  - URL 协议验证（browser_open）
  - 路径遍历防护（文件操作）
  - 端口锁竞态条件修复
  - HTTP 响应大小限制
  - Token 预算异常处理
- 新增安全辅助模块（security.ts, cdpProxy.ts）

### 文档
- README.md - 项目介绍和快速开始
- USER_GUIDE.md - 完整使用教程
- SKILL.md - 决策层规范
- SECURITY_AUDIT.md - 安全审计报告
- COMPETITIVE_ANALYSIS.md - 竞品分析报告
- REGRESSION_TEST_REPORT.md - 回归测试报告
- PROJECT_GOAL_ASSESSMENT.md - 目标达成度评估
- OPTIMIZATION_ROADMAP.md - 优化路线图

### 示例
- 10 个实用示例代码
  - 静态网页抓取
  - 页面截图
  - 表单填写提交
  - 登录态页面访问
  - 性能分析
  - 多目标并行调研
  - 网络请求调试
  - 站点经验积累
  - 文件上传
  - 弹窗处理

### 工具
- install.sh - 一键安装脚本
- scripts/install-quick.sh - 快速安装脚本
- scripts/check-deps.mjs - 依赖检查
- scripts/cleanup-ports.mjs - 端口清理

---

## 版本说明

### 0.1.0 (2026-04-10)
- **状态**: Alpha 版本
- **适用场景**: 内部使用、开发测试
- **下一步**: GitHub 公开发布、NPM 发布

# webmux 项目方案 v1

## 1. 项目定位

**webmux** 是一个以 Plugin 为交付形态的统一浏览器/联网执行框架。

它融合两类能力：

- **web-access 的 Skill 决策哲学**
- **DevTools / 浏览器自动化的工程化工具能力**

目标不是做另一个“会搜索网页的 skill”，而是做一个：

> **面向 Agent 的统一网络操作系统**  
> 让 Claude Code / Gemini CLI / Cursor / VS Code 等客户端都能以一致方式完成搜索、抓取、交互、调试、分析、并行调研。

---

# 2. 产品目标

## 2.1 核心目标
解决现有方案的四个断层：

1. **决策层与执行层分裂**
2. **浏览器工具、联网工具、调试工具没有统一调度**
3. **站点经验不可结构化复用**
4. **长任务、多 Agent、复杂页面下稳定性不足**

## 2.2 最终能力目标
Plugin 安装后，Agent 能统一完成：

- 搜索与信息发现
- 静态网页提取
- 登录态页面访问
- 表单填写、点击、上传、等待
- 页面调试、网络分析、性能分析
- 多目标并行调研
- 站点经验积累与复用
- token 预算控制与大结果摘要
- 自动降级与错误恢复

---

# 3. 架构总览

```text
┌────────────────────────────────────────────┐
│                SKILL.md 决策层              │
│ 成功标准锚定 / 通道选择 / 降级策略 / 摘要规则 │
└────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────┐
│              MCP Server 工具层              │
│ web / browser / devtools / management      │
└────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────┐
│           Runtime 健壮性与可观测层           │
│ port / retry / circuit breaker / token     │
└────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────┐
│              Knowledge 知识层               │
│ site-patterns / TTL / verified facts       │
└────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────┐
│          Browser Backends 执行后端          │
│ CDP / DevTools / Automation / Static Fetch │
└────────────────────────────────────────────┘
```

---

# 4. 五层职责定义

## 4.1 决策层：SKILL.md
负责：
- 判断任务成功标准
- 选择通道
- 触发降级
- 控制是否摘要/采样
- 规定子 Agent 协议

不负责：
- 真正执行浏览器动作
- 实现工具逻辑
- 管理底层连接细节

---

## 4.2 工具层：TypeScript MCP Server
负责：
- 暴露 MCP 工具
- 统一输入输出格式
- 抽象底层浏览器和网页能力
- 返回语义摘要或文件引用

不负责：
- 决定该选哪个通道
- 推理业务目标

---

## 4.3 健壮性层
负责：
- 端口分配
- 连接探活
- 分类重试
- Jina 熔断
- token 预估
- 大结果自动摘要

---

## 4.4 知识层
负责：
- 站点经验存储
- TTL / stale 状态
- verified / suspected 区分
- 程序化增删改查

---

## 4.5 并行分治层
负责：
- 子 Agent 上下文协议
- 端口/资源分配
- 结构化摘要返回
- 主 Agent 汇总合并

---

# 5. 通道模型定稿

这是系统最核心的能力之一。

## 5.1 四类通道

### A. 静态通道
适合：
- 文档
- 博客
- 文章
- 官网说明页
- 已知 URL 的定向提取

组成：
- WebSearch
- WebFetch
- curl
- Jina

---

### B. 浏览器通道
适合：
- 动态页面
- 懒加载
- Shadow DOM / iframe
- 登录态页面
- 需要 DOM 提取

组成：
- CDP
- browser_open / eval / extract / screenshot / scroll

---

### C. 自动化通道
适合：
- 表单填写
- 文件上传
- 点击后等待状态变化
- 弹窗处理
- 稳定执行用户动作链

组成：
- click
- fill
- upload
- wait
- dialog
- 可接 Puppeteer / Playwright 风格后端

---

### D. DevTools 通道
适合：
- 性能问题
- 网络请求分析
- console 错误分析
- memory snapshot
- Lighthouse / CrUX

组成：
- perf_trace_start/stop
- perf_analyze
- network_list
- console_list
- memory_snapshot

---

# 6. 通道选择规则

## 6.1 一级决策
先判断任务类型：

| 任务类型 | 默认通道 |
|---------|---------|
| 搜信息 / 找来源 | 静态通道 |
| 读动态页面 / 登录态页面 | 浏览器通道 |
| 操作页面 / 提交表单 / 上传 | 自动化通道 |
| 调试 / 性能 / 网络 / 控制台 | DevTools 通道 |

---

## 6.2 二级修正
若命中以下情况，提升优先级：

- 页面需要登录态 → 浏览器/自动化优先
- 页面强反爬 → 浏览器优先
- 是开发者任务 → DevTools 优先
- 页面极长 → 先采样
- 有历史站点经验 → 按经验修正首选通道

---

## 6.3 降级链
默认降级链：

```text
Jina → WebFetch → curl → Browser → Automation
```

开发者任务降级链：

```text
DevTools → Browser → Automation → Static
```

说明：
- 不是所有任务都走完整链
- 降级必须带原因
- 不允许对同一失败方式无意义重试

---

# 7. 成功标准锚定机制

每次任务开始时，Skill 必须先定义：

1. **目标是什么**
2. **什么叫完成**
3. **哪些结果不算完成**

模板：

```text
任务目标：
- 获取/验证/操作什么

完成标准：
- 至少拿到什么结果
- 结果需要什么可信度

非完成状态：
- 只有搜索结果但无原始来源
- 只有页面截图但未提取目标信息
- 页面打开成功但操作未完成
```

作用：
- 避免越做越偏
- 避免抓太多无关内容
- 避免“做了很多但没完成”

---

# 8. 工具集合定稿

## 8.1 Phase 1 MVP 工具
这些工具必须第一批实现。

### 管理类
- `health_check`
- `browser_list`
- `browser_close`

### 采集类
- `web_fetch`
- `browser_open`
- `browser_eval`
- `browser_extract`
- `browser_screenshot`
- `browser_scroll`

### 交互类
- `browser_click`

### DevTools 类
- `network_list`
- `console_list`

> 注：Phase 1 的 DevTools 不追求全，先具备最小可分析能力。

---

## 8.2 Phase 2 工具
- `browser_fill`
- `browser_upload`
- `browser_wait`
- `browser_dialog`
- `port_alloc`
- `perf_trace_start`
- `perf_trace_stop`
- `perf_analyze`
- `memory_snapshot`

---

## 8.3 Phase 3 工具
知识层工具：
- `site_patterns_list`
- `site_patterns_read`
- `site_patterns_write`
- `site_patterns_invalidate`

---

## 8.4 Phase 4 工具
并行层工具：
- `agent_task_register`
- `agent_task_release`
- `agent_result_merge`

如果觉得太重，这一层也可以先不暴露成 MCP 工具，而作为内部 runtime 模块。

---

# 9. 工具返回规范

所有工具必须遵守统一返回原则。

## 9.1 统一结构
建议统一字段：

```json
{
  "ok": true,
  "summary": "页面已打开并提取主内容，共发现 12 个段落",
  "data": {},
  "artifacts": [],
  "warnings": [],
  "next_suggestion": "如需继续，可调用 browser_extract 获取正文"
}
```

---

## 9.2 规则
- 小结果：直接返回语义摘要 + 小体量结构化数据
- 大结果：返回文件路径，不返回原始大内容
- 错误：必须包含原因 + 下一步建议
- 截图 / trace / snapshot：只返回文件路径
- DOM 大片段：必须裁剪或摘要

---

# 10. 错误分类规范

错误统一分四类：

## 10.1 网络错误
例：
- 超时
- DNS 失败
- 连接拒绝
- Jina 限流

策略：
- 可重试
- 指数退避
- 超过上限则降级

---

## 10.2 页面错误
例：
- 目标元素不存在
- 页面结构不符
- URL 参数缺失

策略：
- 不在同一方式上重试
- 改用其他通道或其他提取方式

---

## 10.3 反爬错误
例：
- 验证页
- 访问受限
- 异常频率提示
- 假“内容不存在”

策略：
- 换 GUI 交互方式
- 放慢节奏
- 记录反爬迹象

---

## 10.4 内容不存在
例：
- 目标确实无此资源
- 官方页面确认不存在

策略：
- 直接结束
- 不重试
- 明确告诉用户“未找到”而非“出错”

---

# 11. Token 控制策略

这是你的方案里非常关键的一部分，必须落地。

## 11.1 预估规则
粗略规则：
- `estimated_tokens = 字符数 / 4`

## 11.2 分级处理
| 估算 token | 策略 |
|-----------|------|
| < 2k | 直接返回 |
| 2k - 8k | 局部摘要 + 保留关键段 |
| > 8k | 强制采样 / 主内容提取 / 分页处理 |
| > 20k | 禁止全量进入上下文，只返回摘要和 artifacts |

## 11.3 使用场景
- `web_fetch`
- `browser_eval`
- `browser_extract`
- 子 Agent 返回结果
- 站点列表页采集

---

# 12. 知识层定稿

## 12.1 存储格式
每个域名一个文件。

示例：

```yaml
domain: xiaohongshu.com
aliases: [小红书, xhs]
schema_version: 2
entries:
  - fact: "公开笔记在未登录状态下经常不可稳定获取"
    verified: 2026-04-07
    ttl_days: 90
    status: verified
  - fact: "搜索结果 URL 中常带额外上下文参数"
    verified: 2026-03-12
    ttl_days: 60
    status: stale
```

可在 YAML 后追加 Markdown：
- 平台特征
- 有效模式
- 已知陷阱

---

## 12.2 状态定义
- `verified`：本次或近期任务验证过
- `suspected`：有迹象但未充分验证
- `stale`：超过 TTL 未验证
- `invalid`：确认失效

---

## 12.3 写入原则
只写：
- 本次任务验证过的事实
- 对未来任务真的有帮助的模式

不写：
- 猜测
- 临时页面状态
- 用户私有内容
- 偶发异常当成常识

---

# 13. 子 Agent 协议定稿

## 13.1 必传上下文
子 Agent 必须收到：
- 任务目标
- 成功标准
- 指定目标站点
- 是否需要读取站点经验
- 允许的通道范围
- token 输出预算

## 13.2 不应传递
- 主 Agent 的未经验证推测
- 冗长的中间试错过程
- 手工猜测 URL
- 无关页面原文

---

## 13.3 子 Agent 返回 JSON 结构
建议统一：

```json
{
  "status": "completed",
  "goal_met": true,
  "summary": "已获取 3 个官网价格页面并提取关键差异",
  "key_findings": [
    "A 支持免费套餐",
    "B 企业版需联系销售"
  ],
  "new_site_facts": [
    {
      "domain": "example.com",
      "fact": "价格页数据由前端接口动态加载",
      "confidence": "verified"
    }
  ],
  "estimated_tokens": 1800,
  "artifacts": []
}
```

---

# 14. 目录结构定稿

```text
web-agent/
├── README.md
├── SKILL.md
├── server.json
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── tools/
│   │   ├── web/
│   │   │   └── webFetch.ts
│   │   ├── browser/
│   │   │   ├── open.ts
│   │   │   ├── eval.ts
│   │   │   ├── extract.ts
│   │   │   ├── click.ts
│   │   │   ├── screenshot.ts
│   │   │   ├── scroll.ts
│   │   │   ├── close.ts
│   │   │   └── list.ts
│   │   ├── devtools/
│   │   │   ├── networkList.ts
│   │   │   ├── consoleList.ts
│   │   │   ├── perfTraceStart.ts
│   │   │   ├── perfTraceStop.ts
│   │   │   ├── perfAnalyze.ts
│   │   │   └── memorySnapshot.ts
│   │   └── management/
│   │       ├── healthCheck.ts
│   │       └── portAlloc.ts
│   ├── runtime/
│   │   ├── channelRouter.ts
│   │   ├── tokenBudget.ts
│   │   ├── retryPolicy.ts
│   │   ├── circuitBreaker.ts
│   │   ├── portRegistry.ts
│   │   └── errorClassifier.ts
│   ├── backends/
│   │   ├── cdp/
│   │   ├── automation/
│   │   ├── devtools/
│   │   └── static/
│   ├── knowledge/
│   │   ├── schema.ts
│   │   ├── store.ts
│   │   ├── ttl.ts
│   │   └── formatter.ts
│   └── shared/
│       ├── types.ts
│       ├── result.ts
│       ├── constants.ts
│       └── logger.ts
├── references/
│   ├── cdp-api.md
│   └── site-patterns/
│       └── xiaohongshu.com.yml
└── scripts/
    ├── check-deps.mjs
    ├── dev.mjs
    └── cleanup-ports.mjs
```

---

# 15. 模块边界

## 15.1 `tools/`
只做：
- 参数校验
- 调 runtime/backend
- 组织统一返回结构

不要在这里写复杂业务逻辑。

---

## 15.2 `runtime/`
这里是系统大脑：
- 路由
- 错误分类
- token 控制
- 重试
- 熔断
- 端口管理

---

## 15.3 `backends/`
这里是执行器：
- 调 CDP
- 调浏览器
- 调静态抓取
- 调 DevTools

---

## 15.4 `knowledge/`
这里只做经验库读写与状态维护，不参与页面执行。

---

# 16. Phase 1 MVP 范围

这是最重要的开工范围。

## 16.1 必做
### Plugin 基础
- `server.json`
- `package.json`
- `SKILL.md`
- MCP server 主入口

### 核心工具
- `health_check`
- `web_fetch`
- `browser_open`
- `browser_eval`
- `browser_extract`
- `browser_click`
- `browser_screenshot`
- `browser_scroll`
- `browser_list`
- `browser_close`

### runtime 最小集
- `channelRouter`
- `tokenBudget`
- `errorClassifier`
- `result formatter`

### 知识层最小集
- 只读已有站点经验
- 支持手动 write
- 暂不自动 TTL 清理

---

## 16.2 暂缓
- `port_alloc`
- `browser_fill`
- `browser_upload`
- `browser_wait`
- `browser_dialog`
- `perf_trace_*`
- `memory_snapshot`
- 子 Agent JSON 自动合并
- Jina 熔断器完整版
- 自动 TTL 巡检器

---

# 17. 第一版开发顺序

按这个顺序做最稳。

## Step 1
搭建 Plugin 骨架
- package.json
- tsconfig
- server.json
- src/index.ts
- SKILL.md

## Step 2
统一返回结构
- `shared/result.ts`
- `shared/types.ts`

## Step 3
接通浏览器最小链路
- `browser_open`
- `browser_eval`
- `browser_close`
- `browser_list`

## Step 4
做内容提取链路
- `web_fetch`
- `browser_extract`
- `browser_screenshot`
- `browser_scroll`

## Step 5
加入决策层规则
- 成功标准锚定
- 通道路由规则
- 显式降级说明

## Step 6
加入基础 runtime
- tokenBudget
- errorClassifier

## Step 7
接知识层最小版本
- site-patterns 读取
- 手动写入能力

## Step 8
做一个端到端 demo
例如：
- “读取动态页面主内容”
- “登录态页面提取信息”
- “分析一个页面的请求错误”

---

# 18. 第一版验收标准

Phase 1 完成时，至少要满足：

1. 能作为 Plugin 安装
2. 能统一执行静态抓取和浏览器抓取
3. Agent 能根据任务选择通道
4. 降级原因可见
5. 大结果不会直接冲爆上下文
6. 能读取站点经验
7. 能完成至少 3 类真实任务：
   - 文档提取
   - 动态页面内容提取
   - 基础网络/控制台分析

---

# 19. 最终评价

## 为什么这个版本可开工
因为它同时满足三点：

- **保留你的目标架构**
- **控制初版范围**
- **把真正有壁垒的部分放在前面**

## 这个项目真正的价值不在“能打开浏览器”
而在于这四个系统能力：

1. **统一调度**
2. **稳定降级**
3. **经验积累**
4. **多 Agent 协议化协作**

这四个才是你的项目区别于 web-access、chrome-devtools-mcp、playwright 脚本集合的根本。

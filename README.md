# Web Agent Plugin

> 面向 Agent 的统一网络操作系统

## 安装

```bash
# 方式一：让 Claude 自动安装
帮我安装这个 plugin: <repo-url>

# 方式二：手动安装
git clone <repo-url> ~/.claude/skills/web-agent
```

## 前置配置

### Node.js 22+

```bash
node --version  # 必须 >= 22.0.0
```

### Chrome Remote Debugging

1. Chrome 地址栏输入：`chrome://inspect/#remote-debugging`
2. 勾选 **"Allow remote debugging for this browser instance"**
3. 可能需要重启浏览器

## 使用示例

### 基础使用

```
# 搜索与信息发现
帮我搜索 React 19 的最新变化

# 静态网页提取
读取这个文档的核心内容：https://example.com/docs

# 动态页面内容
读取小红书上关于 xxx 的最新笔记

# 性能分析
分析一下这个页面的性能问题：https://example.com
```

### 高级使用

```
# 多目标并行调研
同时调研这 5 个竞品的定价页面，给我对比摘要

# 登录态页面
帮我读取我的 GitHub 通知列表

# 性能调试
分析这个页面的网络请求和 console 错误
```

## 通道选择

Web Agent 自动根据任务类型选择通道：

| 通道 | 适用场景 |
|------|---------|
| 静态通道 | 文档、博客、文章、官网 |
| 浏览器通道 | 动态页面、登录态、懒加载 |
| 自动化通道 | 表单填写、文件上传、复杂交互 |
| DevTools 通道 | 性能分析、网络调试、console 错误 |

## 站点经验

特定网站的操作经验存储在 `references/site-patterns/` 目录下。

每个域名一个 YAML 文件，包含：
- 平台特征
- 有效模式
- 已知陷阱

经验会自动积累和过期（TTL 机制）。

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 检查依赖
npm run check-deps
```

## 目录结构

```
web-agent/
├── SKILL.md              # Skill 决策层
├── server.json           # MCP Server 配置
├── package.json          # 项目配置
├── tsconfig.json         # TypeScript 配置
├── src/                  # 源代码
│   ├── index.ts          # 入口
│   ├── tools/            # MCP 工具
│   ├── runtime/          # 运行时
│   ├── backends/         # 后端适配
│   └── knowledge/        # 知识层
└── references/           # 参考资料和站点经验
```

## License

MIT

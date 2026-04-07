/**
 * 工具注册中心
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolResult } from '../shared/types.js';

// Phase 1 MVP 工具 - 管理类
import { healthCheck } from './management/healthCheck.js';
import { browserList } from './browser/list.js';
import { browserClose } from './browser/close.js';

// Phase 1 MVP 工具 - 浏览器类
import { browserOpen } from './browser/open.js';
import { browserEval } from './browser/eval.js';
import { browserExtract } from './browser/extract.js';
import { browserClick } from './browser/click.js';
import { browserScreenshot } from './browser/screenshot.js';
import { browserScroll } from './browser/scroll.js';

// Phase 1 MVP 工具 - Web 类
import { webFetch } from './web/webFetch.js';

// Phase 1 MVP 工具 - DevTools 类
import { networkList } from './devtools/networkList.js';
import { consoleList } from './devtools/consoleList.js';

// Phase 2 工具 - 浏览器交互类
import { browserFill } from './browser/fill.js';
import { browserUpload } from './browser/upload.js';
import { browserWait } from './browser/wait.js';
import { browserDialog } from './browser/dialog.js';

// Phase 2 工具 - 管理类
import { portAlloc, portRelease, portHeartbeat } from './management/portAlloc.js';

// Phase 2 工具 - DevTools 性能类
import { perfTraceStart } from './devtools/perfTraceStart.js';
import { perfTraceStop } from './devtools/perfTraceStop.js';
import { perfAnalyze } from './devtools/perfAnalyze.js';

// Phase 3 工具 - 知识层
import { sitePatternsList } from './knowledge/sitePatternsList.js';
import { sitePatternsRead } from './knowledge/sitePatternsRead.js';
import { sitePatternsWrite } from './knowledge/sitePatternsWrite.js';
import { sitePatternsInvalidate } from './knowledge/sitePatternsInvalidate.js';

// Phase 4 工具 - 并行分治层
import { agentTaskRegister } from './management/agentTaskRegister.js';
import { agentTaskRelease } from './management/agentTaskRelease.js';
import { agentResultMerge } from './management/agentResultMerge.js';

/**
 * 将 ToolResult 转换为 MCP 格式
 */
function toMcpResult(toolResult: ToolResult<unknown>) {
  const content = [{ type: 'text' as const, text: toolResult.summary }];

  if (toolResult.data !== undefined) {
    content.push({ type: 'text' as const, text: JSON.stringify(toolResult.data, null, 2) });
  }

  if (toolResult.artifacts && toolResult.artifacts.length > 0) {
    content.push({ type: 'text' as const, text: `Artifacts: ${toolResult.artifacts.join(', ')}` });
  }

  if (toolResult.warnings && toolResult.warnings.length > 0) {
    content.push({ type: 'text' as const, text: `Warnings: ${toolResult.warnings.join(', ')}` });
  }

  if (toolResult.next_suggestion) {
    content.push({ type: 'text' as const, text: `Next: ${toolResult.next_suggestion}` });
  }

  return {
    content,
    isError: !toolResult.ok,
  };
}

/**
 * 包装工具处理器以转换结果为 MCP 格式
 */
function wrapHandler<T extends (...args: any[]) => Promise<ToolResult<unknown>>>(handler: T) {
  return async (...args: Parameters<T>) => {
    const result = await handler(...args);
    return toMcpResult(result);
  };
}

/**
 * 注册所有 MCP 工具
 */
export async function registerTools(server: McpServer) {
  // === 管理类工具 ===

  server.registerTool(
    'health_check',
    {
      description: '检查系统依赖可用性（Node.js、Chrome、CDP Proxy）',
      inputSchema: {},
    },
    wrapHandler(healthCheck)
  );

  server.registerTool(
    'browser_list',
    {
      description: '列出当前所有浏览器 tab',
      inputSchema: {},
    },
    wrapHandler(browserList)
  );

  server.registerTool(
    'browser_close',
    {
      description: '关闭指定的浏览器 tab',
      inputSchema: {
        targetId: z.string().describe('要关闭的 tab ID'),
      },
    },
    wrapHandler(browserClose)
  );

  // === 浏览器核心工具 ===

  server.registerTool(
    'browser_open',
    {
      description: '在新的后台 tab 中打开指定 URL',
      inputSchema: {
        url: z.string().describe('要打开的 URL'),
        waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('domcontentloaded').describe('等待的加载状态'),
      },
    },
    wrapHandler(browserOpen)
  );

  server.registerTool(
    'browser_eval',
    {
      description: '在指定 tab 中执行 JavaScript 代码，可读取/修改 DOM',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        script: z.string().describe('要执行的 JavaScript 代码'),
      },
    },
    wrapHandler(browserEval)
  );

  server.registerTool(
    'browser_extract',
    {
      description: '从页面智能提取主内容、链接、图片等',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        mode: z.enum(['main', 'links', 'images', 'text', 'custom']).default('main').describe('提取模式：main(主内容), links(链接), images(图片), text(纯文本), custom(自定义选择器)'),
        selector: z.string().optional().describe('custom 模式下的 CSS 选择器'),
      },
    },
    wrapHandler(browserExtract)
  );

  server.registerTool(
    'browser_click',
    {
      description: '点击页面元素（支持 JS click 和真实鼠标事件两种模式）',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        selector: z.string().describe('CSS 选择器'),
        mode: z.enum(['js', 'mouse']).default('js').describe('点击模式：js(JS click) 或 mouse(真实鼠标事件，用于文件上传等)'),
      },
    },
    wrapHandler(browserClick)
  );

  server.registerTool(
    'browser_scroll',
    {
      description: '滚动页面（触发懒加载）',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        direction: z.enum(['top', 'bottom', 'up', 'down']).default('bottom').describe('滚动方向'),
        amount: z.number().optional().describe('滚动像素量（up/down 模式）'),
      },
    },
    wrapHandler(browserScroll)
  );

  server.registerTool(
    'browser_screenshot',
    {
      description: '页面截图（支持 viewport 和全页）',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        fullPage: z.boolean().default(false).describe('是否全页截图'),
        file: z.string().optional().describe('保存文件路径（可选，默认自动生成）'),
      },
    },
    wrapHandler(browserScreenshot)
  );

  // === Web 抓取工具 ===

  server.registerTool(
    'web_fetch',
    {
      description: '抓取网页内容（支持 Jina AI 预处理，带缓存和 token 控制）',
      inputSchema: {
        url: z.string().describe('要抓取的 URL'),
        useJina: z.boolean().default(true).describe('是否使用 Jina AI 预处理（节省 token）'),
        useCache: z.boolean().default(true).describe('是否使用缓存'),
      },
    },
    wrapHandler(webFetch)
  );

  // === DevTools 工具 ===

  server.registerTool(
    'network_list',
    {
      description: '列出页面的网络请求',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        types: z.array(z.enum(['xhr', 'fetch', 'document', 'stylesheet', 'script', 'image'])).optional().describe('过滤请求类型'),
        statusRange: z.tuple([z.number(), z.number()]).optional().describe('过滤状态码范围，如 [200, 299]'),
      },
    },
    wrapHandler(networkList)
  );

  server.registerTool(
    'console_list',
    {
      description: '列出页面控制台消息',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        levels: z.array(z.enum(['log', 'warn', 'error', 'info', 'debug'])).optional().describe('过滤日志级别'),
      },
    },
    wrapHandler(consoleList)
  );

  // === Phase 2: 浏览器交互工具 ===

  server.registerTool(
    'browser_fill',
    {
      description: '填写表单字段（自动触发 input/change 事件，支持 React/Vue）',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        selector: z.string().describe('CSS 选择器'),
        value: z.string().describe('要填写的值'),
        clear: z.boolean().default(true).describe('是否先清空原值'),
        submit: z.boolean().default(false).describe('是否自动提交表单'),
      },
    },
    wrapHandler(browserFill)
  );

  server.registerTool(
    'browser_upload',
    {
      description: '上传文件到文件输入框',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        selector: z.string().describe('文件输入框的 CSS 选择器'),
        files: z.array(z.string()).describe('要上传的文件路径列表'),
      },
    },
    wrapHandler(browserUpload)
  );

  server.registerTool(
    'browser_wait',
    {
      description: '等待元素或文本出现（轮询检测）',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        selector: z.string().optional().describe('要等待的 CSS 选择器'),
        text: z.string().optional().describe('要等待的文本内容'),
        timeout: z.number().default(10000).describe('超时时间（毫秒）'),
        pollInterval: z.number().default(500).describe('轮询间隔（毫秒）'),
      },
    },
    wrapHandler(browserWait)
  );

  server.registerTool(
    'browser_dialog',
    {
      description: '处理浏览器弹窗（alert/confirm/prompt）',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        action: z.enum(['accept', 'dismiss', 'prompt']).describe('处理方式：accept(接受), dismiss(拒绝), prompt(输入文本)'),
        promptText: z.string().optional().describe('prompt 模式下输入的文本'),
        waitForDialog: z.boolean().default(false).describe('是否等待对话框出现'),
        timeout: z.number().default(5000).describe('等待超时时间（毫秒）'),
      },
    },
    wrapHandler(browserDialog)
  );

  // === Phase 2: 管理类工具 ===

  server.registerTool(
    'port_alloc',
    {
      description: '自动分配 Chrome 远程调试端口（9222-9299）',
      inputSchema: {
        count: z.number().default(1).describe('需要分配的端口数量'),
      },
    },
    wrapHandler(portAlloc)
  );

  server.registerTool(
    'port_release',
    {
      description: '释放已分配的端口',
      inputSchema: {
        port: z.number().describe('要释放的端口号'),
      },
    },
    wrapHandler(portRelease)
  );

  server.registerTool(
    'port_heartbeat',
    {
      description: '更新端口心跳（延长租约）',
      inputSchema: {
        port: z.number().describe('要更新心跳的端口号'),
      },
    },
    wrapHandler(portHeartbeat)
  );

  // === Phase 2: DevTools 性能工具 ===

  server.registerTool(
    'perf_trace_start',
    {
      description: '开始性能追踪',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        duration: z.number().describe('追踪时长（毫秒）'),
      },
    },
    wrapHandler(perfTraceStart)
  );

  server.registerTool(
    'perf_trace_stop',
    {
      description: '停止性能追踪并收集数据',
      inputSchema: {
        targetId: z.string().describe('目标 tab ID'),
        saveFile: z.boolean().default(true).describe('是否保存追踪数据到文件'),
      },
    },
    wrapHandler(perfTraceStop)
  );

  server.registerTool(
    'perf_analyze',
    {
      description: '分析性能数据（Lighthouse 风格评分）',
      inputSchema: {
        metrics: z.object({
          domContentLoaded: z.number().optional(),
          loadComplete: z.number().optional(),
          firstPaint: z.number().optional(),
          firstContentfulPaint: z.number().optional(),
          totalResources: z.number().optional(),
          totalResourceSize: z.number().optional(),
          longTaskCount: z.number().optional(),
          totalLongTaskTime: z.number().optional(),
        }).describe('性能指标对象'),
        url: z.string().optional().describe('可选的 URL（用于 CrUX 查询）'),
      },
    },
    wrapHandler(perfAnalyze)
  );

  // === Phase 3: 知识层工具 ===

  server.registerTool(
    'site_patterns_list',
    {
      description: '列出所有站点经验',
      inputSchema: {
        domain: z.string().optional().describe('可选，查询特定域名的详细信息'),
        includeStats: z.boolean().default(true).describe('是否包含统计信息'),
      },
    },
    wrapHandler(sitePatternsList)
  );

  server.registerTool(
    'site_patterns_read',
    {
      description: '读取单个站点经验',
      inputSchema: {
        domain: z.string().describe('要读取的域名'),
        statusFilter: z.array(z.enum(['verified', 'suspected', 'stale', 'invalid'])).optional().describe('过滤经验状态'),
      },
    },
    wrapHandler(sitePatternsRead)
  );

  server.registerTool(
    'site_patterns_write',
    {
      description: '写入新的站点经验',
      inputSchema: {
        domain: z.string().describe('域名'),
        fact: z.string().describe('经验事实'),
        status: z.enum(['verified', 'suspected']).default('verified').describe('经验状态'),
        ttl_days: z.number().optional().describe('TTL 天数（可选，自动建议）'),
        aliases: z.array(z.string()).optional().describe('域名别名'),
      },
    },
    wrapHandler(sitePatternsWrite)
  );

  server.registerTool(
    'site_patterns_invalidate',
    {
      description: '标记站点经验失效',
      inputSchema: {
        domain: z.string().describe('域名'),
        factPattern: z.string().describe('经验模式（关键词匹配）'),
        exactMatch: z.boolean().default(false).describe('是否精确匹配'),
      },
    },
    wrapHandler(sitePatternsInvalidate)
  );

  // === Phase 4: 并行分治层工具 ===

  server.registerTool(
    'agent_task_register',
    {
      description: '注册子 Agent 任务',
      inputSchema: {
        goal: z.string().describe('任务目标'),
        successCriteria: z.array(z.string()).describe('成功标准列表'),
        domain: z.string().optional().describe('目标域名（可选）'),
        allowedChannels: z.array(z.enum(['static', 'browser', 'automation', 'devtools'])).optional().describe('允许的通道范围'),
        tokenBudget: z.number().optional().describe('Token 预算'),
        allocatedPort: z.number().optional().describe('分配的端口号'),
      },
    },
    wrapHandler(agentTaskRegister)
  );

  server.registerTool(
    'agent_task_release',
    {
      description: '释放/完成任务',
      inputSchema: {
        taskId: z.string().describe('任务 ID'),
        status: z.enum(['pending', 'running', 'completed', 'failed']).describe('任务状态'),
        result: z.object({
          status: z.enum(['pending', 'running', 'completed', 'failed']),
          goal_met: z.boolean(),
          summary: z.string(),
          key_findings: z.array(z.string()),
          new_site_facts: z.array(z.object({
            domain: z.string(),
            fact: z.string(),
            confidence: z.enum(['verified', 'suspected', 'stale', 'invalid']),
          })),
          estimated_tokens: z.number(),
          artifacts: z.array(z.string()),
        }).optional().describe('任务结果（完成时提供）'),
      },
    },
    wrapHandler(agentTaskRelease)
  );

  server.registerTool(
    'agent_result_merge',
    {
      description: '合并多个子 Agent 结果',
      inputSchema: {
        taskIds: z.array(z.string()).optional().describe('要合并的任务 ID 列表（不指定则合并所有已完成任务）'),
        statusFilter: z.enum(['completed', 'failed']).optional().describe('状态过滤'),
      },
    },
    wrapHandler(agentResultMerge)
  );

  console.error('已注册 Phase 1-4 全部工具');
}

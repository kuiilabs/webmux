#!/usr/bin/env node
/**
 * webmux 入口
 * @fileoverview 面向 AI Agent 的统一网络操作系统
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools/tools.js';
import { logger } from './shared/logger.js';

export async function main() {
  logger.info('webmux 启动中...');

  // 创建 MCP Server
  const server = new McpServer({
    name: 'webmux',
    version: '0.1.0',
  });

  // 注册工具
  await registerTools(server);

  // 启动服务器
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('webmux 已就绪');
}

// 错误处理
process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', async () => {
  logger.info('收到退出信号，清理资源中...');
  // TODO: 清理端口注册、关闭浏览器连接等
  process.exit(0);
});

main().catch((err) => {
  logger.error('启动失败:', err);
  process.exit(1);
});

/**
 * health_check 工具 - 检查系统依赖可用性
 */

import { error, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { spawnSync } from 'child_process';
import { buildCdpProxyUrl } from '../../shared/cdpProxy.js';

interface HealthCheckData {
  node_version: string;
  node_ok: boolean;
  chrome_port_ok: boolean;
  proxy_ok: boolean;
  proxy_port?: number;
}

export async function healthCheck(): Promise<ToolResult<HealthCheckData>> {
  const result: HealthCheckData = {
    node_version: 'unknown',
    node_ok: false,
    chrome_port_ok: false,
    proxy_ok: false,
  };

  // 检查 Node.js 版本
  try {
    const versionResult = spawnSync(process.execPath, ['--version'], {
      encoding: 'utf-8',
    });

    if (versionResult.status !== 0) {
      throw new Error(versionResult.stderr || '无法获取版本');
    }

    const version = versionResult.stdout.trim();
    result.node_version = version;
    const major = parseInt(version.slice(1).split('.')[0], 10);
    result.node_ok = major >= 22;
  } catch {
    return error(
      networkError('无法检测 Node.js 版本，请确保 Node.js 已安装')
    );
  }

  if (!result.node_ok) {
    return error({
      type: 'network',
      message: `Node.js 版本过低：${result.node_version}，需要 v22+`,
      suggestion: '请升级 Node.js 到 v22 或更高版本',
      retryable: false,
    });
  }

  // 检查 Chrome 远程调试端口
  for (let port = 9222; port <= 9299; port++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(500),
      });
      if (!response.ok) {
        continue;
      }

      const output = await response.text();
      if (output.includes('WebSocketDebuggerUrl')) {
        result.chrome_port_ok = true;
        break;
      }
    } catch {
      // 端口不可达，继续尝试下一个
    }
  }

  // 检查 CDP Proxy
  try {
    const response = await fetch(buildCdpProxyUrl('/targets'), {
      signal: AbortSignal.timeout(500),
    });

    if (response.ok) {
      const output = await response.text();
      if (output.includes('[')) {
        result.proxy_ok = true;
        result.proxy_port = 3456;
      }
    }
  } catch {
    // Proxy 未运行
  }

  // 生成摘要和建议
  const warnings: string[] = [];
  if (!result.chrome_port_ok) {
    warnings.push(
      '未检测到运行中的 Chrome 远程调试实例。请在 Chrome 中访问 chrome://inspect/#remote-debugging 并勾选 "Allow remote debugging"'
    );
  }
  if (!result.proxy_ok) {
    warnings.push(
      'CDP Proxy 未运行。首次使用时会自动启动，或手动运行：node scripts/cdp-proxy.mjs'
    );
  }

  const summary = result.node_ok
    ? `环境检查完成。Node.js ${result.node_version}${result.chrome_port_ok ? '，Chrome 远程调试已就绪' : ''}${result.proxy_ok ? '，CDP Proxy 已连接' : ''}`
    : '环境检查失败';

  return {
    ok: result.node_ok && result.chrome_port_ok,
    summary,
    data: result,
    warnings: warnings.length > 0 ? warnings : undefined,
    next_suggestion: result.chrome_port_ok
      ? '环境已就绪，可以开始使用浏览器相关工具'
      : '按警告信息完成前置配置后即可使用',
  };
}

#!/usr/bin/env node
/**
 * 依赖检查脚本
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const CDP_PROXY_PORT = 3456;

function checkNodeVersion() {
  console.error('检查 Node.js 版本...');
  try {
    const version = execSync('node --version', { encoding: 'utf-8' }).trim();
    const major = parseInt(version.slice(1).split('.')[0], 10);
    if (major >= 22) {
      console.error(`  ✅ Node.js ${version}`);
      return true;
    } else {
      console.error(`  ❌ Node.js ${version} (需要 v22+)`);
      return false;
    }
  } catch {
    console.error('  ❌ Node.js 未安装');
    return false;
  }
}

function checkChromePort() {
  console.error('检查 Chrome 远程调试端口...');
  for (let port = 9222; port <= 9299; port++) {
    try {
      execSync(`curl -s http://127.0.0.1:${port}/json/version`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      console.error(`  ✅ Chrome 远程调试端口 ${port}`);
      return { ok: true, port };
    } catch {
      // 端口不可达
    }
  }
  console.error('  ⚠️  未找到 Chrome 远程调试端口');
  console.error('     请在 Chrome 中访问：chrome://inspect/#remote-debugging');
  console.error('     勾选 "Allow remote debugging for this browser instance"');
  return { ok: false };
}

function checkCdpProxy() {
  console.error('检查 CDP Proxy...');
  try {
    const output = execSync(
      `curl -s http://localhost:${CDP_PROXY_PORT}/targets`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }
    );
    if (output.includes('[')) {
      console.error(`  ✅ CDP Proxy 运行在端口 ${CDP_PROXY_PORT}`);
      return { ok: true, port: CDP_PROXY_PORT };
    }
  } catch {
    // Proxy 未运行
  }
  console.error(`  ⚠️  CDP Proxy 未运行 (端口 ${CDP_PROXY_PORT})`);
  console.error('     首次使用时会自动启动');
  return { ok: false };
}

function checkSkillDir() {
  console.error('检查 Skill 目录...');
  const skillDir = process.env.CLAUDE_SKILL_DIR;
  if (!skillDir) {
    console.error('  ⚠️  CLAUDE_SKILL_DIR 未设置');
    return false;
  }
  if (existsSync(join(skillDir, 'SKILL.md'))) {
    console.error(`  ✅ Skill 目录：${skillDir}`);
    return true;
  }
  console.error(`  ⚠️  SKILL.md 不存在：${skillDir}`);
  return false;
}

console.error('='.repeat(50));
console.error('Web Agent Plugin 依赖检查');
console.error('='.repeat(50));
console.error();

const nodeOk = checkNodeVersion();
const chromeResult = checkChromePort();
const proxyResult = checkCdpProxy();
const skillOk = checkSkillDir();

console.error();
console.error('='.repeat(50));

if (nodeOk && skillOk) {
  console.error('✅ 前置检查通过，可以开始使用');
  if (!chromeResult.ok || !proxyResult.ok) {
    console.error();
    console.error('提示：首次使用时会自动启动 CDP Proxy');
  }
  process.exit(0);
} else {
  console.error('❌ 部分检查未通过，请根据上述提示完成配置');
  process.exit(1);
}

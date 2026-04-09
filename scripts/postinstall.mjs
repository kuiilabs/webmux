#!/usr/bin/env node

/**
 * NPM postinstall 脚本
 * 安装后自动运行依赖检查
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Running Web Agent Plugin postinstall...');

// 检查 Node.js 版本
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

if (majorVersion < 22) {
  console.warn('⚠️  Warning: Node.js version should be >= 22.0.0, current:', nodeVersion);
  console.warn('   Please upgrade Node.js for best compatibility.\n');
} else {
  console.log('✓ Node.js version check passed:', nodeVersion);
}

// 尝试编译 TypeScript（如果是开发环境）
const tscPath = join(__dirname, '..', 'node_modules', '.bin', 'tsc');

try {
  const tsc = spawn('npx', ['tsc', '--noEmit'], {
    cwd: join(__dirname, '..'),
    stdio: 'ignore'
  });

  tsc.on('close', (code) => {
    if (code === 0) {
      console.log('✓ TypeScript check passed\n');
    } else {
      console.log('ℹ️  Run "npm run build" to compile the project\n');
    }
  });
} catch (e) {
  // 忽略错误
}

console.log('\nPostinstall completed.');
console.log('Next: Run "npm run build" to compile the project.\n');

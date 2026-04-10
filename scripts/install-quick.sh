#!/bin/bash

# webmux 快速安装脚本
# 用法：curl -fsSL <url> | bash

set -e

INSTALL_DIR="$HOME/.webmux"
REPO_URL="https://github.com/kuiilabs/webmux.git"

echo "🚀 webmux 快速安装..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未找到 Node.js，请先安装 Node.js >= 22.0.0"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "❌ 错误：Node.js 版本为 $(node -v)，需要 >= 22.0.0"
    exit 1
fi

echo "✓ Node.js 版本检查通过：$(node -v)"

# 克隆或更新仓库
if [ -d "$INSTALL_DIR" ]; then
    echo "📦 更新现有安装..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "📦 克隆仓库..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 安装依赖
echo "📦 安装依赖..."
npm install --production

# 构建
echo "🔨 构建项目..."
npm run build

# 配置 MCP Server
echo "⚙️  配置 MCP Server..."
CLAUDE_DIR="$HOME/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

mkdir -p "$CLAUDE_DIR"

node -e "
const fs = require('fs');
const settingsFile = '$SETTINGS_FILE';
const installDir = '$INSTALL_DIR';

let settings = {};
if (fs.existsSync(settingsFile)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
  } catch (e) {
    console.log('配置文件解析失败，创建新文件');
  }
}

settings.mcpServers = settings.mcpServers || {};
settings.mcpServers['webmux'] = {
  command: 'node',
  args: [installDir + '/dist/index.js'],
  env: {
    WEB_AGENT_SANDBOX_DIR: '/tmp/webmux-work',
    WEB_AGENT_FILE_SANDBOX_DIR: '/tmp/webmux-files'
  }
};

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
console.log('✓ MCP Server 配置完成');
"

echo ""
echo "✅ 安装完成！"
echo ""
echo "下一步："
echo "1. 打开 Chrome，访问 chrome://inspect/#remote-debugging"
echo "2. 勾选 \"Allow remote debugging\""
echo "3. 重启 Claude Code"
echo ""
echo "📖 文档：$INSTALL_DIR/docs/USER_GUIDE.md"

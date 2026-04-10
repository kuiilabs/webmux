#!/bin/bash

set -e

# webmux 一键安装脚本
# 支持 macOS / Linux

echo "=================================================="
echo "  webmux 安装脚本
"
echo "=================================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Node.js 版本
echo -n "检查 Node.js 版本... "
if ! command -v node &> /dev/null; then
    echo -e "${RED}失败${NC}"
    echo "错误：未找到 Node.js，请先安装 Node.js >= 22.0.0"
    echo "下载地址：https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo -e "${RED}失败${NC}"
    echo "错误：Node.js 版本为 $(node -v)，需要 >= 22.0.0"
    exit 1
fi
echo -e "${GREEN}通过${NC} (v$(node -v))"

# 检查 npm
echo -n "检查 npm... "
if ! command -v npm &> /dev/null; then
    echo -e "${RED}失败${NC}"
    echo "错误：未找到 npm"
    exit 1
fi
echo -e "${GREEN}通过${NC} (v$(npm -v))"

# 选择安装方式
echo ""
echo "请选择安装方式:"
echo "  1) 本地安装 (当前开发模式)"
echo "  2) 全局安装 (推荐，可被 Claude Code 调用)"
echo "  3) 仅配置 MCP Server (已构建完成的情况)"
echo ""
read -p "请选择 [1-3]: " choice

case $choice in
    1)
        echo ""
        echo -n "执行本地安装... "
        npm install
        echo -e "${GREEN}完成${NC}"

        echo -n "构建项目... "
        npm run build
        echo -e "${GREEN}完成${NC}"

        INSTALL_DIR="$(pwd)"
        ;;
    2)
        echo ""
        echo -n "执行全局安装... "
        npm install -g
        echo -e "${GREEN}完成${NC}"

        INSTALL_DIR=$(npm root -g)/webmux
        echo "全局安装路径：$INSTALL_DIR"
        ;;
    3)
        echo ""
        echo -n "检查构建状态... "
        if [ -d "./dist" ] && [ -f "./dist/index.js" ]; then
            echo -e "${GREEN}已构建${NC}"
        else
            echo -e "${YELLOW}未构建${NC}"
            echo -n "是否现在构建？[Y/n] "
            read build_choice
            if [ -z "$build_choice" ] || [ "$build_choice" = "Y" ] || [ "$build_choice" = "y" ]; then
                npm install
                npm run build
            fi
        fi

        INSTALL_DIR="$(pwd)"
        ;;
    *)
        echo "无效选择"
        exit 1
        ;;
esac

# 配置 MCP Server
echo ""
echo "=================================================="
echo "  配置 Claude Code MCP Server
"
echo "=================================================="

# 检查 Claude Code 配置目录
CLAUDE_DIR="$HOME/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if [ ! -d "$CLAUDE_DIR" ]; then
    echo -n "创建 Claude Code 配置目录... "
    mkdir -p "$CLAUDE_DIR"
    echo -e "${GREEN}完成${NC}"
fi

# 读取当前配置
echo ""
echo "当前 MCP Server 配置:"
if [ -f "$SETTINGS_FILE" ]; then
    if grep -q "mcpServers" "$SETTINGS_FILE"; then
        echo "已存在 mcpServers 配置"
    else
        echo "无 mcpServers 配置"
    fi
else
    echo "settings.json 不存在，将创建新文件"
fi

# 备份原配置
if [ -f "$SETTINGS_FILE" ]; then
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak.$(date +%Y%m%d%H%M%S)"
    echo "已备份原配置：$SETTINGS_FILE.bak.*"
fi

# 生成 MCP 配置
MCP_CONFIG=$(cat << EOF
{
  "name": "webmux",
  "command": "node",
  "args": ["$INSTALL_DIR/dist/index.js"],
  "env": {
    "WEBMUX_SANDBOX_DIR": "/tmp/webmux-work",
    "WEBMUX_FILE_SANDBOX_DIR": "/tmp/webmux-files"
  }
}
EOF
)

echo ""
echo "将添加以下 MCP Server 配置:"
echo "$MCP_CONFIG"
echo ""
read -p "是否继续？[Y/n] " confirm
if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
    echo "已取消配置"
    exit 0
fi

# 使用 Node.js 处理 JSON（避免 sed 复杂逻辑）
node -e "
const fs = require('fs');
const settingsFile = '$SETTINGS_FILE';
const installDir = '$INSTALL_DIR';

let settings = {};
if (fs.existsSync(settingsFile)) {
  settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
}

settings.mcpServers = settings.mcpServers || {};
settings.mcpServers['webmux'] = {
  command: 'node',
  args: [installDir + '/dist/index.js'],
  env: {
    WEBMUX_SANDBOX_DIR: '/tmp/webmux-work',
    WEBMUX_FILE_SANDBOX_DIR: '/tmp/webmux-files'
  }
};

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
console.log('配置已写入：' + settingsFile);
"

echo -e "${GREEN}✓ MCP Server 配置完成${NC}"

# Chrome 配置提示
echo ""
echo "=================================================="
echo "  Chrome 远程调试配置
"
echo "=================================================="
echo ""
echo "请完成以下 Chrome 配置："
echo ""
echo "1. 打开 Chrome，访问："
echo "   chrome://inspect/#remote-debugging"
echo ""
echo "2. 勾选 \"Allow remote debugging for this browser instance\""
echo ""
echo "3. 保持该页面打开（不要关闭）"
echo ""

# 运行依赖检查
echo "=================================================="
echo "  运行依赖检查
"
echo "=================================================="
npm run check-deps || true

echo ""
echo "=================================================="
echo "  安装完成！
"
echo "=================================================="
echo ""
echo -e "${GREEN}✓ webmux 已成功安装${NC}"
echo ""
echo "下一步："
echo "1. 完成上述 Chrome 远程调试配置"
echo "2. 重启 Claude Code"
echo "3. 尝试使用：帮我搜索 React 的最新文档"
echo ""
echo "使用文档：$INSTALL_DIR/docs/USER_GUIDE.md"
echo ""

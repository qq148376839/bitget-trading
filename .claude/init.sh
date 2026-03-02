#!/bin/bash
# Bitget 量化交易系统 - 环境初始化脚本
# 用途：快速恢复开发环境，确保每次 agent 启动时状态一致

set -e

echo "🚀 Bitget Trading System - Initialization"
echo "=========================================="

# 1. 检查必要的环境变量
echo ""
echo "📋 Step 1/6: Checking environment variables..."
REQUIRED_VARS=(
  "BITGET_API_KEY"
  "BITGET_SECRET_KEY"
  "BITGET_PASSPHRASE"
  "DATABASE_URL"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
  echo "❌ Missing required environment variables:"
  printf '   - %s\n' "${MISSING_VARS[@]}"
  echo ""
  echo "Please create a .env file based on .env.example"
  exit 1
fi

echo "✅ All required environment variables are set"
if [ "${BITGET_SIMULATED:-0}" = "1" ]; then
  echo "   📝 Mode: SIMULATED (Paper Trading)"
else
  echo "   ⚠️  Mode: PRODUCTION (Real Trading)"
fi

# 2. 检查依赖安装
echo ""
echo "📦 Step 2/6: Checking dependencies..."
if ! command -v pnpm &> /dev/null; then
  echo "❌ pnpm is not installed. Please run: npm install -g pnpm"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
else
  echo "✅ Dependencies are already installed"
fi

# 3. 检查数据库连接
echo ""
echo "🗄️  Step 3/6: Checking database connection..."
if command -v psql &> /dev/null; then
  if psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
    echo "✅ Database connection successful"
  else
    echo "⚠️  Cannot connect to database (psql test failed)"
    echo "   The API will attempt to connect on startup"
  fi
else
  echo "📝 psql not found - skipping database connection test"
fi

# 4. 运行数据库迁移
echo ""
echo "🔄 Step 4/6: Running database migrations..."
cd api
if pnpm run migrate:up 2>&1 | grep -q "success\|already applied\|up to date"; then
  echo "✅ Database migrations applied"
else
  echo "⚠️  Migration status unclear - check logs"
fi
cd ..

# 5. 检查 Git 状态
echo ""
echo "📊 Step 5/6: Checking Git status..."
if [ -d ".git" ]; then
  UNCOMMITTED=$(git status --porcelain | wc -l)
  CURRENT_BRANCH=$(git branch --show-current)
  LAST_COMMIT=$(git log -1 --pretty=format:"%h - %s (%ar)" 2>/dev/null || echo "No commits yet")

  echo "   Branch: $CURRENT_BRANCH"
  echo "   Last commit: $LAST_COMMIT"

  if [ "$UNCOMMITTED" -gt 0 ]; then
    echo "   ⚠️  $UNCOMMITTED uncommitted changes detected"
  else
    echo "   ✅ Working directory clean"
  fi
else
  echo "   📝 Not a git repository"
fi

# 6. 显示系统状态
echo ""
echo "📈 Step 6/6: System status summary..."
echo ""
echo "   📂 Project root: $(pwd)"
echo "   🔧 Node version: $(node --version)"
echo "   📦 pnpm version: $(pnpm --version)"
echo "   💾 API directory: ./api"
echo "   🖥️  Frontend directory: ./frontend"
echo ""

# 7. 读取最近进度
if [ -f ".claude/claude-progress.txt" ]; then
  echo "📝 Recent progress (last 10 entries):"
  echo "──────────────────────────────────────"
  tail -n 10 .claude/claude-progress.txt
  echo "──────────────────────────────────────"
else
  echo "📝 No progress file found (this is fine for first run)"
fi

echo ""
echo "✅ Initialization complete!"
echo ""
echo "🎯 Next steps:"
echo "   - Review .claude/claude-progress.txt for recent changes"
echo "   - Check .claude/features.json for feature status"
echo "   - Run 'pnpm dev' to start development servers"
echo ""

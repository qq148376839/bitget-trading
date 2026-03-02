#!/bin/bash
# Bitget 量化交易系统 - Pre-Commit 检查脚本
# 用途：在提交前自动执行关键检查，防止有问题的代码进入版本库
# 使用：ln -s ../../.claude/hooks/pre-commit-checklist.sh .git/hooks/pre-commit

set -e

echo "🔍 Pre-Commit Checks for Bitget Trading System"
echo "================================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_passed=0
check_failed=0

function pass_check() {
  echo -e "${GREEN}✅ $1${NC}"
  ((check_passed++))
}

function fail_check() {
  echo -e "${RED}❌ $1${NC}"
  ((check_failed++))
}

function warn_check() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# 1. 检查敏感信息泄露
echo ""
echo "🔐 [1/7] Checking for sensitive information..."

SENSITIVE_PATTERNS=(
  "BITGET_API_KEY.*=.*['\"].*['\"]"
  "BITGET_SECRET_KEY.*=.*['\"].*['\"]"
  "BITGET_PASSPHRASE.*=.*['\"].*['\"]"
  "DATABASE_URL.*=.*postgres.*@.*"
)

found_sensitive=0
for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  if git diff --cached --name-only | xargs grep -Hn "$pattern" 2>/dev/null; then
    found_sensitive=1
  fi
done

if [ $found_sensitive -eq 0 ]; then
  pass_check "No sensitive information found"
else
  fail_check "Found hardcoded sensitive information! Use environment variables instead."
  echo "   Tip: Ensure BITGET_API_KEY, BITGET_SECRET_KEY, BITGET_PASSPHRASE are in .env"
fi

# 2. 检查 TypeScript any 类型
echo ""
echo "📝 [2/7] Checking for 'any' type usage..."

if git diff --cached --name-only | grep -E '\.(ts|tsx)$' | xargs grep -n ': any' 2>/dev/null; then
  fail_check "Found 'any' type usage. Use specific types instead."
else
  pass_check "No 'any' type usage found"
fi

# 3. 检查 console.log（生产代码不应有）
echo ""
echo "🖨️  [3/7] Checking for console.log..."

api_files=$(git diff --cached --name-only | grep 'api/src/' | grep -E '\.(ts|tsx)$' || true)
if [ -n "$api_files" ]; then
  if echo "$api_files" | xargs grep -n 'console\.log' 2>/dev/null; then
    warn_check "Found console.log in API code. Consider using LogService instead."
    echo "   Tip: Use LogService.info/warn/error for production logging"
  else
    pass_check "No console.log in API code"
  fi
else
  pass_check "No API files changed (console.log check skipped)"
fi

# 4. 检查资金操作是否有事务
echo ""
echo "💰 [4/7] Checking for transaction usage in financial operations..."

# 查找涉及资金操作的文件
capital_files=$(git diff --cached --name-only | grep -E '(capital|fund|balance|order).*\.(ts|tsx)$' || true)
if [ -n "$capital_files" ]; then
  transaction_found=0
  for file in $capital_files; do
    if git diff --cached "$file" | grep -E '(BEGIN|COMMIT|ROLLBACK)' >/dev/null 2>&1; then
      transaction_found=1
      break
    fi
  done

  if [ $transaction_found -eq 1 ]; then
    pass_check "Transaction usage found in financial operations"
  else
    warn_check "Financial operation files changed but no transactions found"
    echo "   Files: $capital_files"
    echo "   Tip: Use BEGIN/COMMIT/ROLLBACK for multi-step financial operations"
  fi
else
  pass_check "No financial operation files changed"
fi

# 5. 检查错误处理
echo ""
echo "🚨 [5/7] Checking for proper error handling..."

# 查找新增的 async 函数是否有 try-catch
async_functions=$(git diff --cached --name-only | grep -E '\.(ts|tsx)$' | xargs grep -n 'async function' 2>/dev/null || true)
if [ -n "$async_functions" ]; then
  warn_check "Found async functions. Ensure they have proper try-catch error handling."
  echo "   Tip: Use AppError for consistent error handling"
else
  pass_check "No new async functions (error handling check skipped)"
fi

# 6. 检查测试文件更新
echo ""
echo "🧪 [6/7] Checking for test updates..."

code_files=$(git diff --cached --name-only | grep 'api/src/' | grep -v '__tests__' | grep -E '\.(ts|tsx)$' || true)
test_files=$(git diff --cached --name-only | grep '__tests__' || true)

if [ -n "$code_files" ] && [ -z "$test_files" ]; then
  warn_check "Source code changed but no test files updated"
  echo "   Changed files: $(echo $code_files | head -c 100)..."
  echo "   Tip: Consider adding or updating tests for your changes"
else
  pass_check "Test files updated or no source code changes"
fi

# 7. 检查进度文件更新
echo ""
echo "📋 [7/7] Checking for progress file updates..."

progress_file=".claude/claude-progress.txt"
features_file=".claude/features.json"

progress_updated=$(git diff --cached --name-only | grep "$progress_file" || true)
features_updated=$(git diff --cached --name-only | grep "$features_file" || true)

if [ -n "$code_files" ]; then
  if [ -n "$progress_updated" ] || [ -n "$features_updated" ]; then
    pass_check "Progress tracking files updated"
  else
    warn_check "Source code changed but progress files not updated"
    echo "   Tip: Update .claude/claude-progress.txt and .claude/features.json"
  fi
else
  pass_check "No source code changes (progress check skipped)"
fi

# 汇总结果
echo ""
echo "================================================"
echo "📊 Check Summary:"
echo "   ✅ Passed: $check_passed"
echo "   ❌ Failed: $check_failed"

if [ $check_failed -gt 0 ]; then
  echo ""
  echo -e "${RED}🚫 Pre-commit checks FAILED!${NC}"
  echo "   Please fix the issues above before committing."
  echo ""
  echo "To bypass this check (NOT recommended for production):"
  echo "   git commit --no-verify"
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ All pre-commit checks passed!${NC}"
  echo ""
fi

exit 0

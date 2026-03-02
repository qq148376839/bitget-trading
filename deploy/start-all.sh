#!/bin/sh
# 统一启动脚本 - 同时运行前端和后端服务

set -e

echo "==================================="
echo "启动 Bitget Trading System (单容器模式)"
echo "==================================="

# 设置环境变量
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3001}
export FRONTEND_PORT=${FRONTEND_PORT:-3000}

# 启动前端服务（Next.js standalone 模式）
echo "启动前端服务 (端口 $FRONTEND_PORT)..."
cd /app/frontend

# 检查 server.js 是否存在
if [ ! -f "server.js" ]; then
  echo "错误: /app/frontend/server.js 不存在"
  echo "尝试列出前端目录内容:"
  ls -la /app/frontend/
  exit 1
fi

# HOSTNAME=0.0.0.0 让 Next.js 监听所有接口
HOSTNAME=0.0.0.0 PORT=$FRONTEND_PORT node server.js &
FRONTEND_PID=$!
echo "前端服务已启动 (PID: $FRONTEND_PID)"

# 等待前端服务启动
sleep 3

# 检查前端是否启动成功
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
  echo "错误: 前端服务启动失败"
  exit 1
fi

# 启动后端服务（迁移在 bootstrap 中自动执行）
echo "启动后端服务 (端口 $PORT)..."
cd /app/api
node dist/server.js &
API_PID=$!
echo "后端服务已启动 (PID: $API_PID)"

# 等待后端服务启动
sleep 2

# 检查后端是否启动成功
if ! kill -0 $API_PID 2>/dev/null; then
  echo "错误: 后端服务启动失败"
  exit 1
fi

echo "==================================="
echo "所有服务已启动"
echo "前端: http://localhost:$FRONTEND_PORT"
echo "后端: http://localhost:$PORT"
echo "==================================="

# 信号处理函数
cleanup() {
  echo ""
  echo "接收到停止信号，关闭服务..."
  kill $API_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  echo "服务已停止"
  exit 0
}

# 注册信号处理
trap cleanup SIGTERM SIGINT

# 监控进程，如果任一服务退出，则退出容器
while true; do
  if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "前端服务已停止，退出容器"
    kill $API_PID 2>/dev/null || true
    exit 1
  fi

  if ! kill -0 $API_PID 2>/dev/null; then
    echo "后端服务已停止，退出容器"
    kill $FRONTEND_PID 2>/dev/null || true
    exit 1
  fi

  sleep 5
done

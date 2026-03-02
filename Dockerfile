# 统一构建镜像 - 单容器部署（前端 + 后端）
# 使用多阶段构建优化镜像大小

# ============================================
# 阶段 1: 构建前端
# ============================================
FROM node:20-alpine AS frontend-builder

# 配置 npm 使用淘宝镜像源（解决国内网络问题）
RUN npm config set registry https://registry.npmmirror.com

# 直接用 npm 安装 pnpm（不用 corepack，避免网络问题）
RUN npm install -g pnpm@10.28.2

WORKDIR /app/frontend

# 复制前端依赖文件
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# 配置 pnpm 使用淘宝镜像源
RUN pnpm config set registry https://registry.npmmirror.com

# 安装前端依赖
RUN pnpm install --frozen-lockfile

# 复制前端源代码
COPY frontend/ ./

# 构建前端
ENV NODE_ENV=production
RUN pnpm run build

# ============================================
# 阶段 2: 构建后端
# ============================================
FROM node:20-alpine AS api-builder

# 配置 npm 使用淘宝镜像源
RUN npm config set registry https://registry.npmmirror.com

# 直接用 npm 安装 pnpm
RUN npm install -g pnpm@10.28.2

WORKDIR /app/api

# 复制后端依赖文件
COPY api/package.json api/pnpm-lock.yaml ./

# 配置 pnpm 使用淘宝镜像源
RUN pnpm config set registry https://registry.npmmirror.com

# 安装后端依赖
RUN pnpm install --frozen-lockfile

# 复制后端源代码
COPY api/tsconfig.json ./
COPY api/src/ ./src/

# 构建后端 TypeScript 代码
RUN pnpm run build

# ============================================
# 阶段 3: 生产运行环境
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# 配置 npm 使用淘宝镜像源
RUN npm config set registry https://registry.npmmirror.com

# 直接用 npm 安装 pnpm
RUN npm install -g pnpm@10.28.2

# ============================================
# 安装后端生产依赖
# ============================================
COPY api/package.json api/pnpm-lock.yaml ./api/

RUN cd /app/api && \
    pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --frozen-lockfile --prod

# ============================================
# 复制后端构建产物
# ============================================
COPY --from=api-builder /app/api/dist ./api/dist
COPY api/migrations/ ./api/migrations/
COPY api/scripts/ ./api/scripts/
RUN chmod +x ./api/scripts/run-migrations.sh

# ============================================
# 复制前端构建产物
# ============================================
# Next.js standalone 模式的输出
COPY --from=frontend-builder /app/frontend/.next/standalone ./frontend/
COPY --from=frontend-builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=frontend-builder /app/frontend/public ./frontend/public

# ============================================
# 复制启动脚本
# ============================================
COPY deploy/start-all.sh ./
RUN chmod +x start-all.sh

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001
ENV FRONTEND_PORT=3000

# 暴露端口（只暴露后端端口，前端通过后端代理访问）
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

# 启动脚本会同时运行前端和后端
CMD ["./start-all.sh"]

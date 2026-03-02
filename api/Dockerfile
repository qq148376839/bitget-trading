# Build stage
FROM node:20-alpine AS builder

# 配置 npm 使用淘宝镜像源（解决国内网络问题）
RUN npm config set registry https://registry.npmmirror.com

# 直接用 npm 安装 pnpm（不用 corepack，避免网络问题）
RUN npm install -g pnpm@10.28.2

WORKDIR /app
COPY package.json pnpm-lock.yaml ./

# 配置 pnpm 使用淘宝镜像源
RUN pnpm config set registry https://registry.npmmirror.com

RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm run build

# Production stage
FROM node:20-alpine AS runner

# 配置 npm 使用淘宝镜像源
RUN npm config set registry https://registry.npmmirror.com

# 直接用 npm 安装 pnpm
RUN npm install -g pnpm@10.28.2

WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./

# 配置 pnpm 使用淘宝镜像源
RUN pnpm config set registry https://registry.npmmirror.com

RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/run-migrations.sh

EXPOSE 3001
CMD ["sh", "./scripts/run-migrations.sh"]

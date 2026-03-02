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
COPY . .
RUN pnpm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

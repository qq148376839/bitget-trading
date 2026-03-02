# 特性开发完整工作流

基于 Anthropic 长期运行 agent 的最佳实践，为 Bitget 量化交易系统定制的特性开发流程。

## 核心原则

1. **增量进步** — 每次只完成一个特性，避免一次性完成整个项目
2. **状态持久化** — 每次会话都更新进度文件，确保上下文连续
3. **端到端测试** — 必须通过实际测试验证，不能只依赖单元测试
4. **可回滚性** — 每个特性完成后提交 Git，出问题可快速回滚

## 工作流概览

```
[Phase 1] 需求澄清 → [Phase 2] 架构设计 → [Phase 3] 开发实现
    ↓                    ↓                    ↓
task-clarifier      architect           developer
    ↓                    ↓                    ↓
[Phase 4] 交易验证 → [Phase 5] 安全审计 → [Phase 6] 测试编写
    ↓                    ↓                    ↓
trading-validator   security-auditor    tester
    ↓                    ↓                    ↓
[Phase 7] 代码审查 → [Phase 8] 文档整理 → [Phase 9] 提交部署
    ↓                    ↓                    ↓
reviewer            project-summarizer   developer
```

## Phase 1: 需求澄清 (task-clarifier)

### 触发条件
- 用户需求模糊、不完整
- 用户提供单词或短语（如 "帮我"、"修复"）
- 需求中有多个可能的理解方式

### 工作内容
1. 分析用户需求，识别不明确的部分
2. 结构化提问（需求/技术/业务/数据/集成）
3. 等待用户回答
4. 生成明确的需求描述

### 输出
- 明确的需求文档（Markdown 格式）
- 验收标准（Acceptance Criteria）

### 更新状态
```bash
# 追加到 .claude/claude-progress.txt
[YYYY-MM-DD HH:MM] task-clarifier | CLARIFIED | {需求简述}
```

## Phase 2: 架构设计 (architect)

### 触发条件
- 涉及新模块/新服务
- 涉及数据库 schema 变更
- 涉及技术选型
- 涉及多个服务协作

### 工作内容
1. 阅读需求文档和当前代码
2. 设计数据模型（数据库表、接口定义）
3. 设计服务划分（哪些服务需要新增/修改）
4. 设计 API 接口（路由、参数、响应）
5. 考虑性能和安全性
6. 评估技术风险

### 输出
- 架构设计文档（Markdown 格式）
- 数据库迁移脚本（如需要）
- 接口定义（TypeScript interface）

### 更新状态
```bash
[YYYY-MM-DD HH:MM] architect | DESIGNED | {架构简述}
```

## Phase 3: 开发实现 (developer)

### 触发条件
- 需求和架构都已明确
- 准备编写代码

### 工作内容

#### 3.1 启动前检查
```bash
# 1. 读取最近进度
cat .claude/claude-progress.txt | tail -n 20

# 2. 检查特性状态
cat .claude/features.json | jq '.categories.{category}.features[] | select(.status=="in_progress")'

# 3. 检查 Git 状态
git status
git log -5 --oneline
```

#### 3.2 编码实现
1. **只实现当前特性** — 不要一次性实现多个特性
2. **遵循编码标准** — 参考 `CLAUDE.md`
3. **及时记录日志** — 关键操作必须有日志
4. **资金操作谨慎** — 涉及资金的代码格外小心

#### 3.3 编码规范检查
- [ ] 是否禁用 `any` 类型
- [ ] 函数是否定义参数和返回类型
- [ ] 是否使用 AppError 统一错误处理
- [ ] 是否记录关键操作日志
- [ ] 敏感信息是否存储在环境变量中
- [ ] 数据库操作是否使用事务
- [ ] 资金操作前是否验证充足性

#### 3.4 自测
```bash
# 运行 ESLint
pnpm run lint

# 运行 TypeScript 类型检查
pnpm run type-check

# 运行现有测试（确保没有破坏现有功能）
pnpm test
```

### 输出
- 实现的代码文件
- 临时自测结果

### 更新状态
```bash
[YYYY-MM-DD HH:MM] developer | IMPLEMENTED | {功能简述} | Files: {文件列表}
```

```json
// 更新 .claude/features.json
{
  "id": "enhance-xxx",
  "status": "in_progress",
  "lastModified": "YYYY-MM-DD"
}
```

## Phase 4: 交易验证 (trading-validator) ⚠️ 关键阶段

### 触发条件（强制）
- 涉及资金、订单、策略、账户的任何代码变更
- 部署到生产环境前

### 工作内容
1. 阅读变更的代码
2. 对照验证清单（见 `trading-validator.md`）逐项检查
3. 识别潜在的资金安全风险
4. 评估策略盈利性
5. 生成验证报告

### 输出
- 交易验证报告（Markdown 格式）
- 风险等级评估（严重/高/中/低）
- 修复建议（如有问题）

### 处理流程
```
验证通过 → 继续到 Phase 5
   ↓
验证失败（严重/高）→ 立即停止，返回 Phase 3 修复
   ↓
验证失败（中/低）→ 记录问题，继续流程（计划修复）
```

### 更新状态
```bash
[YYYY-MM-DD HH:MM] trading-validator | VALIDATED | {结果} | Risks: {风险数量}
```

## Phase 5: 安全审计 (security-auditor)

### 触发条件
- 新增 API 端点
- 认证/授权逻辑变更
- 处理外部数据输入
- 依赖包更新
- 部署配置变更

### 工作内容
1. 检查注入防御（SQL/命令/XSS）
2. 检查认证授权（API 密钥管理、权限控制）
3. 检查数据安全（加密、日志脱敏）
4. 检查基础设施安全（Docker、环境变量）
5. 运行 `pnpm audit`

### 输出
- 安全评估报告（Markdown 格式）
- 漏洞列表（如有）
- 修复建议

### 更新状态
```bash
[YYYY-MM-DD HH:MM] security-auditor | AUDITED | {结果} | Issues: {问题数量}
```

## Phase 6: 测试编写 (tester)

### 触发条件
- 代码实现完成
- 通过交易验证和安全审计

### 工作内容

#### 6.1 单元测试
```typescript
// 测试文件命名：{service-name}.test.ts
// 覆盖场景：
// - 正常场景（Happy Path）
// - 异常场景（Error Cases）
// - 边界场景（Edge Cases）
// - 并发场景（Concurrency，如涉及资金）
```

#### 6.2 集成测试（关键）
```typescript
// 模拟盘测试（必须）
// - 设置 BITGET_SIMULATED=1
// - 实际调用 Bitget API
// - 验证订单状态同步
// - 验证资金变动正确性
// - 验证策略执行逻辑
```

#### 6.3 端到端测试（推荐）
```typescript
// 使用 Playwright 或类似工具
// - 测试完整的用户流程（前端 → API → Bitget）
// - 验证前端展示正确
// - 验证实时数据同步
```

### 验证标准
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 所有测试通过
- [ ] 模拟盘测试至少运行 1 小时无异常
- [ ] 策略在模拟盘稳定盈利（如涉及策略）

### 输出
- 测试文件
- 测试覆盖率报告
- 模拟盘测试结果

### 更新状态
```bash
[YYYY-MM-DD HH:MM] tester | TESTED | Coverage: {覆盖率}% | Status: {通过/失败}
```

```json
// 更新 .claude/features.json
{
  "id": "enhance-xxx",
  "testStatus": "passing"
}
```

## Phase 7: 代码审查 (reviewer)

### 触发条件
- 测试通过
- 准备合并代码

### 工作内容
1. 检查代码质量（命名、结构、可读性）
2. 检查是否遵循编码标准
3. 检查是否有重复代码
4. 检查性能问题（N+1 查询、大循环）
5. 检查可维护性

### 输出
- 代码审查报告（Markdown 格式）
- 改进建议

### 更新状态
```bash
[YYYY-MM-DD HH:MM] reviewer | REVIEWED | {结果} | Issues: {问题数量}
```

## Phase 8: 文档整理 (project-summarizer) ⚠️ 强制执行

### 触发条件（自动）
- **任何代码变更完成后必须执行**
- 不需要用户明确请求

### 工作内容
1. 创建或更新特性文档（`docs/features/YYMMDD-功能名称.md`）
2. 更新 `docs/CHANGELOG.md`
3. 更新 `docs/PROJECT_STATUS.md`
4. 更新 `docs/CODE_MAP.md`（如有新服务）
5. 更新 `.claude/features.json` 中的特性状态
6. 更新 `.claude/claude-progress.txt`

### 输出
- 特性文档
- 更新后的导航文件

### 更新状态
```bash
[YYYY-MM-DD HH:MM] project-summarizer | DOCUMENTED | {文档列表}
```

## Phase 9: 提交部署 (developer)

### 触发条件
- 所有验证通过
- 文档已更新

### 工作内容

#### 9.1 Git 提交
```bash
# 1. 查看变更
git status
git diff

# 2. 添加文件（按类别分批添加）
git add api/src/services/new-service.ts
git add api/src/routes/new-route.ts
git add frontend/components/new-component.tsx

# 3. 提交（使用 Conventional Commits）
git commit -m "$(cat <<'EOF'
feat: 添加 {功能简述}

- {变更点1}
- {变更点2}
- {变更点3}

验证情况：
- 单元测试覆盖率: {XX}%
- 模拟盘测试: 通过
- 交易验证: 通过
- 安全审计: 通过

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"

# 4. 查看提交历史
git log -1 --stat
```

#### 9.2 部署前最终检查
```bash
# 1. 确认环境变量
echo "BITGET_API_KEY: ${BITGET_API_KEY:0:10}***"
echo "BITGET_SIMULATED: ${BITGET_SIMULATED}"

# 2. 运行数据库迁移（如有）
cd api
pnpm run migrate:up
cd ..

# 3. 构建 Docker 镜像
docker-compose build

# 4. 启动服务（模拟盘测试）
BITGET_SIMULATED=1 docker-compose up -d

# 5. 检查服务健康状态
curl http://localhost/api/health

# 6. 观察日志（至少 5 分钟）
docker-compose logs -f api

# 7. 如果一切正常，停止模拟盘
docker-compose down
```

#### 9.3 生产部署（谨慎）
```bash
# ⚠️ 生产部署前必须：
# 1. 确认所有测试通过
# 2. 确认交易验证通过
# 3. 确认安全审计通过
# 4. 确认模拟盘稳定运行至少 24 小时
# 5. 备份数据库

# 部署
docker-compose up -d

# 持续监控（至少 1 小时）
watch -n 10 'docker-compose ps && echo "---" && docker-compose logs --tail=20 api'
```

### 更新状态
```bash
[YYYY-MM-DD HH:MM] developer | DEPLOYED | {部署环境} | Commit: {commit hash}
```

```json
// 更新 .claude/features.json
{
  "id": "enhance-xxx",
  "status": "completed",
  "lastModified": "YYYY-MM-DD"
}
```

## 失败处理

### 测试失败
```
tester 发现测试失败
    ↓
更新 features.json: status = "failed", testStatus = "failing"
    ↓
记录失败原因到 claude-progress.txt
    ↓
返回 Phase 3 (developer) 修复
    ↓
修复后重新执行 Phase 4-6
```

### 验证失败（严重）
```
trading-validator 发现严重风险
    ↓
立即停止流程
    ↓
通知用户（明确说明风险）
    ↓
记录问题到 claude-progress.txt
    ↓
返回 Phase 3 修复
    ↓
修复后重新执行 Phase 4-7
```

### 部署失败
```
部署后发现异常
    ↓
立即回滚（git revert）
    ↓
停止生产服务
    ↓
分析失败原因（debugger agent）
    ↓
修复后重新走完整流程
```

## 最佳实践

### 1. 每次只完成一个特性
```
❌ 错误：同时实现 WebSocket 推送 + 回测系统 + 告警系统
✅ 正确：先完成 WebSocket 推送，测试通过后提交，再开始回测系统
```

### 2. 强制端到端测试
```
❌ 错误：只写单元测试，假设功能正常
✅ 正确：在模拟盘实际运行策略，验证完整流程
```

### 3. 禁止移除或修改测试
```
❌ 错误：测试失败时删除测试或注释掉断言
✅ 正确：修复代码使测试通过，或更新测试覆盖新场景
```

### 4. 保持进度文件最新
```
每次完成阶段后立即更新：
- .claude/claude-progress.txt
- .claude/features.json
```

### 5. Git 提交粒度合理
```
❌ 错误：实现 5 个特性后一次性提交
✅ 正确：每个特性完成后立即提交
```

## 工具和命令速查

### 启动脚本
```bash
# 运行环境初始化（每次开始工作前）
bash .claude/init.sh
```

### 进度查询
```bash
# 查看最近进度
tail -n 20 .claude/claude-progress.txt

# 查看当前开发中的特性
cat .claude/features.json | jq '.categories[].features[] | select(.status=="in_progress")'

# 查看测试失败的特性
cat .claude/features.json | jq '.categories[].features[] | select(.testStatus=="failing")'
```

### 测试命令
```bash
# 单元测试
pnpm test

# 测试覆盖率
pnpm test:coverage

# 模拟盘测试
BITGET_SIMULATED=1 pnpm dev
```

### 部署命令
```bash
# 构建
docker-compose build

# 启动（模拟盘）
BITGET_SIMULATED=1 docker-compose up -d

# 查看日志
docker-compose logs -f api

# 停止
docker-compose down
```

## 附录：特性示例

参考 `.claude/features.json` 中的特性定义，了解完整的特性生命周期。

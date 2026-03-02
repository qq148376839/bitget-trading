# .claude 文件夹说明

基于 [Anthropic 长期运行 agent 最佳实践](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) 为 Bitget 量化交易系统定制的 Claude Code 配置。

## 📁 目录结构

```
.claude/
├── agents/                      # Agent 定义（10 个专用 agent）
│   ├── README.md               # Agent 总览和工作流
│   ├── task-clarifier.md       # 需求澄清
│   ├── product-manager.md      # 产品经理
│   ├── architect.md            # 系统架构师
│   ├── developer.md            # 开发工程师
│   ├── trading-validator.md    # 交易验证器（量化交易特有）⭐
│   ├── security-auditor.md     # 安全审计
│   ├── tester.md               # 测试工程师
│   ├── reviewer.md             # 代码审查
│   ├── debugger.md             # 调试专家
│   └── project-summarizer.md   # 文档管理
│
├── workflows/                   # 工作流程文档
│   └── feature-development.md  # 完整特性开发流程（9 个阶段）
│
├── checklists/                  # 检查清单
│   └── deployment-readiness.md # 部署就绪检查（10 大类 100+ 检查项）
│
├── hooks/                       # Git 钩子脚本
│   └── pre-commit-checklist.sh # Pre-commit 检查（7 项自动检查）
│
├── monitoring/                  # 监控配置
│   └── trading-metrics.md      # 量化交易监控指标（5 大类 20+ 指标）
│
├── init.sh                      # 环境初始化脚本
├── claude-progress.txt          # 操作日志（状态持久化）
├── features.json                # 特性追踪（JSON 格式）
├── features.schema.json         # 特性定义 Schema
└── settings.local.json          # Claude Code 配置
```

## 🎯 核心设计理念

### 1. 增量进步（Incremental Progress）

基于 Anthropic 研究发现："Claude tended to try to do too much at once—essentially to attempt to one-shot the app."

**解决方案**：
- 每次只完成一个特性
- 完成后立即测试和提交
- 避免上下文窗口耗尽
- features.json 追踪特性状态

### 2. 状态持久化（State Continuity）

**三大持久化机制**：
- `claude-progress.txt` — 操作日志，记录每次关键变更
- `features.json` — 特性状态追踪，机器可读
- Git history — 代码变更历史，可回滚

每次 agent 启动时自动读取这些文件，快速恢复上下文。

### 3. 端到端验证（End-to-End Testing）

基于 Anthropic 发现："Claude's tendency to mark a feature as complete without proper testing disappeared when required to use Puppeteer MCP."

**解决方案**：
- 强制模拟盘测试（最少 1 小时）
- 禁止移除或修改测试
- 测试失败 = 特性未完成
- features.json 记录测试状态

### 4. 资金安全优先（Capital Safety First）

**量化交易特有的验证流程**：
- `trading-validator` agent — 专门验证资金/订单/策略变更
- 严重风险 → 立即停止流程
- 所有部署前必须通过验证
- 部署检查清单（100+ 检查项）

## 🚀 快速开始

### 首次使用

```bash
# 1. 运行环境初始化
bash .claude/init.sh

# 2. 查看 Agent 总览
cat .claude/agents/README.md

# 3. 查看特性开发流程
cat .claude/workflows/feature-development.md

# 4. 查看部署检查清单
cat .claude/checklists/deployment-readiness.md
```

### 每次会话开始

```bash
# 1. 运行环境初始化（检查环境、依赖、数据库、Git）
bash .claude/init.sh

# 2. 查看最近进度
tail -n 20 .claude/claude-progress.txt

# 3. 查看当前开发中的特性
cat .claude/features.json | jq '.categories[].features[] | select(.status=="in_progress")'

# 4. 检查测试失败的特性
cat .claude/features.json | jq '.categories[].features[] | select(.testStatus=="failing")'
```

### 完成特性后

```bash
# 1. 更新进度日志（追加）
echo "[$(date +%Y-%m-%d\ %H:%M)] developer | COMPLETED | {功能描述}" >> .claude/claude-progress.txt

# 2. 更新特性状态（编辑 features.json）
# 设置 status: "completed", testStatus: "passing", lastModified: "YYYY-MM-DD"

# 3. Git 提交
git commit -m "feat: {功能描述}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# 4. 触发 project-summarizer（自动，由 Claude 执行）
# 整理文档，更新导航文件
```

## 📋 标准工作流

### 完整特性开发（9 个阶段）

```
[Phase 1] 需求澄清 → task-clarifier
    ↓
[Phase 2] 架构设计 → architect
    ↓
[Phase 3] 开发实现 → developer
    ↓
[Phase 4] 交易验证 → trading-validator ⚠️ 强制（涉及资金/订单/策略）
    ↓
[Phase 5] 安全审计 → security-auditor
    ↓
[Phase 6] 测试编写 → tester（单元+集成+端到端）
    ↓
[Phase 7] 代码审查 → reviewer
    ↓
[Phase 8] 文档整理 → project-summarizer ⚠️ 强制（自动）
    ↓
[Phase 9] 提交部署 → developer
```

详见 `.claude/workflows/feature-development.md`

### Bug 修复流程

```
[1] 复现定位 → debugger
    ↓
[2] 修复实现 → developer
    ↓
[3] 交易验证 → trading-validator（如涉及资金/订单/策略）
    ↓
[4] 补充测试 → tester
    ↓
[5] 审查修复 → reviewer
    ↓
[6] 文档整理 → project-summarizer
    ↓
[7] 提交部署 → developer
```

## ⭐ 特殊 Agent: trading-validator

**量化交易系统特有的验证器**，确保资金安全和交易稳定性。

### 强制使用场景

- 涉及资金计算的任何变更
- 涉及订单处理的任何变更
- 涉及策略逻辑的任何变更
- 部署到生产环境前

### 验证内容

1. **资金安全验证** ✅
   - 资金充足性检查（含手续费+滑点）
   - 资金事务完整性
   - 精度计算正确性
   - 资金审计日志

2. **订单完整性验证** ✅
   - 订单参数验证
   - 订单状态同步
   - post_only 自适应
   - 订单异常处理

3. **策略盈利性验证** ✅
   - 交易成本计算
   - 风控参数合理性
   - 策略参数验证
   - 回测与验证

4. **代码质量验证** ✅
   - 错误处理
   - 日志完整性
   - 类型安全

5. **环境与配置验证** ✅
   - 环境变量检查
   - 模拟盘配置
   - 数据库迁移

### 风险处理

- **严重风险** → 立即停止流程，禁止继续
- **高风险** → 需立即修复
- **中风险** → 记录问题，计划修复
- **低风险** → 最佳实践建议

详见 `.claude/agents/trading-validator.md`

## 📊 状态管理文件

### claude-progress.txt

操作日志，记录每次 agent session 的关键变更。

```txt
[2026-03-02 14:30] developer | IMPLEMENTED | 新增 MACD 指标服务
[2026-03-02 15:00] tester | TESTED | Coverage: 85% | Status: passing
[2026-03-02 15:20] trading-validator | VALIDATED | 通过 | Risks: 0
[2026-03-02 15:30] project-summarizer | DOCUMENTED | docs/features/260302-MACD.md
```

**每次会话结束时必须追加一条记录。**

### features.json

JSON 格式的特性列表，追踪每个特性的状态、测试状态、优先级。

```json
{
  "id": "enhance-003",
  "name": "回测系统",
  "status": "pending",
  "priority": "high",
  "testStatus": "not_started",
  "files": []
}
```

**状态枚举**:
- `pending` — 待开发
- `in_progress` — 开发中
- `completed` — 已完成
- `failed` — 测试失败
- `blocked` — 被阻塞

**测试状态枚举**:
- `not_started` — 未开始测试
- `in_progress` — 测试中
- `passing` — 测试通过
- `failing` — 测试失败
- `needs_update` — 需要更新测试

### init.sh

环境初始化脚本，每次启动时运行。

```bash
bash .claude/init.sh
```

会执行：
1. 检查环境变量（BITGET_API_KEY 等）
2. 安装依赖（pnpm install）
3. 检查数据库连接
4. 运行数据库迁移
5. 显示 Git 状态
6. 读取最近进度

## 🔍 监控与告警

### 核心监控指标（5 大类）

1. **资金安全指标** 🔴（最高优先级）
   - 账户余额异常
   - 资金流水异常

2. **订单执行指标** 🟡
   - 订单成功率
   - 订单延迟
   - 订单状态一致性

3. **策略盈利指标** 🟢
   - 盈亏统计
   - 策略表现
   - 风控触发

4. **API 健康指标** 🟠
   - Bitget API 调用
   - 数据库性能
   - WebSocket 连接

5. **系统资源指标** 🔵
   - 服务可用性
   - 系统负载
   - 应用日志

详见 `.claude/monitoring/trading-metrics.md`

## 📝 Git 钩子

### pre-commit 自动检查（7 项）

```bash
# 安装钩子（可选）
ln -s ../../.claude/hooks/pre-commit-checklist.sh .git/hooks/pre-commit

# 手动运行
bash .claude/hooks/pre-commit-checklist.sh
```

**检查项**：
1. 敏感信息泄露（APIKey/SecretKey）
2. TypeScript any 类型
3. console.log（生产代码）
4. 资金操作事务
5. 错误处理
6. 测试文件更新
7. 进度文件更新

## ✅ 部署就绪检查清单

部署到生产环境前，必须完成 `.claude/checklists/deployment-readiness.md` 中的所有阻断项（🔴）。

**10 大类检查**：
1. 代码质量检查
2. 交易安全检查
3. 测试覆盖检查
4. 安全审计检查
5. 基础设施检查
6. 监控与告警检查
7. 文档与流程检查
8. 性能优化检查
9. 业务验证检查
10. 最终确认

## 🔗 相关文档

- [CLAUDE.md](../CLAUDE.md) — 项目上下文（所有 agent 共享）
- [README.md](../README.md) — 项目总览
- [CODE_MAP.md](../docs/CODE_MAP.md) — 代码地图
- [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) — 项目状态
- [CHANGELOG.md](../docs/CHANGELOG.md) — 变更日志

## 📚 参考资料

- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic 工程博客
- [Claude Quickstarts](https://github.com/anthropics/claude-quickstarts) — 官方示例项目

## ❓ 常见问题

### Q: 为什么需要 claude-progress.txt？
A: Agent 在长期运行过程中会遇到上下文窗口限制，进度文件帮助快速恢复状态，避免重复工作。

### Q: features.json 和文档中的特性列表有何区别？
A: features.json 是机器可读的状态追踪文件，文档是人类可读的详细说明。features.json 用于自动化检查。

### Q: 为什么要强制使用 trading-validator？
A: 量化交易系统的任何 Bug 都可能导致实际资金损失。trading-validator 确保所有涉及资金的变更都经过系统化验证。

### Q: 如何判断是否需要通过 trading-validator？
A: 问自己：这个变更是否可能影响资金/订单/策略？如果答案是"是"或"可能"，必须使用 trading-validator。

### Q: 模拟盘测试要运行多久？
A: 至少 1 小时。如果涉及策略变更，建议 24 小时。如果是新策略，建议一周。

### Q: 如何启用 Git pre-commit 钩子？
A: `ln -s ../../.claude/hooks/pre-commit-checklist.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`

### Q: 如何跳过 pre-commit 检查？
A: `git commit --no-verify`（不推荐用于生产代码）

## 📞 反馈与支持

如有问题或建议，请通过以下方式反馈：
- GitHub Issues: https://github.com/anthropics/claude-code/issues
- 项目负责人: [填写联系方式]

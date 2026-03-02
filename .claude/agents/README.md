# Claude Code Agents

Bitget 加密货币量化交易系统专用 agent 集合。基于 [Anthropic 长期运行 agent 最佳实践](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) 定制。

所有 agent 共享 `CLAUDE.md`（项目根目录）作为项目上下文。

## 核心设计理念

1. **增量进步** — 每次只完成一个特性，避免上下文耗尽
2. **状态持久化** — 通过 `claude-progress.txt` 和 `features.json` 追踪进度
3. **端到端验证** — 强制模拟盘测试，防止假性完成
4. **资金安全优先** — 交易系统特有的验证流程

## Agent 目录

| Agent | 角色 | 触发场景 | 优先级 |
|-------|------|---------|-------|
| **task-clarifier** | 需求澄清 | 用户请求模糊、不完整 | 前置 |
| **product-manager** | 产品经理 | 需求分析、PRD 撰写、功能规划 | 规划 |
| **architect** | 系统架构师 | 新模块设计、服务拆分、数据库 schema、技术选型 | 设计 |
| **developer** | 开发工程师 | 功能实现、Bug 修复、代码重构 | 执行 |
| **trading-validator** ⭐ | 交易验证器 | 资金/订单/策略变更（强制） | **关键** |
| **security-auditor** | 安全审计 | 安全漏洞、认证授权、交易安全 | 保障 |
| **tester** | 测试工程师 | 单元测试、集成测试、模拟盘验证 | 质量 |
| **reviewer** | 代码审查 | 代码质量、架构合规、安全检查 | 质量 |
| **debugger** | 调试专家 | Bug 排查、错误定位、性能诊断 | 修复 |
| **project-summarizer** | 文档管理 | 变更后文档整理、导航文件更新（强制执行） | 收尾 |

**⭐ trading-validator** 是量化交易系统特有的 agent，确保所有涉及资金的变更都经过严格验证。

## 标准工作流

### 完整特性开发流程 (推荐)

```
用户需求
  │
  ├─ [Phase 1] 需求澄清 → task-clarifier
  │
  ├─ [Phase 2] 架构设计 → architect
  │
  ├─ [Phase 3] 开发实现 → developer
  │
  ├─ [Phase 4] 交易验证 → trading-validator ⚠️ 强制（涉及资金/订单/策略）
  │                         │
  │                         ├─ 严重风险？→ 立即停止，返回 Phase 3
  │                         └─ 通过 → 继续
  │
  ├─ [Phase 5] 安全审计 → security-auditor
  │
  ├─ [Phase 6] 测试编写 → tester
  │                        │
  │                        ├─ 单元测试（覆盖率 ≥ 80%）
  │                        ├─ 集成测试（模拟盘）
  │                        └─ 端到端测试（至少 1 小时）
  │
  ├─ [Phase 7] 代码审查 → reviewer
  │
  ├─ [Phase 8] 文档整理 → project-summarizer ⚠️ 强制（自动触发）
  │
  └─ [Phase 9] 提交部署 → developer
                           │
                           ├─ Git 提交
                           ├─ 更新 features.json (status = "completed")
                           ├─ 更新 claude-progress.txt
                           └─ Docker 部署
```

### Bug 修复流程

```
Bug 报告
  │
  ├─ [Phase 1] 复现定位 → debugger
  │                        │
  │                        └─ 生成根因分析报告
  │
  ├─ [Phase 2] 修复实现 → developer
  │
  ├─ [Phase 3] 交易验证 → trading-validator（如涉及资金/订单/策略）
  │
  ├─ [Phase 4] 补充测试 → tester
  │                        │
  │                        └─ 添加覆盖该 Bug 的测试用例
  │
  ├─ [Phase 5] 审查修复 → reviewer
  │
  ├─ [Phase 6] 文档整理 → project-summarizer
  │
  └─ [Phase 7] 提交部署 → developer
```

## 状态管理文件（基于 Anthropic 最佳实践）

### 1. `claude-progress.txt` — 操作日志
记录每次 agent session 的关键操作，用于快速恢复上下文。

```bash
# 格式：[YYYY-MM-DD HH:MM] <Agent> | <Action> | <Details>
[2026-03-02 14:30] developer | IMPLEMENTED | 新增 MACD 指标服务
[2026-03-02 15:00] tester | TESTED | Coverage: 85% | Status: passing
[2026-03-02 15:20] project-summarizer | DOCUMENTED | docs/features/260302-MACD指标.md
```

**每个 agent 会话结束时必须追加一条记录。**

### 2. `features.json` — 特性追踪
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

**状态枚举**: `pending` | `in_progress` | `completed` | `failed` | `blocked`

**测试状态枚举**: `not_started` | `in_progress` | `passing` | `failing` | `needs_update`

### 3. `init.sh` — 环境初始化脚本
每次启动时运行，确保环境一致性。

```bash
bash .claude/init.sh
```

会执行：
- 检查环境变量
- 安装依赖
- 运行数据库迁移
- 显示 Git 状态
- 读取最近进度

## 共享上下文

所有 agent 通过 `CLAUDE.md` 获取以下共享信息：
- 项目概述（技术栈、目录结构）
- 核心服务说明（Bitget API 客户端、行情数据、订单执行、资金管理）
- 编码标准（TypeScript 规范、错误处理、日志）
- 加密货币交易规则（资金安全、订单处理、24/7 市场）
- 文档规范（命名、目录、导航文件）

每个 agent 文件只包含**角色特有**的指令和工作流，不重复共享内容。

## 配置格式

Agent 通过 YAML front matter 配置：

```yaml
---
name: agent-name
description: "Agent purpose and trigger conditions"
model: sonnet  # 可选：opus（复杂任务）| sonnet（默认）| haiku（简单快速任务）
---
```

## 核心原则（量化交易特定）

1. **增量进步优先** — 每次只完成一个特性，完成后立即提交（避免上下文耗尽）
2. **端到端验证强制** — 模拟盘实际测试，不能只依赖单元测试
3. **禁止移除测试** — 测试失败必须修复代码，不能删除或注释测试
4. **资金安全第一** — 涉及资金/订单的变更必须通过 trading-validator
5. **状态持久化** — 每次会话后更新 claude-progress.txt 和 features.json
6. **先确认后执行** — 不明确的需求必须先澄清
7. **文档同步强制** — 代码变更后必须触发 project-summarizer

## 工作流详细说明

完整的特性开发流程见 `.claude/workflows/feature-development.md`

## 快速启动

### 开始新会话
```bash
# 1. 运行环境初始化
bash .claude/init.sh

# 2. 查看最近进度
tail -n 20 .claude/claude-progress.txt

# 3. 查看当前开发中的特性
cat .claude/features.json | jq '.categories[].features[] | select(.status=="in_progress")'

# 4. 检查 Git 状态
git status
git log -5 --oneline
```

### 完成特性后
```bash
# 1. 更新进度日志（追加）
echo "[$(date +%Y-%m-%d\ %H:%M)] {agent} | {action} | {details}" >> .claude/claude-progress.txt

# 2. 更新特性状态（编辑 features.json）
# status: "completed"
# testStatus: "passing"
# lastModified: "YYYY-MM-DD"

# 3. Git 提交
git commit -m "feat: {功能描述}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# 4. 触发 project-summarizer（自动）
# 整理文档，更新导航文件
```

## 特殊 Agent 说明

### trading-validator ⚠️ 关键
**量化交易系统特有**的 agent，确保资金安全和交易稳定性。

**强制使用场景**：
- 涉及资金计算的任何变更
- 涉及订单处理的任何变更
- 涉及策略逻辑的任何变更
- 部署到生产环境前

**验证内容**：
- 资金充足性检查（含手续费+滑点）
- 订单参数正确性
- 订单状态同步完整性
- 策略盈利性评估
- 风控参数合理性

**输出**：
- 交易验证报告
- 风险等级（严重/高/中/低）
- 修复建议

**严重风险处理**：立即停止流程，返回修复，不允许继续。

## 常见问题

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

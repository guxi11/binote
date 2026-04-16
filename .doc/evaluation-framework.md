# binote 工具评估框架

评估这个工具得拆成两个独立问题：**用了多少**（描述性）和**用得值不值**（因果性）。后者比前者难一个数量级，单看"感觉变好了"是自我确认偏误。

## 一、用量：描述性指标

数据源：Claude Code 的 session transcripts（`~/.claude/projects/<proj>/*.jsonl`）+ MCP server 访问日志。分三层抽取：

**调用层**
- 各工具频次分布（`read_note / write_note / search / query_links / sync`）
- 每会话调用数 & 时间分布（前段=先验导航，后段=事后补档）
- 调用间隔（bursty vs steady）

**图谱层**
- 覆盖率 `|notes| / |source files|`
- 链接密度：每 note 平均 `[[link]]` 数
- 孤岛率：零入度 note 比例
- 新鲜度 `note.mtime - source.mtime` 分布（正值=过期）
- 空 note 率（触发 fallback 的潜在比例）

**行为层（最关键）**
- **note-first 命中率**：读 `src/X.ts` 前有没有先读 `.binote/src/X.ts.md` —— 这是 CLAUDE.md 规则的实际遵从率
- 链接遍历深度分布
- Fallback 触发率（note 空→回落 source）

## 二、效果：必须做反事实对照

**设计：ablation A/B，配对 within-subject**

| | Treatment | Control |
|---|---|---|
| binote MCP | on | off |
| 其余 | 同 prompt / 同 commit / 同 model / 同 temp | 同上 |

配对比独立组方差小一个数量级，优先选配对。

**任务集（20–30 个）**

从 git 历史挑具备 ground truth 的真实任务（原 PR diff + 测试）。**刻意分两类**：
- **Cross-file**：需跨多文件推理 → binote 主战场
- **Single-file**：对照。若这里也大幅受益，说明在测 placebo

不分层直接合并会稀释信号。

**四个核心 outcome**

| 指标 | 定义 | 预期方向 |
|---|---|---|
| Task success | 测试通过 + diff 语义等价 | ↑ |
| Input tokens to first edit | 首次 edit 前的 context 消耗 | ↓ |
| Exploratory calls | 首次 edit 前 `Grep/Glob/Read(src)` 数 | ↓ |
| Symbol hallucination rate | 生成的 identifier 在 repo 中存在的比例 | ↑ |

**统计**
- 配对 **Wilcoxon signed-rank**（非正态友好）
- 必报 effect size（rank-biserial / Cohen's d）+ 95% CI，不止 p-value
- 按任务类型分层
- 功效分析：要检测 20% token 节省（α=0.05, power=0.8），n ≈ 25 配对起步

## 三、必须控的混杂

1. **选择偏差**：主动调用 binote 的会话本身就是"Claude 状态好"的会话 → 强制开/关而非让模型自选
2. **Note 质量共变**：文档好的仓库代码往往也好 → 锁同一 commit snapshot
3. **Stale 污染**：过期 note 会主动带偏 → 分 fresh/stale 两桶报 effect
4. **Prompt leakage**：CLAUDE.md 里的"先读 binote"指令必须在 control 组同步移除，否则你在测的是指令而不是工具

## 四、MVP（别一上来搞大实验）

```
20 任务 × 2 条件 × 1 次 = 40 run
采集 {success, tokens, tool_calls, wall_time, hallucinations}
Wilcoxon + 分任务类型画箱线图
```

判断方向够用，再根据 effect size 决定是否扩样本和引入 human eval。

## 五、长期观测（benchmark 之外）

- note 覆盖率增长 vs. 每日真实任务 token 中位数的相关性
- 引入前后 `Grep/Glob` 频率的 **change-point detection**
- 把真实 session 按 "final diff 是否跨文件" 自动分桶比较
- 失败案例 qualitative review：被 stale note 带歪 / note 存在却未读 / 链接遍历过深浪费 token —— 这三种模式决定下一步改进方向

**一句话**：用量看日志，效果看配对对照；拒绝"感觉变好了"。

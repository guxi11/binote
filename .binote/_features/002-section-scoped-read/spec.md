# Feature 002 — Section-Scoped Read

> Scoped intent. Bounded by [[_constitution.md]] and [[_design/architecture.md]].
> 承接 [[_features/001-tiered-retrieval/spec.md]] 的分块嵌入基建。

## Problem

001 把 note 按 markdown heading 分段嵌入,`search` 现在能吐出**命中的 section**(`SearchHit.heading`,见 [[src/core/search.ts]] 第 269 行 `hitAtHeading`)。但读取端没跟上:

- `read_note`(见 [[src/index.ts]] 第 123 行)即便 `forwardDepth=0` 也把**整篇 body** 返回。命中一个 300 字的段,却要付整篇的 token。
- 消费项目里的实测黑洞:`usePathMutations.ts.md` **92K**、`intersectionsStore.ts.md` **89K**——search 精准命中其中一段,read 却把整座山搬进 context。CLAUDE.md 点名这是头号 token 支出。
- 割裂:写入端已经是 topic-seam 分块,读取端仍是 all-or-nothing。召回的粒度(段)和读取的粒度(篇)不一致。

## Goal

让 `read_note` 支持 **section-scoped 读取**,把召回粒度与读取粒度对齐:

- **`section` 参数**:`read_note(notePath, section: "<heading>")` 只返回该段,复用 001 的 `chunkNote`(见 [[src/core/embeddings.ts]])切段,零新基建。
- **search → read 链路闭环**:`search` 已回 `heading`,agent 用它作 anchor 直接定点读,不再整篇拉。
- **保持"最小召回"正交于 forwardDepth**:`section` 砍根 note 自身成本,`forwardDepth` 管邻域广度,`fd:0 + section` = 理论最小。

## Non-goals

- 不改 `search` 的排序/融合逻辑(001 已定)。本 feature 只动**读取端**。
- 不引入新的持久结构。section 是 `chunkNote` 的运行时派生,不落盘、不进 `_index.json`。
- 不做行级/字符级切片。切段边界 = markdown heading seam(与嵌入边界同一把尺),不另造粒度。
- 不自动改写 agent 的默认读法。section 是**可选**参数;未传时行为与今天完全一致(整篇)。

## Hard constraints(plan 必须逐条兑现)

1. **preamble 永远附带**:note 开头无标题引言(heading `""`)常载定义/框架。只回中间段会丢上下文 → 返回 = `preamble + 命中段`(+ 可选 ±1 兄弟段窗口)。
2. **导航不丢**:section 读仍须带出该 note 的 `links:` 行 + staleness 横幅(见 [[src/core/graph-read.ts]] 现有装饰),否则图拓扑与陈旧提示随整篇一起被砍掉。
3. **按大小 gate**:小 note 整篇读本就便宜。仅当 note 超阈值(建议 ≥ 4K chars)且给了有效 `section` anchor 时才走局部;否则回退整篇,且**不报错**(未知 heading = 优雅降级为整篇 + 提示)。
4. **多段命中**:MAX 只挑一段,但 `section` 应接受多值(top-k),或 search 侧回 top-k heading,避免只读一段漏掉次相关段。

## Constitution tension to resolve in plan

- **第4条(索引派生,非权威)**:section 切分是纯函数派生(`chunkNote(body)`),无缓存、无落盘 → 天然兼容,plan 里点明即可。✅
- **单一切尺**:嵌入用 `chunkNote`,读取也必须用**同一个** `chunkNote`——否则 search 命中的 heading 与 read 切出的段错位。plan 必须把 `chunkNote` 从 [[src/core/embeddings.ts]] 的 module-private 提到共享模块(如 `core/chunk.ts`),两处 import 同一实现。⚠️ 需裁决落点。

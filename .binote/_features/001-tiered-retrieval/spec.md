# Feature 001 — Tiered Retrieval

> Scoped intent. Bounded by [[_constitution.md]] and [[_design/architecture.md]].

## Problem

binote 把 RAG 查询端的工作前移到写入端,换来确定性寻址与意图边。代价有三个真实缺口,当前架构都没补:

1. **搜索是纯词法的。** [[src/core/search.ts]] 只有 fuzzy+prefix+substring(≈BM25),没有语义层。自然语言 query("鉴权怎么做的")打不中未命中关键词的笔记。RAG 的 BM25+向量 RRF 融合在这一点上碾压。
2. **读日志是死数据。** [[src/index.ts]] 把每次 `read_note` 记到 `_sessions/<date>.jsonl`,但**没有任何消费者**。`knowledge_gaps` 只按图内 inbound `[[link]]` 数排序策展需求,完全忽略了"哪些路径真的被高频读取"这个更强的需求信号。
3. **冷启动为零。** 空仓无笔记,沿 `[[link]]` 走的 agent 看不到未策展文件。RAG 第一天就有 100% 均匀(浅)覆盖。

活体佐证:file 级笔记已 stale +55 天(`src/index.ts.md` 仍描述旧 API `_read.log`/`depth:0|1`),正是"腐烂"缺口的现场。

## Goal

把 binote 的检索升级成**两层**,而非替换现有图遍历:

- **Tier 1(精度脊柱,已有)**:`[[link]]` 策展图 + 权威层级 + staleness。不动其确定性内核。
- **Tier 0(召回网,新增)**:语义/词法融合搜索,作为进入未知区域的入口。
- **桥(需求驱动晋升)**:融合 `_sessions/` 读取需求 + `knowledge_gaps` 图内需求,排出"该手写哪篇笔记",让策展税只花在承重处。

## Non-goals

- 不替换 `[[link]]` 图遍历为 ANN 检索。图仍是主路径,向量只是 `search` 工具的召回增强。
- 不引入外部服务/常驻进程作为硬依赖(违背零基建 ethos)。嵌入必须可离线、可降级。
- 不做多项目联邦索引(constitution 第11条 out-of-scope)。

## Constitution tension to resolve in plan

- **第4条(索引派生,非权威)**:向量缓存必须像 `_index.json` 一样可删可重建、非权威。✅ 兼容。
- **第8条(无 `_meta/` 影子树)**:嵌入缓存算不算影子树?需在 plan 里论证其为"派生索引"而非"持久元数据",且随 `INDEX_VERSION`([[src/types.ts]])失效。⚠️ 需明确裁决。
- **零基建 ethos**:引入嵌入模型是本 feature 的中心设计决策——本地小模型 vs 外部 API vs 不做向量。plan 里必须先定这个,再谈实现。

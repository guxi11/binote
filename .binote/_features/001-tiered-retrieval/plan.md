# Plan — 001 Tiered Retrieval

> Derived from [[_features/001-tiered-retrieval/spec.md]]. Every file this change touches is `[[linked]]` below — that link is the audit trail (constitution §10).

## Touch set

- [[src/core/search.ts]] — 新增语义召回 + RRF 融合层
- [[src/index.ts]] — 暴露读取需求信号;新工具 handler 挂载
- [[src/core/link-index.ts]] — `knowledge_gaps` 需求排序的宿主;融合读日志权重
- [[src/index.ts]] — `_sessions/<date>.jsonl` 是读需求的数据源(消费,非新增)
- [[src/core/binote-paths.ts]] — 若引入嵌入缓存,其路径约定 + `isMetaFile` 分类在此裁决
- [[src/core/scanner.ts]] — Phase 3 图播种的源码遍历
- [[src/core/note-io.ts]] — 读 `_sessions/*.jsonl`
- [[src/types.ts]] — `INDEX_VERSION` bump;新增需求信号 / 嵌入缓存类型
- [[_design/architecture.md]] — 模块边界一旦变,同步更新(设计权威)
- [[_constitution.md]] — Phase 1 触及 §4/§8,裁决写回此处

## 中心设计决策(先定这个,否则 Phase 1 无从落地)

**嵌入从哪来?** 三选一,推荐 A:

- **A. 本地小模型(推荐)** — 用 transformers.js / fastembed 跑一个量化小 embedding 模型(如 bge-small / all-MiniLM),纯本地、可离线、无常驻服务。契合"贴着源码活、零基建"的 ethos。代价:首次下载模型权重 + 冷启动编码成本。
- B. 外部 API(OpenAI/本地 Ollama)— 质量最好但引入网络/服务硬依赖,违背 headless/cron 可用性(设计文档已警告 MCP 在 headless 下可能缺失)。仅作可选后端。
- C. 不做向量,把 §2 桥做厚 — 只靠读需求 + 图内需求增强现有词法搜索。零新依赖,但没解决 NL↔symbol 语义鸿沟。作为 A 不可行时的降级。

**裁决**:默认 A,后端可插拔(`SearchBackend` 接口),缺模型时自动降级到 C(现有词法路径)。嵌入缓存定性为**派生索引**(等同 `_index.json`):存 `.binote/_embeddings/`,随 `INDEX_VERSION` + note mtime 失效,可删可重建 → 兼容 constitution §4;不算 §8 的"影子树"(那指持久*元数据*,这是可弃*缓存*)。此裁决需写回 [[_design/architecture.md]] 的 "What is explicitly out of scope" 与 [[_constitution.md]] §8 旁注。

## Phases(按 ROI/风险比排序,可独立交付)

### Phase 2 → 先做:读需求晋升桥(最便宜的金矿,零新依赖)

现状:`knowledge_gaps` 只按图内 inbound `[[link]]` 数排。`_sessions/*.jsonl` 是死数据。

改动:
1. [[src/core/note-io.ts]] / [[src/index.ts]] 新增 `readDemand()` — 聚合 `_sessions/*.jsonl` 里各 notePath 的读取频次(近 N 天,时间衰减)。
2. [[src/core/link-index.ts]] 的 `knowledge_gaps` 排序改为融合分:`inboundRefs`(图需求)+ `readFreq`(实际需求)。高读频 + 空/stale 的笔记优先晋升。
3. 顺带:`audit_status` 也可用读频加权 staleness 排序——被高频读的 stale 笔记比没人读的 stale 笔记更该修。

验收:对本仓运行,`src/core/search.ts`(空 + 被搜索场景高频)应排到晋升榜前列;纯词法可验证,无需模型。风险最低,建议第一个落。

### Phase 1 → 再做:混合搜索(Tier 0 召回网)

改动 [[src/core/search.ts]]:
1. 抽 `SearchBackend` 接口,现有实现命名为 `LexicalBackend`(保留,永远是降级底座)。
2. 新增 `SemanticBackend`:按笔记切块(binote 天然以 file/module 为单元,**不需要语义分块**——直接整篇或按 `##` 标题切),编码入 `.binote/_embeddings/` 缓存。
3. `search` 工具融合两路:RRF(lexical rank, semantic rank)。标识符/错误码/CLI flag 走词法命中,NL query 走语义。
4. [[src/types.ts]] 加嵌入缓存 schema + version;[[src/core/binote-paths.ts]] 加缓存路径与 `isMetaFile` 分类。

注意:binote 已**天然免疫** RAG 那 12 条里的分块(①)、面包屑(②,路径即面包屑)、分层检索(⑦,`_dir`→file→link 已是)、rerank/RSE(⑧⑨,单元即整篇)。所以这里**只补向量融合一条**,不要把整套 RAG 栈搬进来。

验收:NL query("怎么做链接解析")能召回 `binote-paths.ts.md` 即便正文无该措辞。

### Phase 3 → 最后:图播种(冷启动,最大最投机)

改动 [[src/core/scanner.ts]] + 新模块:tree-sitter / TS compiler API 从 import 关系自动推导骨架 `[[link]]`,写进新建或空笔记的 "Links" 段,标注为机器生成(可被人工策展覆盖)。让空仓不再是全黑。

风险:自动边是句法的(A imports B),没有意图。必须与手写语义边区分(如单独 heading `## Derived links`),否则污染 Tier 1 的策展纯度。仅在 Phase 1/2 验证有效后再评估。

## 交付顺序

`Phase 2`(1 个 PR,零依赖,立即有值)→ `Phase 1`(定后端 + 缓存裁决后)→ `Phase 3`(可选)。每个 phase 落地后跑 `/binote:verify` 并把边界变更写回 [[_design/architecture.md]]。

## Status

- **Phase 2 — DONE.** 读需求晋升桥已落地。发现并修复了比 spec 更深的缺口:读日志的**生产者**在 0.4.0(`aec4842`)被删,`_sessions/*.jsonl` 自 5 月起既无消费者也无生产者,而 [[_design/architecture.md]] §invariant-3 仍断言 reads are logged——设计/代码背离。落地:
  - [[src/index.ts]] `read_note` 重挂 **精简** 生产者(只记 `{ts,input,forwardDepth,backDepth,chars}`,不再记 result 正文——0.4.0 删它正因正文太重)。
  - [[src/core/read-demand.ts]](新)`readDemand()` 消费者:brace-depth scanner 同时吃旧的 pretty-print 日志与新 JSONL,指数近因衰减(halfLife 21d)。
  - [[src/index.ts]] `knowledge_gaps.missingMirrors` 融合 `demandScore = inboundRefs + 2·readFreq`;`audit_status` 层内按 `(drift+1)·(1+2·readFreq)` 排序。
  - [[src/types.ts]] `BinoteConfig.sessionsDir`;[[src/core/binote-paths.ts]] `makeConfig`;[[src/util/fs-helpers.ts]] `appendLog`。
  - 边界变更已写回 [[_design/architecture.md]](invariant-3、Module map、Retrieval demand signal 节、工具表补 `knowledge_gaps`)。无新依赖,`INDEX_VERSION` 未 bump(读需求不入 `_index.json`,合 §5/§8)。
- **Phase 1 — 未做**(需先定嵌入后端 + 缓存裁决)。
- **Phase 3 — 未做**(投机,门槛:Phase 1/2 验证有效后再评估)。

## Next

`/binote:verify` 审计 Phase 2 触及的笔记;跑通后再评估 `Phase 1`。

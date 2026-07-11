# Feature 002 — Tasks

> Ordered from [[_features/002-section-scoped-read/plan.md]]. T1 gates the rest (shared cut).

## T1 — 抽出 `src/core/chunk.ts`(阻塞 T2/T3)
- 从 [[src/core/embeddings.ts]] 移出 `chunkNote`、`CHUNK_TARGET_CHARS`、`packParagraphs`、`NoteChunk` 型到新 `src/core/chunk.ts`。
- 新增:`SECTION_GATE_CHARS = 4_000`、`normalizeHeading(s)`(与 [[src/core/search.ts]] `hitAtHeading` 同规范化)、`sliceSections(body, sections, {window=0}): string`。
- `embeddings.ts` 改 import,删本地定义。
- **完成判据**:`npm run build` 通过;`git diff dist/core/embeddings.js` 语义等价(纯搬迁无行为变更)。
- 依赖:无。

## T2 — `read_note` 接 `section` 参数
- [[src/index.ts]]:inputSchema 加 `section: z.union([z.string(), z.array(z.string())]).optional()`,描述里写明"配合 search 命中的 heading 定点读,砍大 note 全文成本"。
- handler:仅在**单篇 + forwardDepth=0** 路径,若 `body.length >= SECTION_GATE_CHARS` 且 `section` 有效 → 调 `sliceSections`;否则整篇。未知 heading → 整篇 + 提示行(不抛错)。
- **完成判据**:传合法 heading 返回 preamble+段+links;传未知 heading 优雅降级整篇;不传 section 行为与今天一致。
- 依赖:T1。

## T3 — 装饰复用(staleness + links 不丢)
- [[src/core/graph-read.ts]]:抽出 staleness 横幅 + `links:` 行的装饰为可复用点,section 路径与整篇路径共用,避免两套装饰漂移。
- **完成判据**:section 返回体顶部有 staleness 横幅(若 stale)、底部有 `links:` 行。
- 依赖:T1。可与 T2 并行(不同文件),集成在 T4 汇合。

## T4 — 测试
- 单测:`chunk.ts` 抽迁 byte-equal 回归(锁 T1)。
- 单测:`sliceSections` × {preamble-only, 未知 heading, 多段 top-k, 超阈值 gate, 未达阈值回退}。
- 集成:真 92K note `read_note(section)` token 数 vs 整篇,断言下降 + 含 preamble + links。
- **完成判据**:全绿;`EMBEDDINGS_VERSION` 未变(读取端零触碰写入端)。
- 依赖:T1–T3。

## T5 — 文档 + 发布
- `commands/mode.md` / `README.md`:补 `search → read_note(section=heading)` 推荐链路。
- 版本 bump(3 文件 + `sync-version`)、`npm run build`、bare-version commit + tag、push、本机 cache patch(见 [[CLAUDE.md]] Release & local plugin update)。
- 依赖:T1–T4。

# Feature 002 — Plan

> Derives from [[_features/002-section-scoped-read/spec.md]]. Touch set below links every file the change hits.

## Decision 1 — `chunkNote` 的落点(单一切尺裁决)

现状:`chunkNote` / `CHUNK_TARGET_CHARS` / `packParagraphs` 是 [[src/core/embeddings.ts]] 的 module-private const。读取端要复用同一把尺(否则 search 命中的 heading 与 read 切段错位)。

**裁决**:抽到新纯模块 `src/core/chunk.ts`——无 I/O、无 config、无模型依赖,只输入 `body: string` → 输出 `readonly NoteChunk[]`。`embeddings.ts` 与 read 路径都从这里 import。符合 constitution 第4条(纯派生)。

- `chunk.ts` 导出:`chunkNote(body): readonly {heading, text}[]`、`CHUNK_TARGET_CHARS`。
- `embeddings.ts` 删本地定义,改 `import { chunkNote } from "./chunk.js"`。行为不变(纯搬迁,dist 输出等价——发布前 diff 校验)。

## Decision 2 — `section` 匹配语义

`search` 回的 `heading` 是**去掉 `#` 前缀、trim 后的纯文本**(见 [[src/core/search.ts]] `hitAtHeading` 第 216–219 行的匹配式)。`read_note(section)` 必须用**同一规范化**匹配 `chunkNote` 产出的 `chunk.heading`:

- 精确匹配 `chunk.heading === normalize(section)`。
- 未命中(未知 heading / 拼错)→ **降级为整篇**,body 顶部加一行提示 `> section "X" not found — returning full note`。不抛错(spec 约束3)。
- `section` 接受 `string | string[]`(spec 约束4,top-k)。多值时按 note 内**文档序**拼接命中段,去重。

## Decision 3 — 组装形状(spec 约束1&2)

section 读的返回体 = 有序拼接:

```
<staleness banner if any>      ← 复用 graph-read.ts 现有装饰
<preamble chunk (heading "")>  ← 永远附带(约束1);若命中段本身就是 preamble 则不重复
<matched section(s)>           ← 命中段,±0(默认)可配 ±1 兄弟窗
<links: line>                  ← 复用 note 的 links 导航行(约束2)
```

- gate:仅当 `body.length >= SECTION_GATE_CHARS`(建议 4_000)且 `section` 有效时走此路;否则原样整篇。gate 常量放 `chunk.ts` 与 CHUNK 常量同处。

## Touch set

| 文件 | 改动 |
|---|---|
| `src/core/chunk.ts`(新) | 抽出 `chunkNote`/`CHUNK_TARGET_CHARS` + 新增 `SECTION_GATE_CHARS`、`normalizeHeading`、`sliceSections(body, sections, {window})` |
| [[src/core/embeddings.ts]] | 删本地 chunk 定义,import from `chunk.ts`(纯搬迁,输出等价) |
| [[src/index.ts]] | `read_note` inputSchema 加 `section: z.union([z.string(), z.array(z.string())]).optional()`;handler 在 fd=0 单篇路径上,若 gate 命中则调 `sliceSections` 替代整篇 body |
| [[src/core/graph-read.ts]] | 复用其 staleness/links 装饰;section 路径也要经过同一装饰函数(抽出可复用点,避免两套装饰) |
| [[src/types.ts]] | 若需 `ReadSection` 结果型则加;否则复用 string body。`INDEX_VERSION` **不动**(读取端不碰嵌入缓存格式) |
| `commands/mode.md` / `README.md` | 文档:search→read section 链路的推荐用法 |

## 不动

- 嵌入缓存格式 / `EMBEDDINGS_VERSION` / `INDEX_VERSION`——读取端零接触持久层。
- `search` 排序、RRF 融合、`forwardDepth`/`backDepth` 语义。
- fd≥1 的邻域 excerpt 逻辑(excerpt 已是压缩形态,section 只优化根 note 的 fd=0 全文路径)。

## 验证

1. 单测:`chunk.ts` 抽迁后 `embeddings.ts` 产出 byte-equal(锁死"纯搬迁")。
2. 单测:`sliceSections` 对 preamble-only / 未知 heading / 多段 / 超阈值 gate 四种输入的返回形状。
3. 集成:真 note(取消费项目里的 `usePathMutations.ts.md` 92K)`read_note(section: <search 命中 heading>)` 的 token 数 vs 整篇,断言显著下降且含 preamble + links 行。
4. 发布前 `EMBEDDINGS_VERSION` 未变 → 消费项目 embedding 缓存**不**触发重嵌(本 feature 不该动写入端)。

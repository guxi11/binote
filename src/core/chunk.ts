/**
 * Single cut ruler (feature 002). Heading-boundary sectioning is a pure runtime
 * derivation of a note body — no I/O, no config, no model. Both the embedding
 * writer ([[embeddings.ts]]) and the section-scoped reader ([[index.ts]] read_note)
 * import from here so `search.heading` and `read_note(section)` cut on the SAME
 * seam; two rulers would misalign recall granularity against read granularity.
 * Constitution §4: derived, never persisted.
 */

/** Structure-aware chunk cap. e5 truncates at 512 tokens (~1.5–2.5K chars, less
 *  for CJK); keep every section under it so no section's tail is silently
 *  dropped. Sections above this are sub-split on paragraph breaks. */
export const CHUNK_TARGET_CHARS = 1_400;

/** Above this body size a bare read pays real token cost — only then does a
 *  valid `section` anchor route to a local slice; small notes read whole. */
export const SECTION_GATE_CHARS = 4_000;

const HEADING_RE = /^#{1,6}\s/;

export type NoteChunk = { readonly heading: string; readonly text: string };

/** Normalize a heading to the plain-text form `search` returns and `splitSections`
 *  produces: strip the leading `#…` marker, trim. Idempotent on already-plain input,
 *  so a search-provided heading and a hand-typed `## Foo` both match one section. */
export const normalizeHeading = (s: string): string => s.replace(/^#{1,6}\s+/, "").trim();

/**
 * Split a note body at markdown heading seams — the topic-seam unit that
 * `search.heading` names. Pre-heading preamble becomes its own section (heading "").
 * Full-fidelity: each section's text is verbatim, no sub-splitting (that is the
 * embedding writer's concern, below).
 */
export const splitSections = (body: string): readonly NoteChunk[] => {
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let cur = { heading: "", lines: [] as string[] };
  for (const line of body.split("\n")) {
    if (HEADING_RE.test(line)) {
      if (cur.heading || cur.lines.some((l) => l.trim())) sections.push(cur);
      cur = { heading: normalizeHeading(line), lines: [line] };
    } else cur.lines.push(line);
  }
  sections.push(cur);
  return sections
    .map((s) => ({ heading: s.heading, text: s.lines.join("\n").trim() }))
    .filter((s) => s.text.length > 0);
};

/**
 * Table-of-contents for a large note: its preamble text plus the heading seam of
 * every section (with each section's char weight, so the reader can judge which
 * one is worth pulling). Cut on the SAME ruler as `sliceSections`, so every
 * heading listed here is a valid `section` anchor. Returns null when there are
 * fewer than two headings — nothing to choose between, so a bare read is already
 * as cheap as it gets and the caller should just return the full body.
 */
export const noteOutline = (
  body: string
): { readonly preamble: string; readonly sections: readonly { readonly heading: string; readonly chars: number }[] } | null => {
  const secs = splitSections(body);
  const preamble = secs.find((s) => s.heading === "")?.text ?? "";
  const sections = secs
    .filter((s) => s.heading.length > 0)
    .map((s) => ({ heading: s.heading, chars: s.text.length }));
  return sections.length >= 2 ? { preamble, sections } : null;
};

/** Greedy-pack paragraphs of an oversized section up to `max` chars; a single
 *  paragraph longer than `max` is hard-sliced (last resort). */
const packParagraphs = (text: string, max: number): readonly string[] => {
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  for (const p of text.split(/\n\s*\n/)) {
    if (p.length > max) {
      flush();
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    } else {
      if (buf.length + p.length + 2 > max) flush();
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  flush();
  return out;
};

/**
 * Embeddable chunks: heading-boundary sections, with any section above the model
 * window sub-split on paragraph breaks so no section tail is lost to truncation.
 * Sub-chunks keep their parent heading (so search still names the whole section).
 * Output is byte-identical to the pre-refactor module-local definition.
 */
export const chunkNote = (body: string): readonly NoteChunk[] =>
  splitSections(body).flatMap((s) =>
    s.text.length <= CHUNK_TARGET_CHARS
      ? [s]
      : packParagraphs(s.text, CHUNK_TARGET_CHARS).map((text) => ({ heading: s.heading, text }))
  );

/**
 * Section-scoped read (spec 002 constraint 1&3): assemble preamble + the section(s)
 * whose heading matches `sections` (±`window` sibling sections), in document order,
 * deduped. The leading preamble (heading "") is always included — it commonly holds
 * the definitions the matched section leans on. Returns null when NO requested
 * heading matches, so the caller degrades gracefully to the full note (spec constraint 3).
 */
export const sliceSections = (
  body: string,
  sections: readonly string[],
  opts: { readonly window?: number } = {}
): string | null => {
  const window = opts.window ?? 0;
  const wanted = new Set(sections.map(normalizeHeading).filter((h) => h.length > 0));
  if (wanted.size === 0) return null;

  const secs = splitSections(body);
  const matched = secs.flatMap((s, i) => (wanted.has(s.heading) ? [i] : []));
  if (matched.length === 0) return null;

  const keep = new Set<number>();
  const preamble = secs.findIndex((s) => s.heading === "");
  if (preamble >= 0) keep.add(preamble);
  for (const i of matched)
    for (let j = i - window; j <= i + window; j++)
      if (j >= 0 && j < secs.length) keep.add(j);

  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => secs[i]!.text)
    .join("\n\n");
};

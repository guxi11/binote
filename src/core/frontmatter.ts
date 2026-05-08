/**
 * Minimal line-based YAML-ish frontmatter for binote notes.
 *
 * Format: a leading `---\n...\n---` block, where each interior line is
 * `key: value` (no nesting, no quoting, no multi-line). Anything else is
 * preserved as body. The grammar is intentionally tiny — only a handful of
 * scalars (lastVerified, etc.) live here and they don't need full YAML.
 */

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type Parsed = {
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly body: string;
};

export const parseFrontmatter = (raw: string): Parsed => {
  const m = FM_RE.exec(raw);
  if (!m) return { frontmatter: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) fm[key] = val;
  }
  return { frontmatter: fm, body: raw.slice(m[0].length) };
};

/**
 * Serialize back to a single string. If the frontmatter object is empty,
 * returns the body unchanged (no leading separator).
 */
export const serialize = (fm: Readonly<Record<string, string>>, body: string): string => {
  const keys = Object.keys(fm);
  if (keys.length === 0) return body;
  const fmText = keys.map((k) => `${k}: ${fm[k]}`).join("\n");
  const sep = body.length === 0 || body.startsWith("\n") ? "" : "\n";
  return `---\n${fmText}\n---\n${sep}${body}`;
};

/**
 * Update one or more frontmatter keys, preserving body and other keys.
 * Pass null as a value to delete a key.
 */
export const updateFrontmatter = (
  raw: string,
  updates: Readonly<Record<string, string | null>>,
): string => {
  const { frontmatter, body } = parseFrontmatter(raw);
  const next: Record<string, string> = { ...frontmatter };
  for (const [k, v] of Object.entries(updates)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return serialize(next, body);
};

/**
 * Frontmatter parsing backed by gray-matter (real YAML).
 *
 * Notes in the wild carry nested YAML (metadata blocks, lists) that the old
 * line-based parser silently mangled. gray-matter handles them; consumers get
 * a loosely-typed record plus `fmString` for scalar access (YAML timestamps
 * parse as Date — coerced back to ISO strings).
 */

import matter from "gray-matter";

export type Parsed = {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body: string;
};

export const parseFrontmatter = (raw: string): Parsed => {
  try {
    const { data, content } = matter(raw);
    return { frontmatter: data, body: content };
  } catch {
    // Malformed YAML → treat the whole file as body rather than throwing.
    return { frontmatter: {}, body: raw };
  }
};

/** Scalar frontmatter accessor. Dates → ISO strings, other scalars → String(). */
export const fmString = (
  fm: Readonly<Record<string, unknown>>,
  key: string,
): string | null => {
  const v = fm[key];
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return typeof v === "string" ? v : typeof v === "object" ? null : String(v);
};

/**
 * Update one or more frontmatter keys, preserving body and any other keys
 * (including nested structures). Pass null as a value to delete a key.
 */
export const updateFrontmatter = (
  raw: string,
  updates: Readonly<Record<string, string | null>>,
): string => {
  const { frontmatter, body } = parseFrontmatter(raw);
  const next: Record<string, unknown> = { ...frontmatter };
  for (const [k, v] of Object.entries(updates)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return Object.keys(next).length === 0 ? body : matter.stringify(body, next);
};

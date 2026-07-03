/**
 * Compact note excerpts for graph expansion.
 *
 * A linked node's full body inlined at forwardDepth≥1 was the dominant token
 * cost (measured 12.6× blow-up per read). An excerpt keeps just enough to
 * decide whether to drill in: description, first paragraph, heading outline.
 */

/** Bodies at or under this size are returned whole — excerpting loses more than it saves. */
const SMALL_BODY_CHARS = 600;
const FIRST_PARA_CHARS = 400;
const MAX_HEADINGS = 12;

const isHeading = (line: string): boolean => /^#{1,6}\s/.test(line);
const isNoise = (line: string): boolean =>
  line.trim().length === 0 || line.startsWith("<!--");

/** First run of content lines (skipping headings/comments), capped. */
const firstParagraph = (lines: readonly string[]): string => {
  const start = lines.findIndex((l) => !isNoise(l) && !isHeading(l));
  if (start === -1) return "";
  const end = lines.findIndex((l, i) => i > start && l.trim().length === 0);
  const para = lines.slice(start, end === -1 ? undefined : end).join("\n");
  return para.length > FIRST_PARA_CHARS ? `${para.slice(0, FIRST_PARA_CHARS)}…` : para;
};

const outline = (lines: readonly string[]): string => {
  const headings = lines.filter(isHeading).map((h) => h.trim());
  if (headings.length === 0) return "";
  const shown = headings.slice(0, MAX_HEADINGS);
  const more = headings.length - shown.length;
  return `outline: ${shown.join(" · ")}${more > 0 ? ` (+${more} more)` : ""}`;
};

/**
 * Excerpt a note body: frontmatter description + first paragraph + outline.
 * Small bodies pass through untouched.
 */
export const excerptBody = (body: string, description: string | null): string => {
  if (body.length <= SMALL_BODY_CHARS) return body;
  const lines = body.split("\n");
  const parts = [
    description ?? "",
    firstParagraph(lines),
    outline(lines),
  ].filter((p) => p.length > 0);
  // Degenerate body (e.g. one giant paragraph) → excerpt is just the cap.
  return parts.length > 0 ? parts.join("\n\n") : `${body.slice(0, FIRST_PARA_CHARS)}…`;
};

const LINK_RE = /\[\[([^\[\]]+)\]\]/g;

/** Extract all [[link]] targets from markdown content */
export const extractLinks = (content: string): readonly string[] => {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(content)) !== null) {
    links.push(match[1]!);
  }
  return links;
};

/** Replace all occurrences of [[oldTarget]] with [[newTarget]] */
export const replaceLink = (
  content: string,
  oldTarget: string,
  newTarget: string
): string =>
  content.replaceAll(`[[${oldTarget}]]`, `[[${newTarget}]]`);

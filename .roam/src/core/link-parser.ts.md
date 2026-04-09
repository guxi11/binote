# link-parser.ts

## Summary

Tiny module for `[[wiki link]]` syntax: extracts targets from markdown and rewrites a link target across content. The regex `\[\[([^\[\]]+)\]\]` deliberately rejects nested brackets so a malformed `[[a [[b]]]]` parses as a single inner link rather than producing overlapping matches.

## Key Exports

- `extractLinks(content)` — ordered list of raw target strings (no resolution)
- `replaceLink(content, oldTarget, newTarget)` — string replace of all `[[oldTarget]]` occurrences

## Notes

- `replaceLink` matches the literal target including spaces — there is no whitespace normalization. Renames must use the exact stored form.
- The regex uses a global flag with `exec` in a loop and relies on `lastIndex` advancing. The module-level `LINK_RE` is fine in practice because each call runs a fresh loop to completion.

## Links

- [[link-index.ts]] — only consumer of `extractLinks`
- [[roam-paths.ts]] — `resolveLink` complements raw extraction

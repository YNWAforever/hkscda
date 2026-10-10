function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The body of the LAST `create [or replace] function <qualifiedName>(` in `sql`: the text between
 * its opening `as $tag$` and the first matching closing `$tag$`. The tag may be empty (`$$`).
 * It also works when the definition sits inside an `execute $definition$ ... $definition$`
 * wrapper, since the body tag differs from the wrapper's. Throws when no definition matches.
 */
export function extractFunctionBody(sql: string, qualifiedName: string): string {
  const create = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${escapeRegExp(qualifiedName)}\\s*\\(`,
    "gi",
  );
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = create.exec(sql)) !== null) last = match.index + match[0].length;
  if (last < 0) throw new Error(`No create function found for ${qualifiedName}`);

  const open = /\bas\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/i.exec(sql.slice(last));
  if (!open) throw new Error(`No dollar-quoted body found for ${qualifiedName}`);
  const tag = open[1];
  const bodyStart = last + open.index + open[0].length;
  const bodyEnd = sql.indexOf(tag, bodyStart);
  if (bodyEnd < 0) throw new Error(`Unterminated ${tag} body for ${qualifiedName}`);
  return sql.slice(bodyStart, bodyEnd);
}

/** Strips `--` comments, lowercases and collapses whitespace, so substring checks are stable. */
export function normaliseSql(text: string): string {
  return text
    .replace(/--[^\n]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

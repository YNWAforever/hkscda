import type { ReactNode } from "react";

const PUNCTUATION = /[，、。！？：；,.!?:;）」』)\]…—]/;
const SHORT_CLAUSE = 8;
const MIN_TAIL = 4;

/**
 * Where the unbreakable tail of a sentence starts. Chinese wraps between any two
 * characters, so a lead paragraph can end with one or two characters alone on
 * the last line (歸屬。). The tail is the closing clause when it is short
 * (照顧與歸屬。), otherwise the last four characters, never the whole text.
 */
export function tailStart(text: string): number {
  const chars = [...text];
  let end = chars.length;
  while (end > 0 && PUNCTUATION.test(chars[end - 1])) end -= 1;
  if (end <= MIN_TAIL * 2) return -1;

  let clauseStart = end;
  while (clauseStart > 0 && !PUNCTUATION.test(chars[clauseStart - 1])) clauseStart -= 1;
  const start = end - clauseStart <= SHORT_CLAUSE ? clauseStart : end - MIN_TAIL;
  return chars.slice(0, start).join("").length;
}

/** Renders `text` with its closing phrase kept on one line. */
export function keepTail(text: string): ReactNode {
  const index = tailStart(text);
  if (index <= 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <span className="keep-tail">{text.slice(index)}</span>
    </>
  );
}

/** Small wording helpers shared by the explainer and renderers. */

/** Names for code points that have no visible glyph or are easy to misread. */
const NAMED_CODE_POINTS: Readonly<Record<number, string>> = {
  0x00: "a null character",
  0x08: "a backspace",
  0x09: "a tab",
  0x0a: "a line feed (newline)",
  0x0b: "a vertical tab",
  0x0c: "a form feed",
  0x0d: "a carriage return",
  0x20: "a space",
  0xa0: "a non-breaking space",
  0x2028: "a line separator",
  0x2029: "a paragraph separator",
  0xfeff: "a byte order mark",
};

/**
 * Wraps text in a Markdown code span, choosing a fence that survives embedded backticks.
 *
 * @param text The text to wrap.
 *
 * @returns The code span.
 */
export function code(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") || isPadded(text) ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/**
 * Describes a single code point as a noun phrase.
 *
 * @param cp The code point.
 *
 * @returns A phrase such as "the character `a`", "a tab", or "the character U+200B".
 */
export function describeCodePoint(cp: number): string {
  const named = NAMED_CODE_POINTS[cp];
  if (named) {
    return named;
  }
  const ch = String.fromCodePoint(cp);
  if (/^[\p{C}\p{Z}]$/u.test(ch)) {
    return `the character U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return `the character ${code(ch)}`;
}

/**
 * Lowercases the first character.
 *
 * @param text The text.
 *
 * @returns The text with its first character lowercased.
 */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Prefixes a noun with "a" or "an".
 *
 * @param noun The noun phrase.
 *
 * @returns The phrase with its article.
 */
export function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

/** A run of description text, either plain or from a code span. */
export interface TextPart {
  /** The text, with code span fences and padding removed. */
  readonly text: string;
  /** Whether the text came from a code span. */
  readonly code: boolean;
}

/**
 * Splits text into plain runs and the contents of its Markdown code spans, so that descriptions can
 * be rendered without a Markdown parser. It reverses {@link code}.
 *
 * @param text Text that may contain code spans, such as an explanation's description.
 *
 * @returns The parts in order. Adjacent plain text is one part.
 */
export function splitCodeSpans(text: string): TextPart[] {
  const spans = [...text.matchAll(/(?<!`)(`+)(?!`)([\s\S]+?)(?<!`)\1(?!`)/g)];
  // Where the plain text before each span starts, then where the text after the last span starts.
  const plainStarts = [0, ...spans.map((span) => span.index + span[0].length)];
  const parts = spans.flatMap((span, i) => {
    const content = span[2];
    return [
      ...plainPart(text.slice(plainStarts[i], span.index)),
      { text: isPadded(content) ? content.slice(1, -1) : content, code: true },
    ];
  });
  return [...parts, ...plainPart(text.slice(plainStarts[spans.length]))];
}

/**
 * Tests whether CommonMark strips one character from each side of a code span's content: after line
 * endings become spaces, it starts and ends with a space and is not all spaces.
 *
 * @param content The code span's content.
 *
 * @returns Whether the content is padded.
 */
function isPadded(content: string): boolean {
  const spaced = content.replace(/\r\n?|\n/g, " ");
  return /^ [\s\S]* $/.test(spaced) && /[^ ]/.test(spaced);
}

/**
 * Wraps plain text as a part, unless it is empty.
 *
 * @param text The text.
 *
 * @returns One plain part, or none for empty text.
 */
function plainPart(text: string): TextPart[] {
  return text === "" ? [] : [{ text, code: false }];
}

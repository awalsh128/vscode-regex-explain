/**
 * Turns the source text of string literals into the values they denote, so that a pattern written
 * as `"\\d+"` in source is explained as `\d+`. The tree-sitter grammars mark escapes and
 * interpolations; this module only decodes escapes.
 */
import type { RegexSource } from "./explainer";

/** Single-character escapes that mean the same in every supported language that has them. */
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
};

/** Closing delimiters of PCRE patterns that open with a bracket. */
const CLOSING_BRACKETS: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
};

/**
 * Decodes one escape sequence from a string literal.
 *
 * Unknown single-character escapes such as `\q` decode to the character, as in JavaScript and Ruby.
 * Grammars for languages that keep the backslash, such as Python and PHP, do not mark those as
 * escapes, so they never reach this function.
 *
 * @param escape The escape's source text, starting with a backslash.
 *
 * @returns The decoded text, or undefined for escapes that cannot be decoded without knowing the
 *   language, such as Python's `\N{name}`, or `\a` and `\e`, which are control characters in some
 *   languages and plain letters in JavaScript.
 */
export function decodeEscape(escape: string): string | undefined {
  const body = escape.slice(1);
  const hex = /^(?:x([\da-f]{1,2})|[xu]\{([\da-f]+)\}|u([\da-f]{4})|U([\da-f]{8}))$/i.exec(body);
  if (hex) {
    const codePoint = parseInt(hex.slice(1).find((group) => group !== undefined) ?? "", 16);
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : undefined;
  }
  if (/^[0-7]{1,3}$/.test(body)) {
    return String.fromCodePoint(parseInt(body, 8));
  }
  if (/^\r?\n$/.test(body)) {
    // A backslash before a line break continues the string on the next line.
    return "";
  }
  if ([...body].length !== 1 || body === "a" || body === "e") {
    return undefined;
  }
  return SIMPLE_ESCAPES[body] ?? body;
}

/**
 * Splits a PCRE-style pattern such as PHP's `'/a+/i'` into its pattern and flags.
 *
 * @param value The string's value. Its first character is the delimiter; brackets close with their
 *   pair.
 *
 * @returns The parts, or undefined if the value is not delimited.
 */
export function splitDelimitedPattern(value: string): RegexSource | undefined {
  const open = value.charAt(0);
  if (open === "" || /[\p{L}\p{N}\s\\]/u.test(open)) {
    return undefined;
  }
  const close = value.lastIndexOf(CLOSING_BRACKETS[open] ?? open);
  if (close < 1) {
    return undefined;
  }
  return { pattern: value.slice(1, close), flags: value.slice(close + 1) };
}

/**
 * Rewrites flags into their JavaScript equivalents.
 *
 * @param flags The flags as written in the source language.
 * @param map Replacement for each flag that differs; an empty string drops a flag that does not
 *   change what matches. Flags not in the map are kept, so the explainer reports unknown ones.
 *
 * @returns The JavaScript flags.
 */
export function translateFlags(flags: string, map: Readonly<Record<string, string>>): string {
  return [...flags].map((flag) => map[flag] ?? flag).join("");
}

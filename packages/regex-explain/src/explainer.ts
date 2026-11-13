/**
 * Turns an ECMAScript regular expression into a tree of plain-English explanations.
 *
 * Parsing is done by `@eslint-community/regexpp`, character set and length analysis by
 * `regexp-ast-analysis`, and backtracking analysis by `scslre`. This module walks the AST and words
 * the results.
 */
import { AST, RegExpParser, RegExpSyntaxError } from "@eslint-community/regexpp";
import {
  getCapturingGroupNumber,
  getLengthRange,
  ReadonlyFlags,
  toUnicodeSet,
  ToUnicodeSetElement,
} from "regexp-ast-analysis";
import { analyse, Report } from "scslre";
import { code, describeCodePoint, lowerFirst, withArticle } from "./text";

/** One explained piece of the pattern. */
export interface ExplanationNode {
  /** The pattern source this node explains. */
  readonly raw: string;
  /** Offset of `raw` in the pattern, inclusive. */
  readonly start: number;
  /** Offset of `raw` in the pattern, exclusive. */
  readonly end: number;
  /** A sentence or noun phrase describing `raw`. May contain Markdown code spans. */
  readonly description: string;
  /** Explanations of the parts of `raw`, in source order. */
  readonly children: readonly ExplanationNode[];
}

/** The meaning of one flag. */
export interface FlagExplanation {
  /** The flag letter, such as `g`. */
  readonly flag: string;
  /** The `RegExp` property the flag sets, such as `global`. */
  readonly name: string;
  /** What the flag does. May contain Markdown code spans. */
  readonly description: string;
}

/** A regex as `new RegExp(pattern, flags)` takes it: the pattern without slashes, and the flags. */
export interface RegexSource {
  /** The pattern, without slashes. */
  readonly pattern: string;
  /** The flags. */
  readonly flags: string;
}

/**
 * Checks whether a value is a {@link RegexSource}, such as an untyped command argument.
 *
 * @param value The value.
 *
 * @returns Whether the value has string `pattern` and `flags` properties.
 */
export function isRegexSource(value: unknown): value is RegexSource {
  const candidate = value as Partial<RegexSource> | undefined;
  return typeof candidate?.pattern === "string" && typeof candidate.flags === "string";
}

/** A pattern that can take super-linear time to reject some inputs (ReDoS). */
export interface BacktrackingWarning {
  /** The quantifier that backtracks, as pattern source. */
  readonly raw: string;
  /** Offset of `raw` in the pattern, inclusive. */
  readonly start: number;
  /** Offset of `raw` in the pattern, exclusive. */
  readonly end: number;
  /** Whether the backtracking is exponential rather than polynomial. */
  readonly exponential: boolean;
  /** A character that, repeated many times, triggers the backtracking. */
  readonly attackCharacter: string;
  /** What the problem is. May contain Markdown code spans. */
  readonly description: string;
  /** An equivalent regex without this problem, when one could be derived. */
  readonly fix?: RegexSource;
}

/** How long a match can be. */
export interface LengthSummary {
  /** The fewest characters a match consumes. */
  readonly min: number;
  /** The most characters a match consumes; `Infinity` when unbounded. */
  readonly max: number;
}

/** A successfully explained regex. */
export interface RegexExplanation extends RegexSource {
  /** Discriminates success from {@link RegexExplanationError}. */
  readonly ok: true;
  /** Top-level explanation steps, in match order. */
  readonly nodes: readonly ExplanationNode[];
  /** The meaning of each flag, in the order given. */
  readonly flagExplanations: readonly FlagExplanation[];
  /** How long a match can be. */
  readonly length: LengthSummary;
  /** Catastrophic backtracking problems; empty when none were found or the check was disabled. */
  readonly warnings: readonly BacktrackingWarning[];
  /**
   * Whether `^` and `$` match at line breaks anywhere in the pattern, through the `m` flag or a
   * group such as `(?m:...)`, so that text is matched as separate lines.
   */
  readonly multiline: boolean;
}

/** A regex that could not be parsed. */
export interface RegexExplanationError extends RegexSource {
  /** Discriminates failure from {@link RegexExplanation}. */
  readonly ok: false;
  /** The parser's error message. */
  readonly message: string;
  /** Offset into the pattern where the error was detected, if known. */
  readonly index?: number;
}

/** The result of {@link explainRegex}. */
export type ExplainResult = RegexExplanation | RegexExplanationError;

/** Options for {@link explainRegex}. */
export interface ExplainOptions {
  /** Check for catastrophic backtracking. Defaults to `true`. */
  readonly checkBacktracking?: boolean;
}

/** Flag letters mapped to their `RegExp` property and meaning. */
const FLAG_INFO: Readonly<Record<string, { name: string; description: string }>> = {
  d: { name: "hasIndices", description: "Record start and end indices for each capture group." },
  g: { name: "global", description: "Find all matches instead of stopping after the first." },
  i: { name: "ignoreCase", description: "Ignore case: letters match both upper and lower case." },
  m: {
    name: "multiline",
    description: `${code("^")} and ${code("$")} match at the start and end of each line, not just the whole input.`,
  },
  s: { name: "dotAll", description: `${code(".")} also matches line terminators.` },
  u: {
    name: "unicode",
    description: "Treat the pattern as a sequence of Unicode code points and use strict syntax.",
  },
  v: {
    name: "unicodeSets",
    description: `Unicode mode with set operations (${code("--")}, ${code("&&")}), nested classes, and string properties.`,
  },
  y: { name: "sticky", description: `Match only at the position given by ${code("lastIndex")}.` },
};

/** Friendly names for common Unicode properties and general categories. */
const UNICODE_PROPERTY_NAMES: Readonly<Record<string, string>> = {
  L: "letter",
  Letter: "letter",
  Lu: "uppercase letter",
  Uppercase_Letter: "uppercase letter",
  Ll: "lowercase letter",
  Lowercase_Letter: "lowercase letter",
  Lt: "titlecase letter",
  Lm: "modifier letter",
  Lo: "other letter",
  M: "mark",
  Mark: "mark",
  N: "number",
  Number: "number",
  Nd: "decimal digit",
  Decimal_Number: "decimal digit",
  P: "punctuation character",
  Punctuation: "punctuation character",
  S: "symbol",
  Symbol: "symbol",
  Sc: "currency symbol",
  Currency_Symbol: "currency symbol",
  Z: "separator",
  Separator: "separator",
  Zs: "space separator",
  Space_Separator: "space separator",
  C: "control or other character",
  Other: "control or other character",
  Cc: "control character",
  Control: "control character",
  Alphabetic: "alphabetic character",
  Alpha: "alphabetic character",
  White_Space: "whitespace character",
  space: "whitespace character",
  Emoji: "emoji character",
  ASCII: "ASCII character",
  Any: "character",
};

/** Property keys whose value names a script. */
const SCRIPT_KEYS = new Set(["Script", "sc", "Script_Extensions", "scx"]);

/** State that changes while walking the pattern; modifier groups can toggle flags locally. */
interface Context {
  /** The flags in effect at the current node. */
  readonly flags: ReadonlyFlags;
}

/** A source span with the same shape as an AST node. */
interface Span {
  /** The source text. */
  readonly raw: string;
  /** Start offset, inclusive. */
  readonly start: number;
  /** End offset, exclusive. */
  readonly end: number;
}

/**
 * Explains a regex pattern compiled with the given flags. Syntax errors are returned, not thrown.
 *
 * @param pattern The pattern without surrounding slashes, as passed to `new RegExp()`.
 * @param flags The flags, such as `"gi"`.
 * @param options Analysis options.
 *
 * @returns The explanation, or the reason the pattern is invalid.
 */
export function explainRegex(
  pattern: string,
  flags = "",
  options: ExplainOptions = {}
): ExplainResult {
  let flagsAst: AST.Flags;
  let patternAst: AST.Pattern;
  try {
    ({ flags: flagsAst, pattern: patternAst } = parseRegex({ pattern, flags }));
  } catch (error: unknown) {
    return {
      ok: false,
      pattern,
      flags,
      message: error instanceof Error ? error.message : String(error),
      index: error instanceof RegExpSyntaxError ? error.index : undefined,
    };
  }

  const ctx: Context = { flags: flagsAst };
  const length = getLengthRange(patternAst.alternatives, flagsAst);
  return {
    ok: true,
    pattern,
    flags,
    nodes: explainAlternatives(patternAst.alternatives, ctx),
    flagExplanations: [...flags].map((flag) => ({ flag, ...FLAG_INFO[flag] })),
    length: { min: length.min, max: length.max },
    warnings:
      options.checkBacktracking === false ? [] : findBacktracking(patternAst, flagsAst, pattern),
    multiline: flagsAst.multiline || enablesMultiline(patternAst),
  };
}

/**
 * Parses a regex with the ECMAScript version the library supports.
 *
 * @param source The regex.
 *
 * @returns The pattern's and flags' syntax trees.
 *
 * @throws {RegExpSyntaxError} If the pattern or flags are invalid.
 */
export function parseRegex(source: RegexSource): { pattern: AST.Pattern; flags: AST.Flags } {
  const parser = new RegExpParser({ ecmaVersion: 2025 });
  const flags = parser.parseFlags(source.flags);
  const pattern = parser.parsePattern(source.pattern, 0, source.pattern.length, {
    unicode: flags.unicode,
    unicodeSets: flags.unicodeSets,
  });
  return { pattern, flags };
}

/**
 * Checks whether a node, or any node inside it, is a group whose modifiers turn multiline on, as in
 * `(?m:^a$)`.
 *
 * @param node The node.
 *
 * @returns Whether `^` and `$` match at line breaks somewhere in the node.
 */
function enablesMultiline(node: AST.Node): boolean {
  if (node.type === "Group" && node.modifiers?.add.multiline) {
    return true;
  }
  const children: readonly AST.Node[] =
    "alternatives" in node
      ? node.alternatives
      : node.type === "Alternative"
        ? node.elements
        : node.type === "Quantifier"
          ? [node.element]
          : [];
  return children.some(enablesMultiline);
}

/**
 * Reads typed or selected text as a regex.
 *
 * @param text Either a literal such as `/ab+c/gi`, optionally surrounded by whitespace, or a bare
 *   pattern.
 *
 * @returns The regex; bare patterns have no flags. The pattern is not validated.
 */
export function parseRegexInput(text: string): RegexSource {
  const literal = /^\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\[])+)\/([a-z]*)$/s.exec(text.trim());
  return literal ? { pattern: literal[1], flags: literal[2] } : { pattern: text, flags: "" };
}

/**
 * Finds quantifiers that can backtrack catastrophically.
 *
 * @param pattern The parsed pattern.
 * @param flags The parsed flags.
 * @param source The pattern source, for slicing fixes.
 *
 * @returns One warning per problem found.
 */
function findBacktracking(
  pattern: AST.Pattern,
  flags: AST.Flags,
  source: string
): BacktrackingWarning[] {
  // Move reports flag ordinary patterns such as /a+b/ that are slow only on adversarial input
  // scanned at every offset; they are too common to be useful as warnings.
  const { reports } = analyse({ pattern, flags }, { reportTypes: { Move: false } });
  return reports.map((report) => toWarning(report, source));
}

/**
 * Words one backtracking report.
 *
 * @param report The scslre report.
 * @param source The pattern source.
 *
 * @returns The warning.
 */
function toWarning(report: Report, source: string): BacktrackingWarning {
  const quant = report.type === "Trade" ? report.startQuant : report.quant;
  const cost = `so a failed match can take ${report.exponential ? "exponential" : "polynomial"} time`;
  let description: string;
  switch (report.type) {
    case "Trade":
      description = `${code(report.startQuant.raw)} and ${code(report.endQuant.raw)} can match the same text, ${cost}`;
      break;
    case "Self":
      description = `${code(report.quant.raw)} is repeated by ${code(report.parentQuant.raw)} and can match the same text in many ways, ${cost}`;
      break;
    case "Move":
      // Disabled in findBacktracking; worded anyway so new options cannot produce blank warnings.
      description = `${code(report.quant.raw)} is retried at every position of a failing input, ${cost}`;
      break;
  }
  const fixed = report.fix();
  return {
    raw: source.slice(quant.start, quant.end),
    start: quant.start,
    end: quant.end,
    exponential: report.exponential,
    attackCharacter: report.character.pick,
    description,
    fix: fixed ? { pattern: fixed.source, flags: fixed.flags } : undefined,
  };
}

/**
 * Builds an explanation node.
 *
 * @param span The source the node explains.
 * @param description The explanation.
 * @param children Explanations of the parts of `span`.
 *
 * @returns The node.
 */
function make(span: Span, description: string, children: ExplanationNode[] = []): ExplanationNode {
  return { raw: span.raw, start: span.start, end: span.end, description, children };
}

/**
 * Returns a copy of a node with a prefix added to its description.
 *
 * @param prefix The text to add.
 * @param node The node.
 *
 * @returns The new node.
 */
function prefixed(prefix: string, node: ExplanationNode): ExplanationNode {
  return { ...node, description: prefix + node.description };
}

/**
 * Explains a list of alternatives, as found in the pattern, groups, and lookarounds.
 *
 * @param alternatives The alternatives, at least one.
 * @param ctx The walk context.
 *
 * @returns The steps of a single alternative, or one node that lists every alternative.
 */
function explainAlternatives(
  alternatives: readonly AST.Alternative[],
  ctx: Context
): ExplanationNode[] {
  if (alternatives.length === 1) {
    return explainSequence(alternatives[0], ctx);
  }
  const options = alternatives.map((alt, i) => {
    const steps = explainSequence(alt, ctx);
    // An option with a single step reads better without an extra level.
    if (steps.length === 1) {
      return make(alt, `Option ${i + 1}: ${lowerFirst(steps[0].description)}`, [
        ...steps[0].children,
      ]);
    }
    return make(alt, `Option ${i + 1}:`, steps);
  });
  const span: Span = {
    raw: alternatives.map((a) => a.raw).join("|"),
    start: alternatives[0].start,
    end: alternatives[alternatives.length - 1].end,
  };
  return [make(span, `Match one of ${alternatives.length} alternatives:`, options)];
}

/**
 * Explains the elements of one alternative, merging runs of literal characters.
 *
 * @param alt The alternative.
 * @param ctx The walk context.
 *
 * @returns One node per step.
 */
function explainSequence(alt: AST.Alternative, ctx: Context): ExplanationNode[] {
  if (alt.elements.length === 0) {
    return [make(alt, "Match the empty string")];
  }
  // Consecutive characters become one run, so that "abc" is one step rather than three. Steps are
  // sliced between their start offsets, because growing each run element by element is quadratic.
  const { elements } = alt;
  const starts = elements.flatMap((el, i) =>
    el.type === "Character" && i > 0 && elements[i - 1].type === "Character" ? [] : [i]
  );
  return starts.map((start, i) => {
    const step = elements.slice(start, starts[i + 1]);
    const run = step.filter((el): el is AST.Character => el.type === "Character");
    return run.length > 0 ? explainCharacterRun(run, ctx) : explainElement(step[0], ctx);
  });
}

/**
 * Returns " (case-insensitive)" when ignoring case changes what the elements match.
 *
 * @param elements The elements to check.
 * @param ctx The walk context.
 *
 * @returns The note, or an empty string.
 */
function caseNote(elements: readonly ToUnicodeSetElement[], ctx: Context): string {
  if (!ctx.flags.ignoreCase) {
    return "";
  }
  const sensitive = { ...ctx.flags, ignoreCase: false };
  const changes = elements.some(
    (el) => toUnicodeSet(el, ctx.flags).chars.size !== toUnicodeSet(el, sensitive).chars.size
  );
  return changes ? " (case-insensitive)" : "";
}

/**
 * Explains consecutive literal characters as one step.
 *
 * @param run The characters, at least one.
 * @param ctx The walk context.
 *
 * @returns The node.
 */
function explainCharacterRun(run: AST.Character[], ctx: Context): ExplanationNode {
  const note = caseNote(run, ctx);
  if (run.length === 1) {
    return make(run[0], `Match ${describeCodePoint(run[0].value)}${note}`);
  }
  const text = String.fromCodePoint(...run.map((c) => c.value));
  const span: Span = {
    raw: run.map((c) => c.raw).join(""),
    start: run[0].start,
    end: run[run.length - 1].end,
  };
  // Only call it text when every character is visible; otherwise name each one.
  if (/^[^\p{C}\s](?:[^\p{C}]*[^\p{C}\s])?$/u.test(text)) {
    return make(span, `Match the text ${code(text)}${note}`);
  }
  const names = run.map((c) => describeCodePoint(c.value)).join(", ");
  return make(span, `Match the sequence ${names}${note}`);
}

/**
 * Explains one element of an alternative.
 *
 * @param el The element.
 * @param ctx The walk context.
 *
 * @returns The node.
 */
function explainElement(el: AST.Element, ctx: Context): ExplanationNode {
  switch (el.type) {
    case "Assertion":
      return explainAssertion(el, ctx);
    case "Quantifier":
      return explainQuantifier(el, ctx);
    default:
      return explainQuantifiable(el, ctx);
  }
}

/**
 * Explains an element that a quantifier can repeat.
 *
 * @param el The element.
 * @param ctx The walk context.
 *
 * @returns The node.
 */
function explainQuantifiable(el: AST.QuantifiableElement, ctx: Context): ExplanationNode {
  switch (el.type) {
    case "Character":
      return explainCharacterRun([el], ctx);
    case "CapturingGroup": {
      const n = getCapturingGroupNumber(el);
      const label = el.name ? `Capture group #${n} named ${code(el.name)}` : `Capture group #${n}`;
      return make(el, `${label}:`, explainAlternatives(el.alternatives, ctx));
    }
    case "Group": {
      if (!el.modifiers) {
        return make(el, "Group (non-capturing):", explainAlternatives(el.alternatives, ctx));
      }
      const inner = applyModifiers(el.modifiers, ctx);
      const label = `Group with modifiers (${describeModifiers(el.modifiers)}):`;
      return make(el, label, explainAlternatives(el.alternatives, inner));
    }
    case "Backreference":
      return make(el, `Match the same text last captured by ${describeBackrefTarget(el)}`);
    case "Assertion":
      // Lookaheads are quantifiable in legacy (non-unicode) mode.
      return explainAssertion(el, ctx);
    case "CharacterClass":
    case "ExpressionCharacterClass":
      return explainClass(el, ctx, true);
    case "CharacterSet":
      return make(el, `Match ${describeCharacterSet(el, ctx)}${caseNote([el], ctx)}`);
  }
}

/**
 * Explains a quantifier by appending the repetition to its element's explanation.
 *
 * @param q The quantifier.
 * @param ctx The walk context.
 *
 * @returns The node.
 */
function explainQuantifier(q: AST.Quantifier, ctx: Context): ExplanationNode {
  const inner = explainQuantifiable(q.element, ctx);
  const greed =
    q.min === q.max ? "" : q.greedy ? " (as many as possible)" : " (as few as possible)";
  const repetition = `${describeCount(q.min, q.max)}${greed}`;
  if (inner.children.length === 0) {
    return make(q, `${inner.description}, ${repetition}`);
  }
  const heading = inner.description.replace(/:$/, "");
  return make(q, `${heading}, ${repetition}:`, [...inner.children]);
}

/**
 * Words a repetition count.
 *
 * @param min The minimum count.
 * @param max The maximum count; `Infinity` when unbounded.
 *
 * @returns A phrase such as "one or more times".
 */
export function describeCount(min: number, max: number): string {
  if (min === 0 && max === 1) {
    return "optionally";
  }
  if (max === Infinity) {
    return min === 0
      ? "zero or more times"
      : min === 1
        ? "one or more times"
        : `${min} or more times`;
  }
  if (min === max) {
    return min === 1 ? "exactly once" : `exactly ${min} times`;
  }
  return `between ${min} and ${max} times`;
}

/**
 * Explains an anchor, word boundary, or lookaround.
 *
 * @param a The assertion.
 * @param ctx The walk context.
 *
 * @returns The node.
 */
function explainAssertion(a: AST.Assertion, ctx: Context): ExplanationNode {
  const where = ctx.flags.multiline ? "a line" : "the input";
  switch (a.kind) {
    case "start":
      return make(a, `Assert position is at the start of ${where}`);
    case "end":
      return make(a, `Assert position is at the end of ${where}`);
    case "word":
      return make(a, `Assert position is ${a.negate ? "not " : ""}at a word boundary`);
    case "lookahead":
      return make(
        a,
        a.negate
          ? "Negative lookahead: assert that what follows does not match:"
          : "Lookahead: assert that what follows matches:",
        explainAlternatives(a.alternatives, ctx)
      );
    case "lookbehind":
      return make(
        a,
        a.negate
          ? "Negative lookbehind: assert that what precedes does not match:"
          : "Lookbehind: assert that what precedes matches:",
        explainAlternatives(a.alternatives, ctx)
      );
  }
}

/**
 * Names the group a backreference refers to.
 *
 * @param ref The backreference.
 *
 * @returns A phrase such as "group #1 (`name`)".
 */
function describeBackrefTarget(ref: AST.Backreference): string {
  if (ref.ambiguous) {
    const numbers = ref.resolved.map((g) => `#${getCapturingGroupNumber(g)}`).join(" or ");
    return `the group named ${code(ref.ref)} (${numbers})`;
  }
  const n = getCapturingGroupNumber(ref.resolved);
  return typeof ref.ref === "string" ? `group #${n} (${code(ref.ref)})` : `group #${n}`;
}

/**
 * Applies a group's inline modifiers, such as `(?i-m:...)`, to the context.
 *
 * @param m The modifiers.
 * @param ctx The enclosing context.
 *
 * @returns The context inside the group.
 */
function applyModifiers(m: AST.Modifiers, ctx: Context): Context {
  // A flag a group removes is off, one it adds is on, and the rest keep the enclosing value.
  const flag = (name: "ignoreCase" | "multiline" | "dotAll"): boolean | undefined =>
    m.remove?.[name] ? false : m.add?.[name] ? true : ctx.flags[name];
  return {
    flags: {
      ...ctx.flags,
      ignoreCase: flag("ignoreCase"),
      multiline: flag("multiline"),
      dotAll: flag("dotAll"),
    },
  };
}

/**
 * Words a group's inline modifiers.
 *
 * @param m The modifiers.
 *
 * @returns A phrase such as "enable ignore case; disable multiline".
 */
function describeModifiers(m: AST.Modifiers): string {
  const names = (f: AST.ModifierFlags | null): string[] =>
    f
      ? [
          f.ignoreCase ? "ignore case" : "",
          f.multiline ? "multiline" : "",
          f.dotAll ? "dotAll" : "",
        ].filter(Boolean)
      : [];
  const on = names(m.add);
  const off = names(m.remove);
  return [on.length ? `enable ${on.join(", ")}` : "", off.length ? `disable ${off.join(", ")}` : ""]
    .filter(Boolean)
    .join("; ");
}

/**
 * Explains a character class.
 *
 * @param cls The class.
 * @param ctx The walk context.
 * @param topLevel Whether the class is an element of an alternative, which adds the verb "Match".
 *
 * @returns The node.
 */
function explainClass(
  cls: AST.CharacterClass | AST.ExpressionCharacterClass,
  ctx: Context,
  topLevel: boolean
): ExplanationNode {
  const verb = topLevel ? "Match " : "";
  const note = topLevel ? caseNote([cls], ctx) : "";
  if (cls.type === "ExpressionCharacterClass") {
    const what = cls.negate ? "any character not in" : "a character in";
    return make(cls, `${verb}${what} the set${note}:`, [explainClassElement(cls.expression, ctx)]);
  }
  if (cls.elements.length === 0) {
    return make(
      cls,
      cls.negate ? `${verb}any character at all` : `${verb}nothing (an empty class never matches)`
    );
  }
  const what = cls.negate ? "any character except" : "one of";
  return make(
    cls,
    `${verb}${what}${note}:`,
    cls.elements.map((e) => explainClassElement(e, ctx))
  );
}

/** Anything that can appear inside a character class. */
type ClassElement = AST.CharacterClassElement | AST.ClassIntersection | AST.ClassSubtraction;

/**
 * Explains one member of a character class as a noun phrase.
 *
 * @param el The member.
 * @param ctx The walk context.
 *
 * @returns The node.
 */
function explainClassElement(el: ClassElement, ctx: Context): ExplanationNode {
  switch (el.type) {
    case "Character":
      return make(el, describeCodePoint(el.value));
    case "CharacterClassRange":
      return make(
        el,
        `a character from ${describeCodePoint(el.min.value)} to ${describeCodePoint(el.max.value)}`
      );
    case "CharacterSet":
      return make(el, describeCharacterSet(el, ctx));
    case "CharacterClass":
    case "ExpressionCharacterClass":
      return explainClass(el, ctx, false);
    case "ClassStringDisjunction": {
      const strings = el.alternatives.map((a) =>
        a.elements.length
          ? code(String.fromCodePoint(...a.elements.map((c) => c.value)))
          : "the empty string"
      );
      return make(
        el,
        strings.length === 1
          ? `the string ${strings[0]}`
          : `one of the strings ${strings.join(", ")}`
      );
    }
    case "ClassIntersection":
      return make(
        el,
        "characters that are in all of:",
        flattenOperands(el).map((o) => explainClassElement(o, ctx))
      );
    case "ClassSubtraction": {
      const [first, ...rest] = flattenOperands(el);
      return make(el, "characters that are:", [
        prefixed("in ", explainClassElement(first, ctx)),
        ...rest.map((o) => prefixed("but not ", explainClassElement(o, ctx))),
      ]);
    }
  }
}

/**
 * Flattens a left-nested set operation such as `(a&&b)&&c` into its operands.
 *
 * @param node The operation.
 *
 * @returns The operands, left to right.
 */
function flattenOperands(
  node: AST.ClassIntersection | AST.ClassSubtraction
): AST.ClassSetOperand[] {
  const left =
    node.left.type === node.type
      ? flattenOperands(node.left as AST.ClassIntersection | AST.ClassSubtraction)
      : [node.left as AST.ClassSetOperand];
  return [...left, node.right];
}

/**
 * Describes `.`, `\d`, `\s`, `\w`, or a Unicode property escape as a noun phrase.
 *
 * @param set The character set.
 * @param ctx The walk context.
 *
 * @returns The phrase.
 */
function describeCharacterSet(set: AST.CharacterSet, ctx: Context): string {
  switch (set.kind) {
    case "any":
      return ctx.flags.dotAll ? "any character" : "any character except a line break";
    case "digit":
      return set.negate ? "any character that is not a digit" : "a digit (0-9)";
    case "space":
      return set.negate
        ? "any character that is not whitespace"
        : "a whitespace character (space, tab, line break, etc.)";
    case "word":
      return set.negate
        ? "any character that is not a word character"
        : "a word character (letter, digit, or underscore)";
    case "property":
      return describeProperty(set);
  }
}

/**
 * Describes a Unicode property escape such as `\p{Lu}` as a noun phrase.
 *
 * @param set The property escape.
 *
 * @returns The phrase.
 */
function describeProperty(set: AST.UnicodePropertyCharacterSet): string {
  const raw = set.value ? `${set.key}=${set.value}` : set.key;
  if (set.strings) {
    return `a string with Unicode property ${code(raw)}`;
  }
  const name = set.value ?? set.key;
  const friendly =
    set.value && SCRIPT_KEYS.has(set.key)
      ? `character in the ${set.value.replace(/_/g, " ")} script`
      : (UNICODE_PROPERTY_NAMES[name] ?? `character with Unicode property ${code(raw)}`);
  return set.negate ? `any character that is not ${withArticle(friendly)}` : withArticle(friendly);
}

import { ExplainResult, ExplanationNode, RegexExplanation, RegexSource } from "./explainer";
import { code, splitCodeSpans, TextPart } from "./text";

/** Options for the {@link ExplanationRenderer} output methods. */
export interface RenderOptions {
  /** Start with a heading that shows the whole regex. Defaults to `false`. */
  readonly title?: boolean;
}

/** One step of an explanation, flattened out of the node tree. */
export interface ExplanationRow {
  /** The pattern source the step covers. */
  readonly raw: string;
  /** The step's description, which may contain Markdown code spans. */
  readonly description: string;
  /** How deeply the step is nested; top-level steps are 0. */
  readonly depth: number;
  /** The description split into plain text and code, for formats other than Markdown. */
  readonly parts: readonly TextPart[];
}

/** A backtracking warning, ready to display. */
export interface WarningModel {
  /** What the problem is, which may contain Markdown code spans. */
  readonly description: string;
  /** The description split into plain text and code. */
  readonly parts: readonly TextPart[];
  /** An equivalent pattern that does not backtrack, as `/pattern/flags`, if one exists. */
  readonly fix?: string;
}

/** A flag's explanation, ready to display. */
export interface FlagModel {
  /** The flag letter. */
  readonly flag: string;
  /** The flag's name, such as `ignoreCase`. */
  readonly name: string;
  /** What the flag does, which may contain Markdown code spans. */
  readonly description: string;
  /** The description split into plain text and code. */
  readonly parts: readonly TextPart[];
}

/** A syntax error, ready to display. */
export interface ErrorModel {
  /** The parser's message. */
  readonly message: string;
  /** The pattern. */
  readonly pattern: string;
  /** Offset of the error in the pattern, if known. */
  readonly index?: number;
  /** A line of spaces and a `^` that, printed under the pattern, points at the error. */
  readonly caret?: string;
}

/**
 * Everything an explanation view shows, in display order, with descriptions already split so that a
 * renderer only maps it to markup.
 */
export interface ExplanationModel {
  /** The regex as `/pattern/flags`. */
  readonly literal: string;
  /** The syntax error, for an invalid pattern; the other lists are then empty. */
  readonly error?: ErrorModel;
  /** Backtracking warnings. */
  readonly warnings: readonly WarningModel[];
  /** The steps, flattened with their depths. */
  readonly rows: readonly ExplanationRow[];
  /** How long a match can be, such as "Matches 3 to 7 characters.", for a valid pattern. */
  readonly length?: string;
  /** The flags' explanations. */
  readonly flags: readonly FlagModel[];
  /** Whether `^` and `$` match at line breaks anywhere in the pattern; false for an error. */
  readonly multiline: boolean;
}

/** Renders an `explainRegex` result in several output formats. */
export class ExplanationRenderer {
  private readonly result: ExplainResult;

  /**
   * Constructs a new ExplanationRenderer.
   *
   * @param result The result of `explainRegex`.
   */
  constructor(result: ExplainResult) {
    this.result = result;
  }

  /**
   * Collects everything an explanation view shows. Every output format renders from this model.
   *
   * @returns The model.
   */
  model(): ExplanationModel {
    const result = this.result;
    if (!result.ok) {
      return {
        literal: literal(result),
        error: {
          message: result.message,
          pattern: result.pattern,
          index: result.index,
          caret: result.index === undefined ? undefined : "^".padStart(result.index + 1),
        },
        warnings: [],
        rows: [],
        flags: [],
        multiline: false,
      };
    }
    return {
      literal: literal(result),
      multiline: result.multiline,
      warnings: result.warnings.map((warning) => ({
        ...described(warning.description),
        fix: warning.fix && literal(warning.fix),
      })),
      rows: flatten(result.nodes),
      length: describeLength(result),
      flags: result.flagExplanations.map((f) => ({
        flag: f.flag,
        name: f.name,
        ...described(f.description),
      })),
    };
  }

  /**
   * Renders the explanation as a nested Markdown list, suitable for hovers and documentation.
   *
   * @param options Rendering options.
   *
   * @returns The Markdown.
   */
  markdownList(options: RenderOptions = {}): string {
    return this.markdown(options, (rows) =>
      rows.map((row) => `${"  ".repeat(row.depth)}- ${code(row.raw)} ${row.description}`)
    );
  }

  /**
   * Renders the explanation as a Markdown table with a Code Point and an Explanation column. Nested
   * steps are indented with non-breaking spaces.
   *
   * @param options Rendering options.
   *
   * @returns The Markdown.
   */
  markdownTable(options: RenderOptions = {}): string {
    return this.markdown(options, (rows) => [
      "| Code Point | Explanation |",
      "| ---------- | ----------- |",
      ...rows.map(
        (row) =>
          `| ${"&nbsp;&nbsp;".repeat(row.depth)}${escapePipes(code(row.raw))} | ${escapePipes(row.description)} |`
      ),
    ]);
  }

  /**
   * Renders the explanation as indented plain text, for terminals and logs.
   *
   * @param options Rendering options.
   *
   * @returns The text.
   */
  text(options: RenderOptions = {}): string {
    const model = this.model();
    const title = options.title ? [model.literal, ""] : [];
    if (model.error) {
      const caret =
        model.error.caret === undefined
          ? []
          : [`  ${model.error.pattern}`, `  ${model.error.caret}`];
      return [...title, `Invalid regular expression: ${model.error.message}`, ...caret].join("\n");
    }

    const warnings = model.warnings.flatMap((warning) => [
      `Warning: ${plain(warning.parts)}.`,
      ...(warning.fix ? [`  Equivalent safe pattern: ${warning.fix}`] : []),
    ]);
    const width = Math.min(
      30,
      Math.max(...model.rows.map((row) => row.depth * 2 + row.raw.length))
    );
    const steps = model.rows.map(
      (row) => `${`${"  ".repeat(row.depth)}${row.raw}`.padEnd(width)}  ${plain(row.parts)}`
    );
    const flags =
      model.flags.length === 0
        ? []
        : ["", "Flags:", ...model.flags.map((f) => `  ${f.flag}  ${f.name}: ${plain(f.parts)}`)];
    return [
      ...title,
      ...warnings,
      ...(warnings.length > 0 ? [""] : []),
      ...steps,
      "",
      model.length ?? "",
      ...flags,
    ].join("\n");
  }

  /**
   * Renders the parts every Markdown format shares around its steps: the title, the error or the
   * warnings, the match length, and the flags.
   *
   * @param options Rendering options.
   * @param steps Formats the rows as Markdown lines.
   *
   * @returns The Markdown.
   */
  private markdown(
    options: RenderOptions,
    steps: (rows: readonly ExplanationRow[]) => string[]
  ): string {
    const model = this.model();
    const title = options.title ? ["# Regex explanation", "", code(model.literal), ""] : [];
    if (model.error) {
      const caret =
        model.error.caret === undefined
          ? []
          : ["", "```text", model.error.pattern, model.error.caret, "```"];
      const message = `**Invalid regular expression:** ${escapeMarkdown(model.error.message)}`;
      return [...title, message, ...caret].join("\n");
    }

    const warnings = model.warnings.flatMap((warning) => [
      `> **Warning:** ${warning.description}.`,
      ...(warning.fix ? [`> Equivalent safe pattern: ${code(warning.fix)}`] : []),
      "",
    ]);
    const flags =
      model.flags.length === 0
        ? []
        : [
            "",
            "**Flags**",
            "",
            ...model.flags.map((f) => `- ${code(f.flag)} *${f.name}*: ${f.description}`),
          ];
    return [...title, ...warnings, ...steps(model.rows), "", `*${model.length}*`, ...flags].join(
      "\n"
    );
  }
}

/**
 * Formats a regex as a literal.
 *
 * @param source The regex.
 *
 * @returns The pattern between slashes, followed by the flags, such as `/a+/g`.
 */
function literal(source: RegexSource): string {
  return `/${source.pattern}/${source.flags}`;
}

/**
 * Pairs a description with its parts.
 *
 * @param description A description that may contain Markdown code spans.
 *
 * @returns The description and its parts from {@link splitCodeSpans}.
 */
function described(description: string): { description: string; parts: TextPart[] } {
  return { description, parts: splitCodeSpans(description) };
}

/**
 * Flattens an explanation tree into rows, each followed by its descendants.
 *
 * @param nodes The sibling nodes.
 * @param depth The depth of `nodes`, where top-level nodes are 0.
 *
 * @returns One row per node, in display order, with its depth.
 */
function flatten(nodes: readonly ExplanationNode[], depth = 0): ExplanationRow[] {
  return nodes.flatMap((node) => [
    { raw: node.raw, depth, ...described(node.description) },
    ...flatten(node.children, depth + 1),
  ]);
}

/**
 * Joins description parts as plain text, with code in double quotes.
 *
 * @param parts The parts.
 *
 * @returns The text.
 */
function plain(parts: readonly TextPart[]): string {
  return parts.map((part) => (part.code ? `"${part.text}"` : part.text)).join("");
}

/**
 * Words how long a match can be.
 *
 * @param result A successful explanation.
 *
 * @returns A sentence such as "Matches 3 to 7 characters."
 */
function describeLength(result: RegexExplanation): string {
  const { min, max } = result.length;
  if (min === 0 && max === 0) {
    return "Matches the empty string only (zero characters).";
  }
  const unit = (n: number): string => (n === 1 ? "character" : "characters");
  if (max === Infinity) {
    return min === 0
      ? "Matches any number of characters, including none."
      : `Matches ${min} or more characters.`;
  }
  if (min === max) {
    return `Matches exactly ${min} ${unit(min)}.`;
  }
  return `Matches ${min} to ${max} characters.`;
}

/**
 * Escapes the pipes in a Markdown table cell, which GFM treats as cell boundaries even inside code
 * spans.
 *
 * @param text The cell text.
 *
 * @returns The escaped text.
 */
function escapePipes(text: string): string {
  return text.replaceAll("|", "\\|");
}

/**
 * Escapes Markdown punctuation in text that did not come from this library.
 *
 * @param text The text.
 *
 * @returns The escaped text.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");
}

import type { SyntaxTreeNode } from "./compiler";
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
  /**
   * Why the pattern is invalid, such as "Unterminated group", without the parser's "Invalid regular
   * expression" label and copy of the pattern, which views show on their own.
   */
  readonly message: string;
  /** The pattern. */
  readonly pattern: string;
  /** Offset of the error in the pattern, if known. */
  readonly index?: number;
  /** The line of the pattern that holds the error, when its offset is known. */
  readonly line?: string;
  /** A line of spaces and a `^` that, printed under {@link line}, points at the error. */
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
          message: errorReason(result.message, result.pattern),
          pattern: result.pattern,
          index: result.index,
          ...(result.index === undefined ? {} : errorLine(result.pattern, result.index)),
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
   * Renders the explanation as a Markdown table with a Pattern and an Explanation column. Nested
   * steps are indented with non-breaking spaces.
   *
   * @param options Rendering options.
   *
   * @returns The Markdown.
   */
  markdownTable(options: RenderOptions = {}): string {
    return this.markdown(options, (rows) => [
      "| Pattern | Explanation |",
      "| ------- | ----------- |",
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
        model.error.caret === undefined ? [] : [`  ${model.error.line}`, `  ${model.error.caret}`];
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
          : ["", "```text", model.error.line, model.error.caret, "```"];
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

/** Font size of the syntax tree diagram's labels, in pixels. */
const DIAGRAM_FONT_SIZE = 12;

/** Advance of one monospace character at {@link DIAGRAM_FONT_SIZE}, in pixels. */
const DIAGRAM_CHAR_WIDTH = 7.2;

/** Space between a node's label and its border, in pixels. */
const DIAGRAM_PADDING = 8;

/** Height of a node's box, which holds the node type over its source text, in pixels. */
const DIAGRAM_NODE_HEIGHT = 36;

/** Baselines of the node type and the source text, from the top of a node's box, in pixels. */
const DIAGRAM_BASELINES = { type: 14, text: 29 } as const;

/** Space between neighboring subtrees, in pixels. */
const DIAGRAM_SIBLING_GAP = 12;

/** Space between a node's box and its children's boxes, in pixels. */
const DIAGRAM_LEVEL_GAP = 28;

/** Space around the whole diagram, in pixels. */
const DIAGRAM_MARGIN = 4;

/** The most characters of a node's source text shown in its box; its tooltip has all of it. */
const DIAGRAM_MAX_LABEL = 24;

/** A node of the diagram with its box placed. */
interface PlacedNode {
  /** The syntax tree node. */
  readonly node: SyntaxTreeNode;
  /** The source text shown in the box, shortened to {@link DIAGRAM_MAX_LABEL} characters. */
  readonly label: string;
  /** Left edge of the box. */
  readonly x: number;
  /** Top edge of the box. */
  readonly y: number;
  /** Width of the box. */
  readonly width: number;
}

/** A line from a node's box to one of its children's boxes. */
interface DiagramEdge {
  /** The parent's bottom center. */
  readonly x1: number;
  /** The parent's bottom center. */
  readonly y1: number;
  /** The child's top center. */
  readonly x2: number;
  /** The child's top center. */
  readonly y2: number;
}

/** A laid-out subtree, with its left edge at 0. */
interface SubtreeLayout {
  /** Width of the subtree. */
  readonly width: number;
  /** Horizontal center of the subtree's root box. */
  readonly center: number;
  /** The root and its descendants, placed. */
  readonly nodes: readonly PlacedNode[];
  /** The lines between them. */
  readonly edges: readonly DiagramEdge[];
}

/**
 * Draws a pattern's syntax tree from `RegexFinder.syntaxTree` as an SVG image: a box per node, with
 * the node type over its source text, and each node centered over its children. Colors are
 * `currentColor`, so the image takes the color of the surrounding text, and its elements have
 * classes (`edge`, `node`, `error`, `type`, `text`) for styling. Each box has a `<title>` tooltip
 * with the node's full source text.
 *
 * @param tree The root node.
 *
 * @returns The `<svg>` element.
 */
export function syntaxTreeSvg(tree: SyntaxTreeNode): string {
  const layout = layoutSubtree(tree, 0);
  const width = layout.width + 2 * DIAGRAM_MARGIN;
  const height =
    Math.max(...layout.nodes.map((placed) => placed.y)) + DIAGRAM_NODE_HEIGHT + 2 * DIAGRAM_MARGIN;
  const edges = layout.edges.map(
    (e) =>
      `<line class="edge" x1="${num(e.x1)}" y1="${num(e.y1)}" x2="${num(e.x2)}" y2="${num(e.y2)}" stroke="currentColor"/>`
  );
  const nodes = layout.nodes.map((placed) => {
    const { node, label, x, y, width: boxWidth } = placed;
    const center = num(x + boxWidth / 2);
    const tooltip = node.text === "" ? node.type : `${node.type}: ${node.text}`;
    const text =
      label === ""
        ? ""
        : `<text class="text" x="${center}" y="${num(y + DIAGRAM_BASELINES.text)}" text-anchor="middle" fill="currentColor">${escapeXml(label)}</text>`;
    return (
      `<g class="node${node.error ? " error" : ""}"><title>${escapeXml(tooltip)}</title>` +
      `<rect x="${num(x)}" y="${num(y)}" width="${num(boxWidth)}" height="${DIAGRAM_NODE_HEIGHT}" rx="4" fill="none" stroke="currentColor"/>` +
      `<text class="type" x="${center}" y="${num(y + DIAGRAM_BASELINES.type)}" text-anchor="middle" fill="currentColor">${escapeXml(node.type)}</text>` +
      `${text}</g>`
    );
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="syntax-tree" width="${num(width)}" height="${num(height)}" ` +
      `viewBox="0 0 ${num(width)} ${num(height)}" font-family="monospace" font-size="${DIAGRAM_FONT_SIZE}" ` +
      `role="img" aria-label="${escapeXml(`Syntax tree of ${tree.text}`)}">`,
    `<g transform="translate(${DIAGRAM_MARGIN} ${DIAGRAM_MARGIN})">`,
    ...edges,
    ...nodes,
    "</g>",
    "</svg>",
  ].join("\n");
}

/**
 * Lays out a subtree with its children side by side under it, each subtree as wide as its widest
 * level so that subtrees never overlap.
 *
 * @param node The subtree's root.
 * @param depth The root's depth, where the tree's root is 0.
 *
 * @returns The layout, with its left edge at 0.
 */
function layoutSubtree(node: SyntaxTreeNode, depth: number): SubtreeLayout {
  const label = shorten(node.text);
  const boxWidth =
    Math.max(node.type.length, [...label].length) * DIAGRAM_CHAR_WIDTH + 2 * DIAGRAM_PADDING;
  const children = node.children.map((child) => layoutSubtree(child, depth + 1));
  const childrenWidth =
    children.reduce((sum, child) => sum + child.width, 0) +
    DIAGRAM_SIBLING_GAP * Math.max(0, children.length - 1);
  const width = Math.max(boxWidth, childrenWidth);
  const lefts = children.map(
    (_, i) =>
      (width - childrenWidth) / 2 +
      children.slice(0, i).reduce((sum, child) => sum + child.width + DIAGRAM_SIBLING_GAP, 0)
  );
  const placed = children.map((child, i) => shiftSubtree(child, lefts[i]));
  const first = placed.at(0);
  const last = placed.at(-1);
  // A parent narrower than its children sits over them, but never past the subtree's edges.
  const center =
    first && last
      ? Math.min(Math.max((first.center + last.center) / 2, boxWidth / 2), width - boxWidth / 2)
      : width / 2;
  const y = depth * (DIAGRAM_NODE_HEIGHT + DIAGRAM_LEVEL_GAP);
  return {
    width,
    center,
    nodes: [
      { node, label, x: center - boxWidth / 2, y, width: boxWidth },
      ...placed.flatMap((child) => child.nodes),
    ],
    edges: [
      ...placed.map((child) => ({
        x1: center,
        y1: y + DIAGRAM_NODE_HEIGHT,
        x2: child.center,
        y2: y + DIAGRAM_NODE_HEIGHT + DIAGRAM_LEVEL_GAP,
      })),
      ...placed.flatMap((child) => child.edges),
    ],
  };
}

/**
 * Moves a laid-out subtree to the right.
 *
 * @param layout The subtree.
 * @param dx The distance to move it, in pixels.
 *
 * @returns The moved subtree.
 */
function shiftSubtree(layout: SubtreeLayout, dx: number): SubtreeLayout {
  return {
    width: layout.width,
    center: layout.center + dx,
    nodes: layout.nodes.map((placed) => ({ ...placed, x: placed.x + dx })),
    edges: layout.edges.map((e) => ({ ...e, x1: e.x1 + dx, x2: e.x2 + dx })),
  };
}

/**
 * Shortens text to {@link DIAGRAM_MAX_LABEL} characters, counting code points.
 *
 * @param text The text.
 *
 * @returns The text, or its start followed by an ellipsis.
 */
function shorten(text: string): string {
  const chars = [...text];
  return chars.length > DIAGRAM_MAX_LABEL
    ? `${chars.slice(0, DIAGRAM_MAX_LABEL - 1).join("")}…`
    : text;
}

/**
 * Formats a coordinate with at most one decimal place.
 *
 * @param n The coordinate.
 *
 * @returns The number as SVG attribute text.
 */
function num(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * Escapes text for XML content and quoted attributes.
 *
 * @param text The text.
 *
 * @returns The escaped text.
 */
function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char
  );
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
 * Reduces a parser message, such as "Invalid regular expression: /a(/u: Unterminated group", to its
 * reason.
 *
 * @param message The message from `explainRegex`.
 * @param pattern The pattern, which the message may repeat between slashes before the reason.
 *
 * @returns The reason, or the message unchanged if it has another form.
 */
function errorReason(message: string, pattern: string): string {
  const label = "Invalid regular expression: ";
  const rest = message.startsWith(label) ? message.slice(label.length) : message;
  const source = `/${pattern}/`;
  return rest.startsWith(source) ? rest.slice(source.length).replace(/^[a-z]*: /, "") : rest;
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

/**
 * Finds the line of a pattern that holds an error, so that a long or multi-line pattern is not
 * printed whole and the caret lines up under the error.
 *
 * @param pattern The pattern.
 * @param index Offset of the error.
 *
 * @returns The line, without its line break, and a caret under the error's column.
 */
function errorLine(pattern: string, index: number): { line: string; caret: string } {
  const breaks = [...pattern.matchAll(/\r\n|[\n\r\u2028\u2029]/g)];
  const before = breaks.filter((b) => b.index + b[0].length <= index).at(-1);
  const start = before === undefined ? 0 : before.index + before[0].length;
  const end = breaks.find((b) => b.index >= index)?.index ?? pattern.length;
  return { line: pattern.slice(start, end), caret: "^".padStart(index - start + 1) };
}

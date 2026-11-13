/**
 * Describes a regex as a state machine: the transitions a match takes from state to state, nested
 * by the pattern's structure so that views can lay it out. Literal runs are one transition,
 * quantifiers repeat, and alternatives fork. Each part carries the explanation of the pattern
 * source it covers, from {@link explainRegex}.
 */
import { AST } from "@eslint-community/regexpp";
import { getCapturingGroupNumber } from "regexp-ast-analysis";
import { ExplanationNode, parseRegex, RegexExplanation } from "./explainer";
import { code, splitCodeSpans, TextPart } from "./text";

/** What a transition consumes or checks, for views that color transitions by kind. */
export type TransitionKind =
  /** Literal text, such as `abc`. */
  | "literal"
  /** One character from a set, such as `[a-z]`, `\d`, or `.`. */
  | "set"
  /** A position check that consumes nothing, such as `^`, `\b`, or `(?=x)`. */
  | "assertion"
  /** The text a capture group matched, such as `\1`. */
  | "backreference"
  /** Nothing, as in an empty alternative. */
  | "empty";

/** The explanation of a part of the machine. */
interface Described {
  /** What the part matches, which may contain Markdown code spans. */
  readonly description: string;
  /** The description split into plain text and code. */
  readonly parts: readonly TextPart[];
}

/** One step between two states. */
export interface MachineTransition extends Described {
  /** Discriminates the part. */
  readonly type: "transition";
  /** What the transition consumes or checks. */
  readonly kind: TransitionKind;
  /** The pattern source of the transition, such as `[a-z]`; empty for an empty transition. */
  readonly label: string;
  /** Offset of the label in the pattern, inclusive. */
  readonly start: number;
  /** Offset of the label in the pattern, exclusive. */
  readonly end: number;
}

/** Parts that follow each other, with a state between each two. */
export interface MachineSequence {
  /** Discriminates the part. */
  readonly type: "sequence";
  /** The parts, in match order; at least two. */
  readonly steps: readonly MachinePart[];
}

/** Alternatives that fork from one state and rejoin at another. */
export interface MachineChoice {
  /** Discriminates the part. */
  readonly type: "choice";
  /** The alternatives, in the order they are tried; at least two. */
  readonly options: readonly MachinePart[];
}

/** A part matched a number of times. */
export interface MachineRepeat extends Described {
  /** Discriminates the part. */
  readonly type: "repeat";
  /** The repeated part. */
  readonly body: MachinePart;
  /** The fewest repetitions. */
  readonly min: number;
  /** The most repetitions; `Infinity` when unbounded. */
  readonly max: number;
  /** Whether it repeats as many times as possible rather than as few. */
  readonly greedy: boolean;
}

/** A capture group, or a group that changes flags, around a part. */
export interface MachineGroup extends Described {
  /** Discriminates the part. */
  readonly type: "group";
  /** The group's name, such as `#1 year` or `flags i`. */
  readonly label: string;
  /** The part inside the group. */
  readonly body: MachinePart;
}

/** A part of a regex's state machine. */
export type MachinePart =
  MachineTransition | MachineSequence | MachineChoice | MachineRepeat | MachineGroup;

/** Explanations keyed by the source span they cover, as `start:end`. */
type Descriptions = ReadonlyMap<string, string>;

/**
 * Builds the state machine of a regex.
 *
 * @param explanation The regex's explanation from {@link explainRegex}.
 *
 * @returns The machine's outermost part. Non-capturing groups without flags leave no trace.
 */
export function stateMachine(explanation: RegexExplanation): MachinePart {
  const { pattern } = parseRegex(explanation);
  const descriptions = new Map(
    flatten(explanation.nodes).map((node) => [spanKey(node), node.description])
  );
  return fromAlternatives(pattern.alternatives, descriptions);
}

/**
 * Lists explanation nodes and their descendants, in pattern order.
 *
 * @param nodes The nodes.
 *
 * @returns Every node.
 */
function flatten(nodes: readonly ExplanationNode[]): ExplanationNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

/**
 * Keys a source span for {@link Descriptions}.
 *
 * @param span The span.
 *
 * @returns The key.
 */
function spanKey(span: { readonly start: number; readonly end: number }): string {
  return `${span.start}:${span.end}`;
}

/**
 * Finds the explanation of a span.
 *
 * @param span The span.
 * @param descriptions The explanations.
 * @param fallback The explanation to use when the span has none of its own, such as a quantifier's
 *   for the element it repeats.
 *
 * @returns The explanation and its parts.
 */
function describe(
  span: AST.Node | { readonly raw: string; readonly start: number; readonly end: number },
  descriptions: Descriptions,
  fallback?: string
): Described {
  const description = descriptions.get(spanKey(span)) ?? fallback ?? code(span.raw);
  return { description, parts: splitCodeSpans(description) };
}

/**
 * Builds the machine for a list of alternatives.
 *
 * @param alternatives The alternatives, at least one.
 * @param descriptions The explanations.
 * @param fallback The explanation for a single alternative without its own.
 *
 * @returns The single alternative's machine, or a choice between them.
 */
function fromAlternatives(
  alternatives: readonly AST.Alternative[],
  descriptions: Descriptions,
  fallback?: string
): MachinePart {
  if (alternatives.length === 1) {
    return fromSequence(alternatives[0], descriptions, fallback);
  }
  return {
    type: "choice",
    options: alternatives.map((alt) => fromSequence(alt, descriptions)),
  };
}

/**
 * Builds the machine for one alternative, merging runs of literal characters into one transition,
 * as the explanation does.
 *
 * @param alt The alternative.
 * @param descriptions The explanations.
 * @param fallback The explanation for a single step without its own.
 *
 * @returns The single step, or a sequence of steps.
 */
function fromSequence(
  alt: AST.Alternative,
  descriptions: Descriptions,
  fallback?: string
): MachinePart {
  const { elements } = alt;
  if (elements.length === 0) {
    return transition("empty", { raw: "", start: alt.start, end: alt.end }, descriptions, fallback);
  }
  const starts = elements.flatMap((el, i) =>
    el.type === "Character" && i > 0 && elements[i - 1].type === "Character" ? [] : [i]
  );
  const steps = starts.map((start, i) => {
    const step = elements.slice(start, starts[i + 1]);
    if (step[0].type !== "Character") {
      return fromElement(step[0], descriptions, starts.length === 1 ? fallback : undefined);
    }
    const span = {
      raw: step.map((el) => el.raw).join(""),
      start: step[0].start,
      end: step[step.length - 1].end,
    };
    return transition("literal", span, descriptions, starts.length === 1 ? fallback : undefined);
  });
  return steps.length === 1 ? steps[0] : { type: "sequence", steps };
}

/**
 * Builds the machine for one element of an alternative.
 *
 * @param el The element.
 * @param descriptions The explanations.
 * @param fallback The explanation to use when the element has none of its own.
 *
 * @returns The element's machine.
 */
function fromElement(el: AST.Element, descriptions: Descriptions, fallback?: string): MachinePart {
  switch (el.type) {
    case "Character":
      return transition("literal", el, descriptions, fallback);
    case "CharacterClass":
    case "ExpressionCharacterClass":
    case "CharacterSet":
      return transition("set", el, descriptions, fallback);
    case "Assertion":
      return transition("assertion", el, descriptions, fallback);
    case "Backreference":
      return transition("backreference", el, descriptions, fallback);
    case "Quantifier": {
      const described = describe(el, descriptions, fallback);
      return {
        type: "repeat",
        ...described,
        body: fromElement(el.element, descriptions, described.description),
        min: el.min,
        max: el.max,
        greedy: el.greedy,
      };
    }
    case "CapturingGroup": {
      const described = describe(el, descriptions, fallback);
      const n = getCapturingGroupNumber(el);
      return {
        type: "group",
        ...described,
        label: el.name ? `#${n} ${el.name}` : `#${n}`,
        body: fromAlternatives(el.alternatives, descriptions),
      };
    }
    case "Group": {
      if (!el.modifiers) {
        return fromAlternatives(el.alternatives, descriptions, fallback);
      }
      return {
        type: "group",
        ...describe(el, descriptions, fallback),
        label: `flags ${el.modifiers.raw}`,
        body: fromAlternatives(el.alternatives, descriptions),
      };
    }
  }
}

/**
 * Builds a transition.
 *
 * @param kind What the transition consumes or checks.
 * @param span The pattern source it covers.
 * @param descriptions The explanations.
 * @param fallback The explanation to use when the span has none of its own.
 *
 * @returns The transition.
 */
function transition(
  kind: TransitionKind,
  span: { readonly raw: string; readonly start: number; readonly end: number },
  descriptions: Descriptions,
  fallback?: string
): MachineTransition {
  return {
    type: "transition",
    kind,
    label: span.raw,
    start: span.start,
    end: span.end,
    ...describe(span, descriptions, fallback),
  };
}

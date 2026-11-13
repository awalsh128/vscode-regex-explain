/**
 * Lays out a regex's state machine, from the library's `stateMachine`, as an SVG diagram for the
 * explanation panel. States sit between steps on a horizontal axis; alternatives fork onto rows;
 * repeats loop back underneath and, when they can match nothing, have a dashed bypass above;
 * capture groups are boxed. The result is plain coordinates and path data that `panel.html`
 * renders, so no markup is built here. Like `panel.ts`, it does not import `vscode`.
 */
import type { MachinePart, MachineRepeat, TextPart, TransitionKind } from "regex-explain";

/** A state, drawn as a circle. */
export interface DiagramState {
  /** The center's x coordinate. */
  readonly cx: number;
  /** The center's y coordinate. */
  readonly cy: number;
  /** Whether matching starts here. */
  readonly start: boolean;
  /** Whether a match ends here. */
  readonly accept: boolean;
}

/** A connecting line without a label, such as a fork into an alternative. */
export interface DiagramLine {
  /** The SVG path data. */
  readonly d: string;
  /** Whether the line is a dashed, arrowed bypass that skips an optional part. */
  readonly dashed: boolean;
}

/** A labeled arrow between two states. */
export interface DiagramTransition {
  /** The ID of the transition's tooltip. */
  readonly id: string;
  /** The SVG path data. */
  readonly d: string;
  /** What the transition consumes or checks, which sets its color. */
  readonly kind: TransitionKind;
  /** The pattern source, shortened to fit. */
  readonly label: string;
  /** Where the label is centered. */
  readonly labelX: number;
  /** The label's baseline. */
  readonly labelY: number;
}

/** An arrow from the end of a repeated part back to its start. */
export interface DiagramLoop {
  /** The ID of the loop's tooltip. */
  readonly id: string;
  /** The SVG path data. */
  readonly d: string;
  /** How many times the part repeats, such as `×1+`. */
  readonly label: string;
  /** Where the label is centered. */
  readonly labelX: number;
  /** The label's baseline. */
  readonly labelY: number;
}

/** A box around a group. */
export interface DiagramBox {
  /** The ID of the box's tooltip. */
  readonly id: string;
  /** The left edge. */
  readonly x: number;
  /** The top edge. */
  readonly y: number;
  /** The width. */
  readonly width: number;
  /** The height. */
  readonly height: number;
  /** The group's name. */
  readonly label: string;
  /** Where the label starts. */
  readonly labelX: number;
  /** The label's baseline. */
  readonly labelY: number;
}

/** The explanation shown when a transition, loop, or box is hovered or focused. */
export interface DiagramTip {
  /** The ID the transition, loop, or box refers to. */
  readonly id: string;
  /** The explanation, split into plain text and code. */
  readonly parts: readonly TextPart[];
}

/** A laid-out diagram, in pixels. */
export interface DiagramView {
  /** The diagram's width. */
  readonly width: number;
  /** The diagram's height. */
  readonly height: number;
  /** The states, starting with the start state and ending with the accepting one. */
  readonly states: readonly DiagramState[];
  /** The unlabeled connecting lines. */
  readonly lines: readonly DiagramLine[];
  /** The transitions, in pattern order. */
  readonly transitions: readonly DiagramTransition[];
  /** The loops of repeated parts. */
  readonly loops: readonly DiagramLoop[];
  /** The boxes around groups. */
  readonly boxes: readonly DiagramBox[];
  /** The tooltips of the transitions, loops, and boxes, in that order. */
  readonly tips: readonly DiagramTip[];
}

/** Estimated width of one label character at the diagram's 12px monospace font. */
const CHAR_WIDTH = 7.2;
/** Labels longer than this many characters are shortened; the tooltip has the full text. */
const MAX_LABEL = 24;
/** Margin around the diagram. */
const MARGIN = 8;
/** Radius of a state's circle. */
const STATE_RADIUS = 6;
/** Space on each side of a transition's label. */
const LABEL_PADDING = 8;
/** The shortest transition. */
const MIN_TRANSITION = 32;
/** Distance from a transition's top to its line, leaving room for the label. */
const LABEL_RISE = 16;
/** Space under a transition's line. */
const LINE_DROP = 6;
/** Distance from the label's baseline to the line. */
const LABEL_GAP = 5;
/** Width of the curves that fork into and rejoin from alternatives. */
const FORK = 18;
/** Vertical space between alternatives. */
const OPTION_GAP = 6;
/** Space on each side of a repeated part, for its loop and bypass to curve in. */
const REPEAT_SIDE = 14;
/** Distance from a repeated part's bottom to its loop. */
const LOOP_DROP = 8;
/** Space under a loop for its label. */
const LOOP_LABEL = 14;
/** Space above an optional part for its bypass. */
const BYPASS_RISE = 12;
/** Space between a group's box and its contents. */
const BOX_PADDING = 6;
/** Space at the top of a group's box for its name. */
const BOX_LABEL = 14;

/** A part with the size it takes up, and the sizes of its children. */
interface Measured {
  /** The part. */
  readonly part: MachinePart;
  /** The width. */
  readonly width: number;
  /** The height. */
  readonly height: number;
  /** Distance from the top to the horizontal line that enters and leaves the part. */
  readonly axis: number;
  /** The measured children, in the order the part lists them. */
  readonly children: readonly Measured[];
}

/** One element of the diagram before tooltip IDs are assigned. */
type Item =
  | ({ readonly type: "state" } & DiagramState)
  | ({ readonly type: "line" } & DiagramLine)
  | ({ readonly type: "transition"; readonly parts: readonly TextPart[] } & Omit<
      DiagramTransition,
      "id"
    >)
  | ({ readonly type: "loop"; readonly parts: readonly TextPart[] } & Omit<DiagramLoop, "id">)
  | ({ readonly type: "box"; readonly parts: readonly TextPart[] } & Omit<DiagramBox, "id">);

/**
 * Lays out a state machine.
 *
 * @param machine The machine from the library's `stateMachine`.
 *
 * @returns The diagram.
 */
export function layoutMachine(machine: MachinePart): DiagramView {
  const root = measure(machine);
  const axis = MARGIN + root.axis;
  const x = MARGIN + 2 * STATE_RADIUS;
  const items: Item[] = [
    { type: "state", cx: MARGIN + STATE_RADIUS, cy: axis, start: true, accept: false },
    ...place(root, x, MARGIN),
    { type: "state", cx: x + root.width + STATE_RADIUS, cy: axis, start: false, accept: true },
  ];
  const of = <T extends Item["type"]>(type: T): Extract<Item, { type: T }>[] =>
    items.filter((item): item is Extract<Item, { type: T }> => item.type === type);
  const transitions = of("transition").map((t, i) => ({ ...t, id: `tip-t${i}` }));
  const loops = of("loop").map((loop, i) => ({ ...loop, id: `tip-l${i}` }));
  const boxes = of("box").map((box, i) => ({ ...box, id: `tip-b${i}` }));
  return {
    width: round(2 * MARGIN + 4 * STATE_RADIUS + root.width),
    height: round(2 * MARGIN + root.height),
    states: of("state").map(({ cx, cy, start, accept }) => ({ cx, cy, start, accept })),
    lines: of("line").map(({ d, dashed }) => ({ d, dashed })),
    transitions: transitions.map(({ id, d, kind, label, labelX, labelY }) => ({
      id,
      d,
      kind,
      label,
      labelX,
      labelY,
    })),
    loops: loops.map(({ id, d, label, labelX, labelY }) => ({ id, d, label, labelX, labelY })),
    boxes: boxes.map(({ id, x, y, width, height, label, labelX, labelY }) => ({
      id,
      x,
      y,
      width,
      height,
      label,
      labelX,
      labelY,
    })),
    tips: [...transitions, ...loops, ...boxes].map(({ id, parts }) => ({ id, parts })),
  };
}

/**
 * Measures a part and its children.
 *
 * @param part The part.
 *
 * @returns The part with its size.
 */
function measure(part: MachinePart): Measured {
  switch (part.type) {
    case "transition": {
      const width = Math.max(MIN_TRANSITION, textWidth(shorten(part.label)) + 2 * LABEL_PADDING);
      return { part, width, height: LABEL_RISE + LINE_DROP, axis: LABEL_RISE, children: [] };
    }
    case "sequence": {
      const children = part.steps.map(measure);
      const axis = largest(children.map((c) => c.axis));
      const below = largest(children.map((c) => c.height - c.axis));
      const width =
        children.reduce((sum, c) => sum + c.width, 0) + (children.length - 1) * 2 * STATE_RADIUS;
      return { part, width, height: axis + below, axis, children };
    }
    case "choice": {
      const children = part.options.map(measure);
      const height =
        children.reduce((sum, c) => sum + c.height, 0) + (children.length - 1) * OPTION_GAP;
      const width = largest(children.map((c) => c.width)) + 2 * FORK;
      return { part, width, height, axis: height / 2, children };
    }
    case "repeat": {
      const body = measure(part.body);
      const label = loopLabel(part);
      const inner = Math.max(body.width, label === undefined ? 0 : textWidth(label));
      const above = part.min === 0 ? BYPASS_RISE : 0;
      const below = label === undefined ? 0 : LOOP_DROP + LOOP_LABEL;
      return {
        part,
        width: inner + 2 * REPEAT_SIDE,
        height: above + body.height + below,
        axis: above + body.axis,
        children: [body],
      };
    }
    case "group": {
      const body = measure(part.body);
      const inner = Math.max(body.width, textWidth(part.label));
      return {
        part,
        width: inner + 2 * BOX_PADDING,
        height: BOX_LABEL + body.height + BOX_PADDING,
        axis: BOX_LABEL + body.axis,
        children: [body],
      };
    }
  }
}

/**
 * Places a measured part.
 *
 * @param m The measured part.
 * @param x Its left edge.
 * @param top Its top edge.
 *
 * @returns The diagram items that draw it.
 */
function place(m: Measured, x: number, top: number): Item[] {
  const { part } = m;
  const axis = top + m.axis;
  switch (part.type) {
    case "transition":
      return [
        {
          type: "transition",
          d: `M${round(x)} ${round(axis)}H${round(x + m.width)}`,
          kind: part.kind,
          label: shorten(part.kind === "empty" ? "ε" : part.label),
          labelX: round(x + m.width / 2),
          labelY: round(axis - LABEL_GAP),
          parts: part.parts,
        },
      ];
    case "sequence": {
      const lefts = offsets(
        x,
        m.children.map((c) => c.width + 2 * STATE_RADIUS)
      );
      return m.children.flatMap((child, i) => [
        ...place(child, lefts[i], axis - child.axis),
        ...(i === m.children.length - 1
          ? []
          : [
              {
                type: "state" as const,
                cx: round(lefts[i] + child.width + STATE_RADIUS),
                cy: round(axis),
                start: false,
                accept: false,
              },
            ]),
      ]);
    }
    case "choice": {
      const tops = offsets(
        top,
        m.children.map((c) => c.height + OPTION_GAP)
      );
      const right = x + m.width;
      return m.children.flatMap((option, i) => {
        const y = tops[i] + option.axis;
        const end = x + FORK + option.width;
        return [
          line(curve(x, axis, x + FORK, y)),
          ...place(option, x + FORK, tops[i]),
          ...(end < right - FORK
            ? [line(`M${round(end)} ${round(y)}H${round(right - FORK)}`)]
            : []),
          line(curve(right - FORK, y, right, axis)),
        ];
      });
    }
    case "repeat": {
      const [body] = m.children;
      const bodyTop = top + (part.min === 0 ? BYPASS_RISE : 0);
      const left = x + REPEAT_SIDE + (m.width - 2 * REPEAT_SIDE - body.width) / 2;
      const right = left + body.width;
      const label = loopLabel(part);
      const loopY = bodyTop + body.height + LOOP_DROP;
      return [
        line(`M${round(x)} ${round(axis)}H${round(left)}`),
        ...place(body, left, bodyTop),
        line(`M${round(right)} ${round(axis)}H${round(x + m.width)}`),
        ...(part.min === 0 ? [bypass(x, x + m.width, axis, top + BYPASS_RISE / 3)] : []),
        ...(label === undefined
          ? []
          : [
              {
                type: "loop" as const,
                d:
                  `M${round(right)} ${round(axis)}` +
                  `C${round(right + REPEAT_SIDE)} ${round(axis)} ${round(right + REPEAT_SIDE)} ` +
                  `${round(loopY)} ${round(right)} ${round(loopY)}H${round(left)}` +
                  `C${round(left - REPEAT_SIDE)} ${round(loopY)} ${round(left - REPEAT_SIDE)} ` +
                  `${round(axis)} ${round(left)} ${round(axis)}`,
                label,
                labelX: round((left + right) / 2),
                labelY: round(loopY + LOOP_LABEL - 2),
                parts: part.parts,
              },
            ]),
      ];
    }
    case "group": {
      const [body] = m.children;
      const left = x + BOX_PADDING;
      return [
        {
          type: "box",
          x: round(x),
          y: round(top),
          width: round(m.width),
          height: round(m.height),
          label: part.label,
          labelX: round(left),
          labelY: round(top + BOX_LABEL - 3),
          parts: part.parts,
        },
        line(`M${round(x)} ${round(axis)}H${round(left)}`),
        ...place(body, left, top + BOX_LABEL),
        line(`M${round(left + body.width)} ${round(axis)}H${round(x + m.width)}`),
      ];
    }
  }
}

/**
 * Words how many times a part repeats, for its loop.
 *
 * @param repeat The repeated part.
 *
 * @returns A label such as `×1+` or `×2–5 lazy`, or undefined when the part matches at most once
 *   and so has no loop.
 */
function loopLabel(repeat: MachineRepeat): string | undefined {
  if (repeat.max <= 1) {
    return undefined;
  }
  const count =
    repeat.max === Infinity
      ? `${repeat.min}+`
      : repeat.min === repeat.max
        ? `${repeat.min}`
        : `${repeat.min}–${repeat.max}`;
  return `×${count}${repeat.greedy ? "" : " lazy"}`;
}

/**
 * Makes an unlabeled line.
 *
 * @param d The SVG path data.
 *
 * @returns The item.
 */
function line(d: string): Item {
  return { type: "line", d, dashed: false };
}

/**
 * Makes the dashed bypass over an optional part.
 *
 * @param left Where the part starts.
 * @param right Where the part ends.
 * @param axis The part's line.
 * @param y The bypass's height.
 *
 * @returns The item.
 */
function bypass(left: number, right: number, axis: number, y: number): Item {
  const bend = REPEAT_SIDE / 2;
  return {
    type: "line",
    d:
      `M${round(left)} ${round(axis)}C${round(left + bend)} ${round(axis)} ${round(left + bend)} ` +
      `${round(y)} ${round(left + REPEAT_SIDE)} ${round(y)}H${round(right - REPEAT_SIDE)}` +
      `C${round(right - bend)} ${round(y)} ${round(right - bend)} ${round(axis)} ${round(right)} ` +
      `${round(axis)}`,
    dashed: true,
  };
}

/**
 * Makes an S-shaped curve between two points, for forks and joins.
 *
 * @param x1 The start's x coordinate.
 * @param y1 The start's y coordinate.
 * @param x2 The end's x coordinate.
 * @param y2 The end's y coordinate.
 *
 * @returns The SVG path data.
 */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mid = round((x1 + x2) / 2);
  return (
    `M${round(x1)} ${round(y1)}C${mid} ${round(y1)} ${mid} ${round(y2)} ` +
    `${round(x2)} ${round(y2)}`
  );
}

/**
 * Finds the largest of some numbers without spreading them into arguments, which overflows the
 * stack for patterns with very many steps.
 *
 * @param values The numbers, at least one.
 *
 * @returns The largest.
 */
function largest(values: readonly number[]): number {
  return values.reduce((max, value) => Math.max(max, value), -Infinity);
}

/**
 * Computes where each of a run of parts starts, in one pass.
 *
 * @param first Where the first part starts.
 * @param sizes How far each part moves the next one along.
 *
 * @returns The starting positions, one per part.
 */
function offsets(first: number, sizes: readonly number[]): number[] {
  const starts: number[] = [];
  let next = first;
  for (const size of sizes) {
    starts.push(next);
    next += size;
  }
  return starts;
}

/**
 * Shortens a label that would make its transition too wide.
 *
 * @param label The label.
 *
 * @returns The label, cut with an ellipsis if it has more than {@link MAX_LABEL} characters.
 */
function shorten(label: string): string {
  const chars = [...label];
  return chars.length > MAX_LABEL ? `${chars.slice(0, MAX_LABEL - 1).join("")}…` : label;
}

/**
 * Estimates the width of a label.
 *
 * @param label The label.
 *
 * @returns The width in pixels.
 */
function textWidth(label: string): number {
  return [...label].length * CHAR_WIDTH;
}

/**
 * Rounds a coordinate to one decimal place, to keep the markup short.
 *
 * @param n The coordinate.
 *
 * @returns The rounded coordinate.
 */
function round(n: number): number {
  return Math.round(n * 10) / 10;
}

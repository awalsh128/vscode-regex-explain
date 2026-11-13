import { expect } from "chai";
import { describe, it } from "mocha";
import { MachinePart, MachineTransition, stateMachine } from "../machine";
import { explainValid } from "./testing";

/**
 * Flattens a state machine into lines indented by depth, so a whole machine can be compared with
 * one readable literal.
 *
 * @param part The machine.
 * @param depth The nesting depth.
 *
 * @returns One line per part, in pattern order.
 */
function outline(part: MachinePart, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  switch (part.type) {
    case "transition":
      return [`${indent}${part.kind} ${part.label}`];
    case "sequence":
      return [`${indent}sequence`, ...part.steps.flatMap((step) => outline(step, depth + 1))];
    case "choice":
      return [`${indent}choice`, ...part.options.flatMap((option) => outline(option, depth + 1))];
    case "repeat":
      return [
        `${indent}repeat ${part.min}..${part.max}${part.greedy ? "" : " lazy"}`,
        ...outline(part.body, depth + 1),
      ];
    case "group":
      return [`${indent}group ${part.label}`, ...outline(part.body, depth + 1)];
  }
}

/**
 * Finds the first transition in a machine, in pattern order.
 *
 * @param part The machine.
 *
 * @returns The transition.
 */
function firstTransition(part: MachinePart): MachineTransition {
  switch (part.type) {
    case "transition":
      return part;
    case "sequence":
      return firstTransition(part.steps[0]);
    case "choice":
      return firstTransition(part.options[0]);
    default:
      return firstTransition(part.body);
  }
}

describe("stateMachine", () => {
  [
    { pattern: "abc", expected: ["literal abc"] },
    { pattern: "", expected: ["empty "] },
    { pattern: "a|b|", expected: ["choice", "  literal a", "  literal b", "  empty "] },
    {
      pattern: "^\\d+?$",
      expected: [
        "sequence",
        "  assertion ^",
        "  repeat 1..Infinity lazy",
        "    set \\d",
        "  assertion $",
      ],
    },
    {
      pattern: "(?<y>\\d{4})-(?:ab)\\k<y>",
      expected: [
        "sequence",
        "  group #1 y",
        "    repeat 4..4",
        "      set \\d",
        "  literal -",
        "  literal ab",
        "  backreference \\k<y>",
      ],
    },
    {
      pattern: "[a-z]|(?=x).",
      expected: ["choice", "  set [a-z]", "  sequence", "    assertion (?=x)", "    set ."],
    },
    { pattern: "(?i-m:a)", expected: ["group flags i-m", "  literal a"] },
    {
      pattern: "(?:a|b)?",
      expected: ["repeat 0..1", "  choice", "    literal a", "    literal b"],
    },
  ].forEach(({ pattern, expected }) => {
    it(`should build the machine for /${pattern}/`, () => {
      // Act
      const machine = stateMachine(explainValid(pattern));

      // Assert
      expect(outline(machine)).to.deep.equal(expected);
    });
  });

  [
    { pattern: "ab|c", expected: "Option 1: match the text `ab`" },
    { pattern: "x\\d+", expected: "Match the character `x`" },
    { pattern: "\\d+", expected: "Match a digit (0-9), one or more times (as many as possible)" },
    { pattern: "(a)", expected: "Match the character `a`" },
  ].forEach(({ pattern, expected }) => {
    it(`should describe the first transition of /${pattern}/ with its explanation`, () => {
      // Act
      const transition = firstTransition(stateMachine(explainValid(pattern)));

      // Assert
      expect(transition.description).to.equal(expected);
    });
  });

  it("should describe repeats and groups with their explanations", () => {
    // Act
    const machine = stateMachine(explainValid("(a)+"));

    // Assert
    expect(machine.type === "repeat" && machine.description).to.equal(
      "Capture group #1, one or more times (as many as possible):"
    );
  });

  it("should split descriptions into text parts", () => {
    // Act
    const transition = firstTransition(stateMachine(explainValid("ab")));

    // Assert
    expect(transition.parts).to.deep.equal([
      { text: "Match the text ", code: false },
      { text: "ab", code: true },
    ]);
  });
});

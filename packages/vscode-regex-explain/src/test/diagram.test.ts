import { expect } from "chai";
import { describe, it } from "mocha";
import { explainRegex, RegexExplanation, stateMachine } from "regex-explain";
import { DiagramView, layoutMachine } from "../webview/diagram";

/**
 * Lays out the state machine of a valid pattern.
 *
 * @param pattern The pattern.
 *
 * @returns The diagram.
 */
function diagram(pattern: string): DiagramView {
  const result = explainRegex(pattern, "", { checkBacktracking: false }) as RegexExplanation;
  return layoutMachine(stateMachine(result));
}

describe("layoutMachine", () => {
  it("should draw one transition between a start and an accepting state", () => {
    // Act
    const view = diagram("a");

    // Assert
    expect(view).to.deep.equal({
      width: 72,
      height: 38,
      states: [
        { cx: 14, cy: 24, start: true, accept: false },
        { cx: 58, cy: 24, start: false, accept: true },
      ],
      lines: [],
      transitions: [
        {
          id: "tip-t0",
          d: "M20 24H52",
          kind: "literal",
          label: "a",
          labelX: 36,
          labelY: 19,
        },
      ],
      loops: [],
      boxes: [],
      tips: [
        {
          id: "tip-t0",
          parts: [
            { text: "Match the character ", code: false },
            { text: "a", code: true },
          ],
        },
      ],
    });
  });

  it("should put a state between the steps of a sequence", () => {
    // Act
    const view = diagram("^a$");

    // Assert
    expect(view.states.map((state) => state.cx)).to.deep.equal([14, 58, 102, 146]);
    expect(view.transitions.map((t) => t.kind)).to.deep.equal([
      "assertion",
      "literal",
      "assertion",
    ]);
  });

  it("should fork alternatives onto separate rows", () => {
    // Act
    const view = diagram("a|b");

    // Assert
    const [first, second] = view.transitions;
    expect(second.labelY - first.labelY).to.equal(28);
    expect(view.lines).to.have.length(4);
  });

  [
    { pattern: "a+", expected: ["×1+"] },
    { pattern: "a{2,5}?", expected: ["×2–5 lazy"] },
    { pattern: "a{3}", expected: ["×3"] },
    { pattern: "a?", expected: [] },
  ].forEach(({ pattern, expected }) => {
    it(`should label the loop of /${pattern}/ ${JSON.stringify(expected)}`, () => {
      // Act
      const view = diagram(pattern);

      // Assert
      expect(view.loops.map((loop) => loop.label)).to.deep.equal(expected);
    });
  });

  [
    { pattern: "a*", expected: true },
    { pattern: "a+", expected: false },
  ].forEach(({ pattern, expected }) => {
    it(`should ${expected ? "" : "not "}draw a bypass for /${pattern}/`, () => {
      // Act
      const view = diagram(pattern);

      // Assert
      expect(view.lines.some((line) => line.dashed)).to.equal(expected);
    });
  });

  it("should box capture groups with their name", () => {
    // Act
    const view = diagram("(?<year>\\d{4})");

    // Assert
    expect(view.boxes.map((box) => box.label)).to.deep.equal(["#1 year"]);
  });

  it("should shorten long labels", () => {
    // Act
    const view = diagram("abcdefghijklmnopqrstuvwxyz");

    // Assert
    expect(view.transitions[0].label).to.equal("abcdefghijklmnopqrstuvw…");
  });

  it("should lay out a pattern with very many steps in linear time", () => {
    // Arrange
    const pattern = "\\d".repeat(50_000);

    // Act
    const view = diagram(pattern);

    // Assert
    expect(view.transitions).to.have.length(50_000);
  });

  it("should give every tooltip its own ID", () => {
    // Act
    const view = diagram("(a)+|b?");

    // Assert
    const ids = view.tips.map((tip) => tip.id);
    expect(ids).to.deep.equal(["tip-t0", "tip-t1", "tip-l0", "tip-b0"]);
  });
});

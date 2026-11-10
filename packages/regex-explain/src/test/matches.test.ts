import { expect } from "chai";
import { describe, it } from "mocha";
import { describeMatches, findMatches, MatchResponse } from "../matches";

/** A limit high enough that it does not affect the test. */
const NO_LIMIT = 1000;

describe("findMatches", () => {
  it("should report each match with its offsets, lines, and groups", () => {
    // Arrange
    const text = "id=1\nnone\nid=22";

    // Act
    const response = findMatches({ pattern: "id=(\\d+)", flags: "", text, limit: NO_LIMIT });

    // Assert
    expect(response).to.deep.equal({
      matches: [
        { start: 0, end: 4, text: "id=1", startLine: 1, endLine: 1, groups: ["1"], named: {} },
        { start: 10, end: 15, text: "id=22", startLine: 3, endLine: 3, groups: ["22"], named: {} },
      ],
      truncated: false,
    });
  });

  it("should report the lines a multi-line match spans", () => {
    // Arrange
    const text = "a\r\nb\nc";

    // Act
    const { matches } = findMatches({ pattern: "b\\nc", flags: "", text, limit: NO_LIMIT });

    // Assert
    expect(matches.map((m) => [m.startLine, m.endLine])).to.deep.equal([[2, 3]]);
  });

  it("should end a match that stops at a line break on the line it started", () => {
    // Arrange
    const text = "ab\ncd";

    // Act
    const { matches } = findMatches({ pattern: "b\\n", flags: "", text, limit: NO_LIMIT });

    // Assert
    expect(matches.map((m) => [m.startLine, m.endLine])).to.deep.equal([[1, 1]]);
  });

  it("should report named groups by name and unmatched groups as undefined", () => {
    // Act
    const { matches } = findMatches({
      pattern: "(?<key>a)|(b)",
      flags: "",
      text: "a",
      limit: NO_LIMIT,
    });

    // Assert
    expect(matches[0].groups).to.deep.equal(["a", undefined]);
    expect(matches[0].named).to.deep.equal({ key: "a" });
  });

  it("should report empty matches once at each position", () => {
    // Act
    const { matches } = findMatches({ pattern: "x*", flags: "", text: "ab", limit: NO_LIMIT });

    // Assert
    expect(matches.map((m) => m.start)).to.deep.equal([0, 1, 2]);
  });

  it("should stop at the limit and say so", () => {
    // Act
    const response = findMatches({ pattern: "a", flags: "", text: "aaa", limit: 2 });

    // Assert
    expect(response.matches).to.have.length(2);
    expect(response.truncated).to.equal(true);
  });

  [
    { flags: "", expected: 2 },
    { flags: "g", expected: 2 },
    { flags: "i", expected: 3 },
    { flags: "y", expected: 2 },
  ].forEach(({ flags, expected }) => {
    it(`should find ${expected} matches of /a/${flags} in "aaxA"`, () => {
      // Act
      const { matches } = findMatches({ pattern: "a", flags, text: "aaxA", limit: NO_LIMIT });

      // Assert
      expect(matches).to.have.length(expected);
    });
  });

  it("should report a regex that does not compile", () => {
    // Act
    const response = findMatches({ pattern: "(", flags: "", text: "a", limit: NO_LIMIT });

    // Assert
    expect(response.matches).to.deep.equal([]);
    expect(response.error).to.match(/Unterminated group/);
  });
});

describe("describeMatches", () => {
  /** A response with no matches, to which a test adds what it needs. */
  const EMPTY: MatchResponse = { matches: [], truncated: false };

  [
    { name: "no matches", response: EMPTY, summary: "No matches.", problem: false },
    {
      name: "one match",
      response: findMatches({ pattern: "a", flags: "", text: "a", limit: NO_LIMIT }),
      summary: "1 match.",
      problem: false,
    },
    {
      name: "several matches",
      response: findMatches({ pattern: "a", flags: "", text: "aa", limit: NO_LIMIT }),
      summary: "2 matches.",
      problem: false,
    },
    {
      name: "matches stopped at the limit",
      response: findMatches({ pattern: "a", flags: "", text: "aaa", limit: 2 }),
      summary: "2 matches (showing the first 2).",
      problem: false,
    },
    {
      name: "a syntax error",
      response: findMatches({ pattern: "(", flags: "", text: "", limit: NO_LIMIT }),
      summary: "The regex cannot run: Invalid regular expression: /(/g: Unterminated group",
      problem: true,
    },
    {
      name: "a timeout",
      response: { ...EMPTY, timedOut: true },
      summary: "Matching timed out: the pattern backtracks too much on this text.",
      problem: true,
    },
  ].forEach(({ name, response, summary, problem }) => {
    it(`should summarize ${name}`, () => {
      // Act
      const model = describeMatches(response);

      // Assert
      expect({ summary: model.summary, problem: model.problem }).to.deep.equal({
        summary,
        problem,
      });
    });
  });

  it("should label lines, empty matches, and groups", () => {
    // Arrange
    const response = findMatches({
      pattern: "(?<key>a)(b)?|$",
      flags: "m",
      text: "a\nab",
      limit: NO_LIMIT,
    });

    // Act
    const [single, empty, second] = describeMatches(response).matches;

    // Assert
    expect(single.lines).to.equal("L1");
    expect(single.groups).to.deep.equal([
      { name: "$1", value: "a", matched: true },
      { name: "$2", value: "(no match)", matched: false },
      { name: "key", value: "a", matched: true },
    ]);
    expect(second.text).to.equal("ab");
    expect(empty.text).to.equal("(empty)");
  });

  it("should label a match across lines with its first and last", () => {
    // Arrange
    const response = findMatches({ pattern: "a\\nb", flags: "", text: "a\nb", limit: NO_LIMIT });

    // Act
    const [match] = describeMatches(response).matches;

    // Assert
    expect(match.lines).to.equal("L1–2");
  });
});

describe("findMatches with entries", () => {
  it("should match each line on its own, with offsets in the whole text", () => {
    // Act
    const response = findMatches({
      pattern: "^\\w+$",
      flags: "",
      text: "ab\ncd e\r\nfg",
      limit: NO_LIMIT,
      entries: true,
    });

    // Assert
    expect(response.matches.map((m) => [m.text, m.start, m.startLine])).to.deep.equal([
      ["ab", 0, 1],
      ["fg", 9, 3],
    ]);
    expect(response.entries).to.deep.equal([
      { line: 1, start: 0, end: 2, text: "ab" },
      { line: 2, start: 3, end: 7, text: "cd e" },
      { line: 3, start: 9, end: 11, text: "fg" },
    ]);
  });

  [
    { name: "empty text", text: "", expected: [] },
    { name: "a final line break", text: "a\n", expected: ["a"] },
    { name: "an empty line in the middle", text: "a\n\nb", expected: ["a", "", "b"] },
  ].forEach(({ name, text, expected }) => {
    it(`should split ${name} into entries`, () => {
      // Act
      const response = findMatches({
        pattern: "x",
        flags: "",
        text,
        limit: NO_LIMIT,
        entries: true,
      });

      // Assert
      expect(response.entries?.map((entry) => entry.text)).to.deep.equal(expected);
    });
  });

  it("should leave out entries after the limit", () => {
    // Act
    const response = findMatches({
      pattern: "a",
      flags: "",
      text: "a\na\na",
      limit: 2,
      entries: true,
    });

    // Assert
    expect(response.truncated).to.equal(true);
    expect(response.entries?.map((entry) => entry.line)).to.deep.equal([1, 2]);
  });
});

describe("describeMatches with entries", () => {
  it("should group matches by entry and count the entries that match", () => {
    // Arrange
    const response = findMatches({
      pattern: "a",
      flags: "",
      text: "aa\nb\n\na",
      limit: NO_LIMIT,
      entries: true,
    });

    // Act
    const model = describeMatches(response);

    // Assert
    expect(model.summary).to.equal("2 of 4 entries match.");
    expect(
      model.entries?.map((entry) => [entry.line, entry.text, entry.matched, entry.matches.length])
    ).to.deep.equal([
      ["L1", "aa", true, 2],
      ["L2", "b", false, 0],
      ["L3", "(empty)", false, 0],
      ["L4", "a", true, 1],
    ]);
  });

  [
    { text: "", summary: "No entries." },
    { text: "a", summary: "1 of 1 entry matches." },
  ].forEach(({ text, summary }) => {
    it(`should summarize ${JSON.stringify(text)} as "${summary}"`, () => {
      // Act
      const model = describeMatches(
        findMatches({ pattern: "a", flags: "", text, limit: NO_LIMIT, entries: true })
      );

      // Assert
      expect(model.summary).to.equal(summary);
    });
  });

  it("should leave out entries when the request had none", () => {
    // Act
    const model = describeMatches(
      findMatches({ pattern: "a", flags: "", text: "a", limit: NO_LIMIT })
    );

    // Assert
    expect(model).to.not.have.property("entries");
  });
});

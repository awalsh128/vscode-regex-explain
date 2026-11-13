import { expect } from "chai";
import { readFileSync } from "fs";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as path from "path";
import type { MatchesModel, MatchModel } from "regex-explain";
import * as sinon from "sinon";
import type { MatchMessage } from "../protocol";
import { lineNumbers, MatchRequests, ResultsView, selectMatch, showResults } from "../results";

/** The panel's page template, whose `<template>` elements the results are built from. */
const PAGE = readFileSync(path.join(__dirname, "..", "panel.html"), "utf8");

/** A match of `a` at offset 1 on the first line, with one unmatched named group. */
const MATCH: MatchModel = {
  start: 1,
  end: 2,
  text: "a",
  lines: "L1",
  groups: [{ name: "#1 x", value: "(not matched)", matched: false }],
};

/**
 * Opens the panel's page in a fresh window.
 *
 * @returns The page and the elements that show results.
 */
function openPage(): { document: Document; view: ResultsView } {
  const document = new Window().document as unknown as Document;
  document.write(PAGE);
  const find = <T extends Element>(selector: string): T => document.querySelector(selector) as T;
  return {
    document,
    view: {
      summary: find(".summary"),
      table: find(".result-table"),
      rows: find(".result-rows"),
    },
  };
}

/**
 * Lists each result row's cells as text.
 *
 * @param view The results.
 *
 * @returns One array of cell texts per row.
 */
function cells(view: ResultsView): string[][] {
  return [...view.rows.querySelectorAll("tr")].map((row) =>
    [...row.querySelectorAll("td")].map((cell) => cell.textContent?.replace(/\s+/g, " ").trim())
  ) as string[][];
}

describe("lineNumbers", () => {
  [
    { text: "", expected: "1" },
    { text: "a\nb", expected: "1\n2" },
    { text: "a\r\nb\rc\n", expected: "1\n2\n3\n4" },
  ].forEach(({ text, expected }) => {
    it(`should number ${JSON.stringify(text)} as ${JSON.stringify(expected)}`, () => {
      // Act & Assert
      expect(lineNumbers(text)).to.equal(expected);
    });
  });
});

describe("MatchRequests", () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it("should send only the last input once it stops changing", () => {
    // Arrange
    const sent: MatchMessage[] = [];
    const requests = new MatchRequests((message) => sent.push(message), 150);

    // Act
    requests.request("a", false);
    clock.tick(100);
    requests.request("ab", true);
    clock.tick(149);
    const early = sent.length;
    clock.tick(1);

    // Assert
    expect(early).to.equal(0);
    expect(sent).to.deep.equal([{ type: "match", id: 1, text: "ab", entries: true }]);
  });

  it("should treat only the reply to the last request sent as current", () => {
    // Arrange
    const requests = new MatchRequests(() => {}, 150);
    requests.request("a", false);
    clock.tick(150);
    requests.request("b", false);
    clock.tick(150);

    // Act
    const current = [1, 2].map((id) => requests.isCurrent(id));

    // Assert
    expect(current).to.deep.equal([false, true]);
  });
});

describe("showResults", () => {
  it("should list each match with its line and groups", () => {
    // Arrange
    const { view } = openPage();
    const model: MatchesModel = { summary: "1 match.", problem: false, matches: [MATCH] };

    // Act
    showResults(model, view);

    // Assert
    expect(view.summary.textContent).to.equal("1 match.");
    expect(view.table.hidden).to.equal(false);
    expect(view.table.classList.contains("entries")).to.equal(false);
    expect(cells(view)).to.deep.equal([["L1", "", "a #1 x (not matched)"]]);
    const button = view.rows.querySelector("button.match") as HTMLButtonElement;
    expect({ ...button.dataset }).to.deep.equal({ start: "1", end: "2" });
    expect(view.rows.querySelector("dd")?.classList.contains("unmatched")).to.equal(true);
  });

  it("should list every entry, with No match for those the regex misses", () => {
    // Arrange
    const { view } = openPage();
    const model: MatchesModel = {
      summary: "1 of 2 entries matches.",
      problem: false,
      matches: [MATCH],
      entries: [
        { line: "L1", start: 0, end: 2, text: "ba", matched: true, matches: [MATCH] },
        { line: "L2", start: 3, end: 4, text: "c", matched: false, matches: [] },
      ],
    };

    // Act
    showResults(model, view);

    // Assert
    expect(view.table.classList.contains("entries")).to.equal(true);
    expect(cells(view)).to.deep.equal([
      ["L1", "ba", "a #1 x (not matched)"],
      ["L2", "c", "No match"],
    ]);
    const unmatched = [...view.rows.querySelectorAll("tr")].map((row) =>
      row.classList.contains("unmatched")
    );
    expect(unmatched).to.deep.equal([false, true]);
  });

  it("should hide the table and flag the summary for a problem", () => {
    // Arrange
    const { view } = openPage();
    showResults({ summary: "1 match.", problem: false, matches: [MATCH] }, view);

    // Act
    showResults({ summary: "Timed out.", problem: true, matches: [] }, view);

    // Assert
    expect(view.rows.children).to.have.length(0);
    expect(view.table.hidden).to.equal(true);
    expect(view.summary.classList.contains("problem")).to.equal(true);
  });
});

describe("selectMatch", () => {
  it("should select the clicked match in the input", () => {
    // Arrange
    const { document, view } = openPage();
    showResults({ summary: "1 match.", problem: false, matches: [MATCH] }, view);
    const textarea = document.createElement("textarea");
    textarea.value = "bab";
    document.body.append(textarea);
    const text = view.rows.querySelector(".match .text") as HTMLElement;

    // Act
    selectMatch({ target: text } as unknown as MouseEvent, textarea);

    // Assert
    expect([textarea.selectionStart, textarea.selectionEnd]).to.deep.equal([1, 2]);
  });

  it("should ignore clicks outside a match", () => {
    // Arrange
    const { document, view } = openPage();
    const textarea = document.createElement("textarea");
    textarea.value = "bab";
    document.body.append(textarea);

    // Act
    selectMatch({ target: view.summary } as unknown as MouseEvent, textarea);

    // Assert
    expect([textarea.selectionStart, textarea.selectionEnd]).to.deep.equal([3, 3]);
  });
});

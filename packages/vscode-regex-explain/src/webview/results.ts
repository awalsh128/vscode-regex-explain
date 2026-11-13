/**
 * The explanation panel's match results, without the page wiring in `main.ts`: numbering the
 * input's lines, asking for matches once typing pauses and ignoring superseded replies, building
 * the results table from the page's `<template>` elements, and selecting a clicked match. It runs
 * in the webview, and works on the elements it is given, so it is tested with happy-dom.
 */
import type { EntryModel, MatchesModel, MatchModel } from "regex-explain";
import type { MatchMessage } from "./protocol";

/** The elements that show the results. */
export interface ResultsView {
  /** The one-sentence outcome. */
  readonly summary: HTMLElement;
  /** The results table's container, hidden when there are no rows. */
  readonly table: HTMLElement;
  /** The results table's body. */
  readonly rows: HTMLTableSectionElement;
}

/**
 * Numbers the lines of the input for the gutter.
 *
 * @param text The input.
 *
 * @returns One number per line, separated by line breaks.
 */
export function lineNumbers(text: string): string {
  const lines = text.split(/\r\n|\r|\n/).length;
  return Array.from({ length: lines }, (_, i) => String(i + 1)).join("\n");
}

/** Asks for matches once the input stops changing, and tells current replies from stale ones. */
export class MatchRequests {
  private readonly post: (message: MatchMessage) => void;
  private readonly delayMs: number;
  private latest = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Constructs a new MatchRequests.
   *
   * @param post Sends a request to the extension.
   * @param delayMs How long the input must stay unchanged before a request is sent.
   */
  constructor(post: (message: MatchMessage) => void, delayMs: number) {
    this.post = post;
    this.delayMs = delayMs;
  }

  /**
   * Requests matches for the input after the delay, replacing a request still waiting.
   *
   * @param text The input.
   * @param entries Whether each line is matched as a separate entry.
   */
  request(text: string, entries: boolean): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.latest += 1;
      this.post({ type: "match", id: this.latest, text, entries });
    }, this.delayMs);
  }

  /**
   * Checks whether a reply answers the last request sent.
   *
   * @param id The reply's request ID.
   *
   * @returns Whether no later request has been sent.
   */
  isCurrent(id: number): boolean {
    return id === this.latest;
  }
}

/**
 * Shows the results as a table: one row per match, or one row per entry with its matches.
 *
 * @param model The extension's reply, already worded.
 * @param view Where to show it.
 */
export function showResults(model: MatchesModel, view: ResultsView): void {
  const document = view.rows.ownerDocument;
  const rows = model.entries
    ? model.entries.map((entry) => entryRow(document, entry))
    : model.matches.map((match) => matchRow(document, match));
  view.rows.replaceChildren(...rows);
  view.table.hidden = rows.length === 0;
  view.table.classList.toggle("entries", model.entries !== undefined);
  view.summary.classList.toggle("problem", model.problem);
  view.summary.textContent = model.summary;
}

/**
 * Selects a clicked match in the input and scrolls it into view.
 *
 * @param event The click on the results table.
 * @param textarea The input's text area.
 */
export function selectMatch(event: MouseEvent, textarea: HTMLTextAreaElement): void {
  const button = (event.target as Element).closest<HTMLButtonElement>("button.match");
  if (!button) {
    return;
  }
  const start = Number(button.dataset.start);
  const end = Number(button.dataset.end);
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const line = textarea.value.slice(0, start).split(/\r\n|\r|\n/).length - 1;
  const view = textarea.ownerDocument.defaultView as Window;
  const lineHeight = parseFloat(view.getComputedStyle(textarea).lineHeight);
  textarea.scrollTop = Math.max(0, (line - 2) * lineHeight);
}

/**
 * Builds the row for one match of the whole input.
 *
 * @param document The page.
 * @param match The match.
 *
 * @returns The row.
 */
function matchRow(document: Document, match: MatchModel): HTMLTableRowElement {
  return resultRow(document, match.lines, "", [matchItem(document, match)]);
}

/**
 * Builds the row for one entry: its line, its text, and its matches or "No match".
 *
 * @param document The page.
 * @param entry The entry.
 *
 * @returns The row, marked `unmatched` when the regex did not match the entry.
 */
function entryRow(document: Document, entry: EntryModel): HTMLTableRowElement {
  const noMatch = Object.assign(document.createElement("span"), {
    className: "no-match",
    textContent: "No match",
  });
  const row = resultRow(
    document,
    entry.line,
    entry.text,
    entry.matched ? entry.matches.map((match) => matchItem(document, match)) : [noMatch]
  );
  row.classList.toggle("unmatched", !entry.matched);
  return row;
}

/**
 * Builds a row from the page's `result-row` template.
 *
 * @param document The page.
 * @param line The line label.
 * @param entry The entry's text; the column is hidden outside entry mode.
 * @param content The match column's content.
 *
 * @returns The row.
 */
function resultRow(
  document: Document,
  line: string,
  entry: string,
  content: readonly Node[]
): HTMLTableRowElement {
  const row = cloneTemplate(document, "result-row").querySelector("tr") as HTMLTableRowElement;
  (row.querySelector(".line-col") as HTMLElement).textContent = line;
  (row.querySelector(".entry") as HTMLElement).textContent = entry;
  (row.querySelector(".match-col") as HTMLElement).append(...content);
  return row;
}

/**
 * Builds one match from the page's `match-item` and `match-group` templates: its text, which
 * selects it in the input, and its groups.
 *
 * @param document The page.
 * @param match The match.
 *
 * @returns The match's element.
 */
function matchItem(document: Document, match: MatchModel): HTMLElement {
  const item = cloneTemplate(document, "match-item").querySelector(".match-item") as HTMLElement;
  const button = item.querySelector(".match") as HTMLButtonElement;
  button.dataset.start = String(match.start);
  button.dataset.end = String(match.end);
  (item.querySelector(".text") as HTMLElement).textContent = match.text;

  const groups = match.groups.map(({ name, value, matched }) => {
    const group = cloneTemplate(document, "match-group");
    (group.querySelector("dt") as HTMLElement).textContent = name;
    const definition = group.querySelector("dd") as HTMLElement;
    definition.textContent = value;
    definition.classList.toggle("unmatched", !matched);
    return group;
  });
  const details = item.querySelector(".groups") as HTMLDListElement;
  details.append(...groups);
  details.hidden = groups.length === 0;
  return item;
}

/**
 * Copies the contents of one of the page's `<template>` elements.
 *
 * @param document The page.
 * @param id The template's ID.
 *
 * @returns The copy, not yet in the document.
 */
function cloneTemplate(document: Document, id: string): DocumentFragment {
  const template = document.getElementById(id) as HTMLTemplateElement;
  return template.content.cloneNode(true) as DocumentFragment;
}

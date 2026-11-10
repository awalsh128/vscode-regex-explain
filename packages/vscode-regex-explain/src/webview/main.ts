/**
 * The explanation panel's script, which runs in the webview. It keeps the line-number gutter in
 * step with the input, asks the extension to match the input as it changes, either as one text or
 * line by line as separate entries, and shows the results in a table.
 */
import "@vscode-elements/elements/dist/vscode-checkbox/index.js";
import "@vscode-elements/elements/dist/vscode-split-layout/index.js";
import "@vscode-elements/elements/dist/vscode-table/index.js";
import "@vscode-elements/elements/dist/vscode-table-body/index.js";
import "@vscode-elements/elements/dist/vscode-table-cell/index.js";
import "@vscode-elements/elements/dist/vscode-table-header/index.js";
import "@vscode-elements/elements/dist/vscode-table-header-cell/index.js";
import "@vscode-elements/elements/dist/vscode-table-row/index.js";
import "@vscode-elements/elements/dist/vscode-textarea/index.js";
import type { VscodeCheckbox } from "@vscode-elements/elements/dist/vscode-checkbox/vscode-checkbox.js";
import type { VscodeSplitLayout } from "@vscode-elements/elements/dist/vscode-split-layout/vscode-split-layout.js";
import type { VscodeTextarea } from "@vscode-elements/elements/dist/vscode-textarea/vscode-textarea.js";
import type { EntryModel, MatchesModel, MatchModel } from "regex-explain";
import type { MatchesMessage, MatchMessage } from "./protocol";

/** The webview API, available once per page. */
declare function acquireVsCodeApi(): {
  postMessage(message: MatchMessage): void;
  getState(): Partial<PanelState> | undefined;
  setState(state: PanelState): void;
};

/** What the panel remembers while it is hidden or its regex changes. */
interface PanelState {
  /** The text in the input pane. */
  readonly text: string;
  /** Whether each line of the input is matched as a separate entry. */
  readonly entries: boolean;
}

/** The page elements the script drives. */
interface PanelElements {
  /** The split between the input and the results. */
  readonly layout: VscodeSplitLayout;
  /** The text to match. */
  readonly input: VscodeTextarea;
  /** Whether each line is matched as a separate entry. */
  readonly toggle: VscodeCheckbox;
  /** The input's line numbers. */
  readonly gutter: HTMLElement;
  /** The one-sentence outcome. */
  readonly summary: HTMLElement;
  /** The results table's container. */
  readonly table: HTMLElement;
  /** The results table's body. */
  readonly rows: HTMLTableSectionElement;
  /** The multiline note, present only when the regex uses multiline mode. */
  readonly note: HTMLElement | null;
}

/** Wait after typing stops before matching, in milliseconds. */
const DEBOUNCE_MS = 150;

/** Below this width, in pixels, the input and results panes stack. */
const STACK_BELOW_PX = 600;

/** Line height of the input and gutter, which must agree for the numbers to line up. */
const LINE_HEIGHT = "1.5em";

const vscode = acquireVsCodeApi();
const elements = findElements();
let latest = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

if (elements) {
  const { layout, input, toggle, gutter, summary, table, rows } = elements;
  void Promise.all([
    customElements.whenDefined("vscode-textarea"),
    customElements.whenDefined("vscode-checkbox"),
  ]).then(async () => {
    await input.updateComplete;
    const textarea = input.wrappedElement;
    // Lines must not wrap, or the gutter's numbers would drift from the lines they label.
    textarea.wrap = "off";
    textarea.style.lineHeight = LINE_HEIGHT;
    gutter.style.lineHeight = LINE_HEIGHT;
    textarea.addEventListener("scroll", () => {
      gutter.scrollTop = textarea.scrollTop;
    });
    input.addEventListener("input", () => onChange(elements));
    toggle.addEventListener("change", () => onChange(elements));
    rows.addEventListener("click", (event) => selectMatch(event, textarea));

    const state = vscode.getState();
    input.value = state?.text ?? "";
    toggle.checked = state?.entries ?? false;
    onChange(elements);
  });
  new ResizeObserver(([entry]) => {
    layout.split = entry.contentRect.width < STACK_BELOW_PX ? "horizontal" : "vertical";
  }).observe(document.body);
  window.addEventListener("message", (event: MessageEvent<MatchesMessage>) => {
    if (event.data.type === "matches" && event.data.id === latest) {
      showResults(event.data.model, summary, table, rows);
      // The link carries the input text, so that regex101 opens with the same test.
      document
        .querySelector<HTMLAnchorElement>(".regex101")
        ?.setAttribute("href", event.data.regex101Url);
    }
  });
}

/**
 * Finds the page elements the script drives.
 *
 * @returns The elements, or undefined if the page lacks any that are required.
 */
function findElements(): PanelElements | undefined {
  const find = <T extends Element>(selector: string): T | null =>
    document.querySelector<T>(selector);
  const layout = find<VscodeSplitLayout>(".input-layout");
  const input = find<VscodeTextarea>(".input");
  const toggle = find<VscodeCheckbox>(".entries-toggle");
  const gutter = find<HTMLElement>(".gutter");
  const summary = find<HTMLElement>(".summary");
  const table = find<HTMLElement>(".result-table");
  const rows = find<HTMLTableSectionElement>(".result-rows");
  const note = find<HTMLElement>(".multiline-note");
  return layout && input && toggle && gutter && summary && table && rows
    ? { layout, input, toggle, gutter, summary, table, rows, note }
    : undefined;
}

/**
 * Updates the gutter, the multiline note, and the saved state, then asks for matches once typing
 * pauses.
 *
 * @param panel The page elements.
 */
function onChange(panel: PanelElements): void {
  const text = panel.input.value;
  const entries = panel.toggle.checked;
  const lines = text.split(/\r\n|\r|\n/).length;
  panel.gutter.textContent = Array.from({ length: lines }, (_, i) => String(i + 1)).join("\n");
  // Each entry is matched on its own, so multiline mode changes nothing there.
  if (panel.note) {
    panel.note.hidden = entries;
  }
  vscode.setState({ text, entries });
  clearTimeout(timer);
  timer = setTimeout(() => {
    latest += 1;
    vscode.postMessage({ type: "match", id: latest, text, entries });
  }, DEBOUNCE_MS);
}

/**
 * Shows the results as a table: one row per match, or one row per entry with its matches.
 *
 * @param model The extension's reply, already worded.
 * @param summaryElement Where to summarize the outcome.
 * @param tableElement The table's container, hidden when there are no rows.
 * @param rowsElement The table body.
 */
function showResults(
  model: MatchesModel,
  summaryElement: HTMLElement,
  tableElement: HTMLElement,
  rowsElement: HTMLTableSectionElement
): void {
  const rows = model.entries ? model.entries.map(entryRow) : model.matches.map(matchRow);
  rowsElement.replaceChildren(...rows);
  tableElement.hidden = rows.length === 0;
  tableElement.classList.toggle("entries", model.entries !== undefined);
  summaryElement.classList.toggle("problem", model.problem);
  summaryElement.textContent = model.summary;
}

/**
 * Builds the row for one match of the whole input.
 *
 * @param match The match.
 *
 * @returns The row.
 */
function matchRow(match: MatchModel): HTMLTableRowElement {
  return resultRow(match.lines, "", [matchItem(match)]);
}

/**
 * Builds the row for one entry: its line, its text, and its matches or "No match".
 *
 * @param entry The entry.
 *
 * @returns The row, marked `unmatched` when the regex did not match the entry.
 */
function entryRow(entry: EntryModel): HTMLTableRowElement {
  const noMatch = Object.assign(document.createElement("span"), {
    className: "no-match",
    textContent: "No match",
  });
  const row = resultRow(
    entry.line,
    entry.text,
    entry.matched ? entry.matches.map(matchItem) : [noMatch]
  );
  row.classList.toggle("unmatched", !entry.matched);
  return row;
}

/**
 * Builds a row from the page's `result-row` template.
 *
 * @param line The line label.
 * @param entry The entry's text; the column is hidden outside entry mode.
 * @param content The match column's content.
 *
 * @returns The row.
 */
function resultRow(line: string, entry: string, content: readonly Node[]): HTMLTableRowElement {
  const row = cloneTemplate("result-row").querySelector("tr") as HTMLTableRowElement;
  (row.querySelector(".line-col") as HTMLElement).textContent = line;
  (row.querySelector(".entry") as HTMLElement).textContent = entry;
  (row.querySelector(".match-col") as HTMLElement).append(...content);
  return row;
}

/**
 * Builds one match from the page's `match-item` and `match-group` templates: its text, which
 * selects it in the input, and its groups.
 *
 * @param match The match.
 *
 * @returns The match's element.
 */
function matchItem(match: MatchModel): HTMLElement {
  const item = cloneTemplate("match-item").querySelector(".match-item") as HTMLElement;
  const button = item.querySelector(".match") as HTMLButtonElement;
  button.dataset.start = String(match.start);
  button.dataset.end = String(match.end);
  (item.querySelector(".text") as HTMLElement).textContent = match.text;

  const groups = match.groups.map(({ name, value, matched }) => {
    const group = cloneTemplate("match-group");
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
 * @param id The template's ID.
 *
 * @returns The copy, not yet in the document.
 */
function cloneTemplate(id: string): DocumentFragment {
  const template = document.getElementById(id) as HTMLTemplateElement;
  return template.content.cloneNode(true) as DocumentFragment;
}

/**
 * Selects a clicked match in the input and scrolls it into view.
 *
 * @param event The click on the results table.
 * @param textarea The input's text area.
 */
function selectMatch(event: MouseEvent, textarea: HTMLTextAreaElement): void {
  const button = (event.target as Element).closest<HTMLButtonElement>("button.match");
  if (!button) {
    return;
  }
  const start = Number(button.dataset.start);
  const end = Number(button.dataset.end);
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const line = textarea.value.slice(0, start).split(/\r\n|\r|\n/).length - 1;
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
  textarea.scrollTop = Math.max(0, (line - 2) * lineHeight);
}

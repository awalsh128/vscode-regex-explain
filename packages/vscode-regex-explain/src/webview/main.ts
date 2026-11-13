/**
 * The explanation panel's script, which runs in the webview. It connects the page's elements: it
 * keeps the line-number gutter in step with the input, saves the input and the entries checkbox,
 * asks the extension to match the input as it changes, either as one text or line by line as
 * separate entries, and shows the results with `results.ts`. It also shows the explanation of a
 * state machine step when the step is hovered or focused.
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
import type { MatchesMessage, MatchMessage } from "./protocol";
import { lineNumbers, MatchRequests, selectMatch, showResults } from "./results";

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
const requests = new MatchRequests((message) => vscode.postMessage(message), DEBOUNCE_MS);

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
    if (event.data.type === "matches" && requests.isCurrent(event.data.id)) {
      showResults(event.data.model, { summary, table, rows });
      // The link carries the input text, so that regex101 opens with the same test.
      document
        .querySelector<HTMLAnchorElement>(".regex101")
        ?.setAttribute("href", event.data.regex101Url);
    }
  });
}

const machine = document.querySelector<SVGSVGElement>(".machine-svg");
if (machine) {
  showTips(machine);
}

/**
 * Shows the explanation of a state machine step, from the tooltip its `aria-describedby` names,
 * while the step is hovered or focused, and hides it when the step is left or Escape is pressed.
 *
 * @param svg The state machine diagram.
 */
function showTips(svg: SVGSVGElement): void {
  let shown: HTMLElement | undefined;
  const hide = (): void => {
    if (shown) {
      shown.hidden = true;
      shown = undefined;
    }
  };
  const show = (event: Event): void => {
    const step =
      event.target instanceof Element ? event.target.closest("[aria-describedby]") : null;
    const tip = step && document.getElementById(step.getAttribute("aria-describedby") ?? "");
    if (!step || !tip) {
      hide();
      return;
    }
    if (tip === shown) {
      return;
    }
    hide();
    tip.hidden = false;
    shown = tip;
    const box = step.getBoundingClientRect();
    const left = Math.min(box.left, document.documentElement.clientWidth - tip.offsetWidth - 8);
    tip.style.left = `${Math.max(8, left) + window.scrollX}px`;
    tip.style.top = `${box.bottom + window.scrollY + 4}px`;
  };
  svg.addEventListener("pointerover", show);
  svg.addEventListener("focusin", show);
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("focusout", hide);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hide();
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
  panel.gutter.textContent = lineNumbers(text);
  // Each entry is matched on its own, so multiline mode changes nothing there.
  if (panel.note) {
    panel.note.hidden = entries;
  }
  vscode.setState({ text, entries });
  requests.request(text, entries);
}

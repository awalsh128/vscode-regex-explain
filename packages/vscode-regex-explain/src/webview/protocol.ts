/**
 * Messages between the explanation panel's webview and the extension. The webview script, which
 * runs in a browser, shares this module, so it imports only types.
 */
import type { MatchesModel } from "regex-explain";

/** A message from the webview to the extension. */
export interface MatchMessage {
  /** The message kind. */
  readonly type: "match";
  /** Identifies the request, so that replies to superseded requests can be ignored. */
  readonly id: number;
  /** The text in the input pane. */
  readonly text: string;
  /** Whether each line of the text is a separate entry, matched on its own. */
  readonly entries: boolean;
}

/** A message from the extension to the webview. */
export interface MatchesMessage {
  /** The message kind. */
  readonly type: "matches";
  /** The {@link MatchMessage.id} this answers. */
  readonly id: number;
  /** The outcome, worded for display. */
  readonly model: MatchesModel;
  /** A regex101 link that opens the regex with the matched text. */
  readonly regex101Url: string;
}

/**
 * Checks whether a webview message is a {@link MatchMessage}.
 *
 * @param value The message to evaluate.
 *
 * @returns Whether the value has the shape of a match request.
 */
export function isMatchMessage(value: unknown): value is MatchMessage {
  const candidate = value as Partial<MatchMessage> | undefined;
  return (
    candidate?.type === "match" &&
    typeof candidate.id === "number" &&
    typeof candidate.text === "string" &&
    typeof candidate.entries === "boolean"
  );
}

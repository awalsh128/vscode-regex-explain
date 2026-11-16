/**
 * Explains ECMAScript regular expressions in plain English, finds regexes in source code, and runs
 * them over text.
 *
 * ```ts
 * import { ExplanationRenderer, explainRegex } from "regex-explain";
 *
 * const result = explainRegex("^\\d{3}-\\d{4}$");
 * console.log(new ExplanationRenderer(result).markdownList());
 * ```
 */
export type {
  BacktrackingWarning,
  ExplainOptions,
  ExplainResult,
  ExplanationNode,
  FlagExplanation,
  LengthSummary,
  RegexExplanation,
  RegexExplanationError,
  RegexSource,
} from "./explainer";
export { describeCount, explainRegex, isRegexSource, parseRegexInput } from "./explainer";
export { GRAMMARS, SUPPORTED_LANGUAGE_IDS } from "./compiler";
export type { LocatedRegex } from "./locator";
export { findRegexAt, RegexFinder } from "./locator";
export type {
  FoundMatch,
  MatchesModel,
  EntryModel,
  MatchEntry,
  MatchGroupModel,
  MatchModel,
  MatchRequest,
  MatchResponse,
} from "./matches";
export { describeMatches, findMatches } from "./matches";
export { regex101Url } from "./extlinks";
export type {
  MachineChoice,
  MachineGroup,
  MachinePart,
  MachineRepeat,
  MachineSequence,
  MachineTransition,
  TransitionKind,
} from "./machine";
export { stateMachine } from "./machine";
export type {
  ErrorModel,
  ExplanationModel,
  ExplanationRow,
  FlagModel,
  RenderOptions,
  WarningModel,
} from "./render";
export { ExplanationRenderer } from "./render";
export type { TextPart } from "./text";

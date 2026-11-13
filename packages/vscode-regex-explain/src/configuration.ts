/**
 * The only module that reads settings. Other modules call {@link getConfig}; `npm run check` fails
 * if `getConfiguration(` appears anywhere else in the extension.
 */
import { SUPPORTED_LANGUAGE_IDS } from "regex-explain";
import * as vscode from "vscode";

/** The settings section shared by every Regex Explain setting. */
export const SECTION = "regexExplain";

/** Regex Explain settings, keyed by the camel-cased setting name after `regexExplain.`. */
export interface RegexExplainConfiguration {
  /** `regexExplain.hover.enabled`: show explanations on hover. */
  readonly hoverEnabled: boolean;
  /** `regexExplain.hover.languages`: languages in which regexes in code are found automatically. */
  readonly hoverLanguages: readonly string[];
  /** `regexExplain.checkBacktracking`: warn about catastrophic backtracking. */
  readonly checkBacktracking: boolean;
  /** `regexExplain.panel.follow`: show the regex at the cursor or pointer in the panel. */
  readonly panelFollow: boolean;
}

/** Defaults, matching `contributes.configuration` in package.json. */
export const DEFAULT_CONFIGURATION: RegexExplainConfiguration = {
  hoverEnabled: true,
  hoverLanguages: SUPPORTED_LANGUAGE_IDS,
  checkBacktracking: true,
  panelFollow: true,
};

/**
 * Reads the settings that apply to a document.
 *
 * @param scope The document or URI whose language and folder settings apply, if any.
 *
 * @returns The settings, with defaults for anything unset.
 */
export function getConfig(scope?: vscode.ConfigurationScope): RegexExplainConfiguration {
  const config = vscode.workspace.getConfiguration(SECTION, scope);
  return {
    hoverEnabled: config.get("hover.enabled", DEFAULT_CONFIGURATION.hoverEnabled),
    hoverLanguages: config.get("hover.languages", DEFAULT_CONFIGURATION.hoverLanguages),
    checkBacktracking: config.get("checkBacktracking", DEFAULT_CONFIGURATION.checkBacktracking),
    panelFollow: config.get("panel.follow", DEFAULT_CONFIGURATION.panelFollow),
  };
}

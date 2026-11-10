/** Shared helpers for tests that run inside VS Code. */
import * as vscode from "vscode";
import { SECTION } from "../../configuration";

/** The extension's ID: `publisher.name` from package.json. */
export const EXTENSION_ID = "awalsh128.regex-explain";

/** Text that only this extension's hovers contain, to tell them apart from language hovers. */
export const HOVER_MARKER = "Open explanation";

/**
 * Activates the extension and waits for it to finish.
 *
 * @returns The activated extension.
 */
export async function activateExtension(): Promise<vscode.Extension<unknown>> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (!extension) {
    throw new Error(`Extension ${EXTENSION_ID} is not installed in the test host.`);
  }
  await extension.activate();
  return extension;
}

/**
 * Opens an untitled document in an editor.
 *
 * @param content The document text.
 * @param language The language ID.
 *
 * @returns The editor.
 */
export async function openEditor(content: string, language: string): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content, language });
  return vscode.window.showTextDocument(document);
}

/**
 * Returns the text of this extension's hovers at a position, ignoring other providers.
 *
 * @param document The document.
 * @param position The position.
 *
 * @returns The Markdown of each Regex Explain hover.
 */
export async function regexHovers(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<string[]> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    document.uri,
    position
  );
  return hovers
    .flatMap((hover) => hover.contents)
    .map((content) => (typeof content === "string" ? content : content.value))
    .filter((value) => value.includes(HOVER_MARKER));
}

/**
 * Sets a Regex Explain setting globally for the duration of a test.
 *
 * @param key The setting name after `regexExplain.`.
 * @param value The value, or undefined to remove it.
 */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await vscode.workspace
    .getConfiguration(SECTION)
    .update(key, value, vscode.ConfigurationTarget.Global);
}

/** The language that {@link setLanguageSetting} overrides and {@link resetSettings} clears. */
export const OVERRIDE_LANGUAGE = "plaintext";

/**
 * Sets a Regex Explain setting globally for {@link OVERRIDE_LANGUAGE} only, as a `"[plaintext]"`
 * block in settings.json would.
 *
 * @param key The setting name after `regexExplain.`.
 * @param value The value, or undefined to remove it.
 */
export async function setLanguageSetting(key: string, value: unknown): Promise<void> {
  await vscode.workspace
    .getConfiguration(SECTION, { languageId: OVERRIDE_LANGUAGE })
    .update(key, value, vscode.ConfigurationTarget.Global, true);
}

/** Removes every setting a test may have changed, including language overrides. */
export async function resetSettings(): Promise<void> {
  for (const key of ["hover.enabled", "hover.languages", "checkBacktracking", "panel.follow"]) {
    await setSetting(key, undefined);
    await setLanguageSetting(key, undefined);
  }
}

/**
 * Waits until a condition holds.
 *
 * @param condition Checked every 50 ms.
 * @param timeoutMs How long to wait before failing.
 *
 * @returns Resolves when the condition holds.
 */
export async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Condition not met within ${timeoutMs} ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

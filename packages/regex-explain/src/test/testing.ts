/** Shared helpers for the library tests. */
import { expect } from "chai";
import * as path from "path";
import { explainRegex, ExplanationNode, RegexExplanation } from "../explainer";
import { LocatedRegex, RegexFinder } from "../locator";

/** Flags that change nothing the tests check. */
export const NO_FLAGS = "";

/**
 * Explains a regex that the test expects to be valid.
 *
 * @param pattern The pattern.
 * @param flags The flags.
 *
 * @returns The successful explanation.
 */
export function explainValid(pattern: string, flags = NO_FLAGS): RegexExplanation {
  const result = explainRegex(pattern, flags);
  expect(result.ok, result.ok ? "" : result.message).to.equal(true);
  return result as RegexExplanation;
}

/**
 * Flattens an explanation into `raw => description` lines indented by depth, so a whole tree can be
 * compared with one readable literal.
 *
 * @param pattern The pattern.
 * @param flags The flags.
 *
 * @returns One line per node, in document order.
 */
export function outline(pattern: string, flags = NO_FLAGS): string[] {
  const lines: string[] = [];
  const walk = (node: ExplanationNode, depth: number): void => {
    lines.push(`${"  ".repeat(depth)}${node.raw} => ${node.description}`);
    node.children.forEach((child) => walk(child, depth + 1));
  };
  explainValid(pattern, flags).nodes.forEach((node) => walk(node, 0));
  return lines;
}

/** The tree-sitter runtime and grammars, straight from the installed package. */
export const WASM_DIR = path.dirname(require.resolve("@vscode/tree-sitter-wasm"));

/** One finder for every test, so each grammar loads once. */
export const FINDER = new RegexFinder(WASM_DIR);

/** A located regex as tests compare it: its parts and the source text it covers. */
export interface FoundRegex {
  /** The pattern. */
  readonly pattern: string;
  /** The flags. */
  readonly flags: string;
  /** The source text between the regex's start and end offsets. */
  readonly text: string;
}

/**
 * Finds the regexes in a source and shows each with the source text it covers.
 *
 * @param source The source text.
 * @param languageId The VS Code language ID.
 *
 * @returns The regexes found, in order.
 */
export async function findIn(source: string, languageId: string): Promise<FoundRegex[]> {
  const regexes: LocatedRegex[] = await FINDER.find(source, languageId);
  return regexes.map(({ pattern, flags, start, end }) => ({
    pattern,
    flags,
    text: source.slice(start, end),
  }));
}

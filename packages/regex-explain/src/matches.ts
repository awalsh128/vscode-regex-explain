/**
 * Runs a regex over text and reports each match with the lines it covers, and words the outcome for
 * display. The text is matched either as one string or, with `entries`, one line at a time.
 */
import type { RegexSource } from "./explainer";

/** Text to match against a regex. `g` is added to the flags if missing, so every match is found. */
export interface MatchRequest extends RegexSource {
  /** The text to search. */
  readonly text: string;
  /** The most matches to return. */
  readonly limit: number;
  /**
   * Whether each line of the text is a separate entry, matched on its own, so that `^` and `$`
   * match at its ends and no match spans lines. A line break at the end of the text does not start
   * another entry.
   */
  readonly entries?: boolean;
}

/** One match in the text. */
export interface FoundMatch {
  /** Offset of the first matched character, in UTF-16 code units. */
  readonly start: number;
  /** Offset just past the last matched character. */
  readonly end: number;
  /** The matched text. */
  readonly text: string;
  /** The 1-based line the match starts on. */
  readonly startLine: number;
  /** The 1-based line the match ends on; equal to `startLine` for single-line matches. */
  readonly endLine: number;
  /** The numbered capture groups' values, starting with group 1; undefined if not matched. */
  readonly groups: readonly (string | undefined)[];
  /** The named capture groups' values, by name. */
  readonly named: Readonly<Record<string, string | undefined>>;
}

/** A line of the text matched on its own, in a request with `entries`. */
export interface MatchEntry {
  /** The 1-based line. */
  readonly line: number;
  /** Offset of the line's first character. */
  readonly start: number;
  /** Offset just past the line's last character, before its line break. */
  readonly end: number;
  /** The line, without its line break. */
  readonly text: string;
}

/** The outcome of a {@link MatchRequest}. */
export interface MatchResponse {
  /** The matches, in order. */
  readonly matches: readonly FoundMatch[];
  /** Whether matching stopped at the limit. */
  readonly truncated: boolean;
  /**
   * The entries matched, for a request with `entries`. When matching stopped at the limit, the
   * entries after the one holding the last match are left out.
   */
  readonly entries?: readonly MatchEntry[];
  /** Why the regex could not run, such as a syntax error. */
  readonly error?: string;
  /** Whether matching was stopped because it took too long. */
  readonly timedOut?: boolean;
}

/** A capture group of a match, ready to display. */
export interface MatchGroupModel {
  /** The group's label: `$1`, `$2`, and so on for numbered groups, or the group's name. */
  readonly name: string;
  /** The group's text, or "(no match)" when it did not take part in the match. */
  readonly value: string;
  /** Whether the group matched. */
  readonly matched: boolean;
}

/** A match, ready to display. */
export interface MatchModel {
  /** Offset of the first matched character, in UTF-16 code units. */
  readonly start: number;
  /** Offset just past the last matched character. */
  readonly end: number;
  /** The lines the match covers, such as `L3` or `L1–3`. */
  readonly lines: string;
  /** The matched text, or "(empty)" for an empty match. */
  readonly text: string;
  /** The numbered groups, then the named ones. */
  readonly groups: readonly MatchGroupModel[];
}

/** An entry and its matches, ready to display. */
export interface EntryModel {
  /** The entry's line, such as `L3`. */
  readonly line: string;
  /** Offset of the entry's first character. */
  readonly start: number;
  /** Offset just past the entry's last character. */
  readonly end: number;
  /** The entry's text, or "(empty)" for an empty line. */
  readonly text: string;
  /** Whether the regex matched the entry. */
  readonly matched: boolean;
  /** The matches in the entry, in order. */
  readonly matches: readonly MatchModel[];
}

/** Everything a view of a {@link MatchResponse} shows. */
export interface MatchesModel {
  /**
   * One sentence on the outcome, such as "2 matches.", "1 of 3 entries matches.", or why the regex
   * could not run.
   */
  readonly summary: string;
  /** Whether the regex could not run to completion, so the summary reports a problem. */
  readonly problem: boolean;
  /** The matches, in order. */
  readonly matches: readonly MatchModel[];
  /** Each entry with its matches, when the request had `entries`. */
  readonly entries?: readonly EntryModel[];
}

/**
 * Finds the matches of a regex in text, using JavaScript's `RegExp`.
 *
 * @param request The regex, the text, the most matches to return, and whether each line is a
 *   separate entry.
 *
 * @returns The matches, or an error if the regex does not compile. Empty matches are reported once
 *   at each position, because `matchAll` steps past them.
 */
export function findMatches(request: MatchRequest): MatchResponse {
  let regex: RegExp;
  try {
    const flags = request.flags.includes("g") ? request.flags : `${request.flags}g`;
    regex = new RegExp(request.pattern, flags);
  } catch (error: unknown) {
    return { matches: [], truncated: false, error: (error as Error).message };
  }

  const lineStarts = findLineStarts(request.text);
  if (!request.entries) {
    // One match past the limit tells whether there are more, without running the regex further.
    const found = [...take(request.text.matchAll(regex), request.limit + 1)];
    return {
      matches: found.slice(0, request.limit).map((match) => toFoundMatch(match, 0, lineStarts)),
      truncated: found.length > request.limit,
    };
  }

  const entries = splitEntries(request.text, lineStarts);
  const found = [...take(matchEntries(entries, regex), request.limit + 1)];
  const kept = found.slice(0, request.limit);
  const truncated = found.length > request.limit;
  const lastLine = truncated ? (kept[kept.length - 1]?.entry.line ?? 0) : Infinity;
  return {
    matches: kept.map(({ entry, match }) => toFoundMatch(match, entry.start, lineStarts)),
    truncated,
    entries: entries.filter((entry) => entry.line <= lastLine),
  };
}

/**
 * Splits text into entries, one per line.
 *
 * @param text The text.
 * @param lineStarts Offsets from {@link findLineStarts}.
 *
 * @returns The lines without their line breaks; none for empty text, and no empty entry after a
 *   final line break.
 */
function splitEntries(text: string, lineStarts: readonly number[]): MatchEntry[] {
  const lines = lineStarts.map((start, i): MatchEntry => {
    const content = text
      .slice(start, lineStarts[i + 1] ?? text.length)
      .replace(/(?:\r\n|\r|\n)$/, "");
    return { line: i + 1, start, end: start + content.length, text: content };
  });
  return text === "" || /(?:\r\n|\r|\n)$/.test(text) ? lines.slice(0, -1) : lines;
}

/**
 * Runs a regex over each entry on its own.
 *
 * @param entries The entries.
 * @param regex The regex, with the `g` flag.
 *
 * @returns Each match with the entry it is in, lazily, so that callers can stop early.
 */
function* matchEntries(
  entries: readonly MatchEntry[],
  regex: RegExp
): Generator<{ entry: MatchEntry; match: RegExpExecArray }> {
  for (const entry of entries) {
    for (const match of entry.text.matchAll(regex)) {
      yield { entry, match };
    }
  }
}

/**
 * Converts a `matchAll` result into a {@link FoundMatch}.
 *
 * @param match The result.
 * @param offset Where the searched string starts in the whole text: 0, or an entry's start.
 * @param lineStarts Offsets from {@link findLineStarts} for the whole text.
 *
 * @returns The match, with offsets and lines in the whole text.
 */
function toFoundMatch(
  match: RegExpExecArray,
  offset: number,
  lineStarts: readonly number[]
): FoundMatch {
  const start = offset + match.index;
  const end = start + match[0].length;
  return {
    start,
    end,
    text: match[0],
    startLine: lineAt(lineStarts, start),
    endLine: lineAt(lineStarts, Math.max(start, end - 1)),
    groups: match.slice(1),
    named: { ...match.groups },
  };
}

/**
 * Yields the first items of an iterable, without reading past them.
 *
 * @param items The items.
 * @param count How many to yield.
 *
 * @returns The first `count` items, or all of them if there are fewer.
 */
function* take<T>(items: Iterable<T>, count: number): Generator<T> {
  if (count <= 0) {
    return;
  }
  let taken = 0;
  for (const item of items) {
    yield item;
    taken += 1;
    if (taken === count) {
      return;
    }
  }
}

/**
 * Words the outcome of a match request for display.
 *
 * @param response The outcome of {@link findMatches}, or one with `timedOut` or `error` set by the
 *   caller.
 *
 * @returns The summary sentence, whether it reports a problem, each match with its lines and groups
 *   labeled, and, for entries, each entry with its matches.
 */
export function describeMatches(response: MatchResponse): MatchesModel {
  const matches = response.matches.map(describeMatch);
  const entries = response.entries?.map((entry): EntryModel => {
    const inEntry = matches.filter(
      (match) => match.start >= entry.start && match.start <= entry.end
    );
    return {
      line: `L${entry.line}`,
      start: entry.start,
      end: entry.end,
      text: entry.text === "" ? "(empty)" : entry.text,
      matched: inEntry.length > 0,
      matches: inEntry,
    };
  });
  const problem = !!(response.error || response.timedOut);
  const shown = response.truncated ? ` (showing the first ${matches.length} matches)` : "";
  const summary = response.error
    ? `The regex cannot run: ${response.error}`
    : response.timedOut
      ? "Matching timed out: the pattern backtracks too much on this text."
      : entries
        ? `${describeEntryCount(entries)}${shown}.`
        : `${describeCount(matches.length, "match", "matches")}${response.truncated ? ` (showing the first ${matches.length})` : ""}.`;
  return entries ? { summary, problem, matches, entries } : { summary, problem, matches };
}

/**
 * Words how many entries matched.
 *
 * @param entries The entries.
 *
 * @returns A phrase such as "1 of 3 entries matches" or "No entries".
 */
function describeEntryCount(entries: readonly EntryModel[]): string {
  if (entries.length === 0) {
    return "No entries";
  }
  const matched = entries.filter((entry) => entry.matched).length;
  const noun = entries.length === 1 ? "entry" : "entries";
  return `${matched} of ${entries.length} ${noun} ${matched === 1 ? "matches" : "match"}`;
}

/**
 * Words a count of things.
 *
 * @param count The count.
 * @param one The noun for one.
 * @param many The noun for several.
 *
 * @returns A phrase such as "No matches", "1 match", or "2 matches".
 */
function describeCount(count: number, one: string, many: string): string {
  return `${count === 0 ? "No" : count} ${count === 1 ? one : many}`;
}

/**
 * Words one match for display.
 *
 * @param match The match.
 *
 * @returns The match with its lines and groups labeled.
 */
function describeMatch(match: FoundMatch): MatchModel {
  const groups: [string, string | undefined][] = [
    ...match.groups.map((value, i): [string, string | undefined] => [`$${i + 1}`, value]),
    ...Object.entries(match.named),
  ];
  return {
    start: match.start,
    end: match.end,
    lines:
      match.startLine === match.endLine
        ? `L${match.startLine}`
        : `L${match.startLine}–${match.endLine}`,
    text: match.text === "" ? "(empty)" : match.text,
    groups: groups.map(([name, value]) => ({
      name,
      value: value ?? "(no match)",
      matched: value !== undefined,
    })),
  };
}

/**
 * Finds the offset where each line starts.
 *
 * @param text The text.
 *
 * @returns The start offsets, beginning with 0.
 */
function findLineStarts(text: string): number[] {
  const lineBreaks = [...text.matchAll(/\r\n|\r|\n/g)];
  return [0, ...lineBreaks.map((lineBreak) => lineBreak.index + lineBreak[0].length)];
}

/**
 * Finds the line containing an offset.
 *
 * @param lineStarts Offsets from {@link findLineStarts}.
 * @param offset The offset.
 *
 * @returns The 1-based line number.
 */
function lineAt(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
}

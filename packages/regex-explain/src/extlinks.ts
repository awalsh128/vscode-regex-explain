/**
 * Links that open a regex in external tools, with their fields prefilled. Each tool has one builder
 * function here.
 *
 * - [regex101](https://regex101.com) tests and debugs regexes interactively. Its fields are prefilled
 *   from the query string, as its FAQ describes:
 *   https://github.com/firasdib/Regex101/wiki/FAQ#how-to-prefill-the-fields-on-the-interface-via-url
 *   The FAQ does not list `flavor`, but regex101 reads it: `javascript` selects the JavaScript
 *   flavor.
 */
import type { RegexSource } from "./explainer";

/** The regex101 page the fields are prefilled on. */
const REGEX101 = "https://regex101.com/";

/**
 * Builds a regex101 link that opens a regex in the JavaScript flavor, which is the engine this
 * library explains and matches with.
 *
 * @param source The regex.
 * @param testString Text to match against; left out when empty.
 *
 * @returns The link, with each value percent-encoded so that `+` and spaces survive.
 */
export function regex101Url(source: RegexSource, testString = ""): string {
  const params: [string, string][] = [
    ["regex", source.pattern],
    ["flags", source.flags],
    ["flavor", "javascript"],
    ...(testString === "" ? [] : [["testString", testString] as [string, string]]),
  ];
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  return `${REGEX101}?${query}`;
}

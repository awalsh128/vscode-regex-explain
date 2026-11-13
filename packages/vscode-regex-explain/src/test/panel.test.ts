import { expect } from "chai";
import { describe, it } from "mocha";
import * as path from "path";
import { explainRegex } from "regex-explain";
import { PANEL_TITLE, PanelResources, PanelTemplate } from "../webview/panel";

/** The templates in the source tree; the bundle copies them to `dist/`. */
const TEMPLATE = new PanelTemplate(path.join(__dirname, "..", "..", "src", "webview"));

/** Placeholder webview values. */
const RESOURCES: PanelResources = {
  cspSource: "https://webview.test",
  nonce: "NONCE",
  scriptUri: "https://webview.test/dist/webview.js",
  styleUri: "https://webview.test/dist/panel.css",
};

/** Options that keep the backtracking check out of tests that do not need it. */
const NO_BACKTRACKING = { checkBacktracking: false };

describe("PanelTemplate", () => {
  it("should allow only the panel's own script and the webview's resources", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("a", "", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include(
      `content="default-src 'none'; style-src https://webview.test 'unsafe-inline'; script-src 'nonce-NONCE'; font-src https://webview.test;"`
    );
    expect(html).to.include(
      '<script nonce="NONCE" src="https://webview.test/dist/webview.js"></script>'
    );
    expect(html).to.include('<link rel="stylesheet" href="https://webview.test/dist/panel.css">');
  });

  it("should head the steps table with Pattern and Explanation columns", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("a", "", NO_BACKTRACKING), RESOURCES);

    // Assert
    const headings = [...html.matchAll(/<vscode-table-header-cell>(.*?)</g)].map(
      ([, text]) => text
    );
    expect(headings).to.deep.equal(["Pattern", "Explanation"]);
  });

  it("should render each step as a highlighted table row indented by depth", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("(ab)+", "", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include(
      '<vscode-table-cell><code class="regex" style="margin-left: 0em">' +
        '<span style="--shiki-light:#D16969;--shiki-dark:#CE9178">(</span>' +
        '<span style="--shiki-light:#000000;--shiki-dark:#D4D4D4">ab</span>' +
        '<span style="--shiki-light:#D16969;--shiki-dark:#CE9178">)</span>' +
        '<span style="--shiki-light:#000000;--shiki-dark:#D7BA7D">+</span></code></vscode-table-cell>\n' +
        "            <vscode-table-cell>Capture group #1, one or more times (as many as possible):</vscode-table-cell>"
    );
    expect(html).to.include(
      '<vscode-table-cell><code class="regex" style="margin-left: 1.25em">' +
        '<span style="--shiki-light:#000000;--shiki-dark:#D4D4D4">ab</span></code></vscode-table-cell>\n' +
        "            <vscode-table-cell>Match the text <code>ab</code></vscode-table-cell>"
    );
  });

  it("should show the regex, match length, and flags", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("a", "g", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include(
      '<p class="literal"><code class="regex">/' +
        '<span style="--shiki-light:#000000;--shiki-dark:#D4D4D4">a</span>/g</code>'
    );
    expect(html).to.include('<p class="length"><em>Matches exactly 1 character.</em></p>');
    expect(html).to.include(
      "<li><code>g</code> <em>global</em>: Find all matches instead of stopping after the first.</li>"
    );
  });

  it("should escape markup in the regex's flags", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("a", "<i>", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include("</span>/&lt;i&gt;</code>");
  });

  it("should head the page with the panel's title", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("a", "", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include(`<title>${PANEL_TITLE}</title>`);
    expect(html).to.include(`<h1 id="explanation-heading">${PANEL_TITLE}</h1>`);
  });

  it("should leave out the flags heading when there are no flags", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("a", "", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.not.include("<h2>Flags</h2>");
  });

  it("should show a backtracking warning and its fix", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("^(?:a+)+$", ""), RESOURCES);

    // Assert
    expect(html).to.include(
      '<div class="warning" role="note"><strong>Warning:</strong> <code>a+</code> is repeated by'
    );
    expect(html).to.include(
      'Equivalent safe pattern:\n        <code class="regex">/' +
        '<span style="--shiki-light:#000000;--shiki-dark:#D4D4D4">^a</span>' +
        '<span style="--shiki-light:#000000;--shiki-dark:#D7BA7D">+</span>' +
        '<span style="--shiki-light:#000000;--shiki-dark:#D4D4D4">$</span>/</code>'
    );
  });

  it("should show a syntax error with a caret instead of a table", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("ab(", "", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include(
      '<p class="error" role="alert"><strong>Invalid regular expression:</strong> Unterminated group</p>'
    );
    expect(html).to.include('<pre class="caret">ab(\n   ^</pre>');
    expect(html).to.not.include("<vscode-table ");
  });

  it("should escape the pattern", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("<b>", "", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include(
      '<code class="regex">/<span style="--shiki-light:#000000;--shiki-dark:#D4D4D4">&#x3C;b></span>/</code>'
    );
    expect(html).to.not.include("<b>");
  });

  it("should include the input and match panes and the match templates", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("a", "", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include('<vscode-textarea class="input" monospace');
    expect(html).to.include('<pre class="gutter" aria-hidden="true">1</pre>');
    expect(html).to.include('<vscode-checkbox class="entries-toggle"');
    expect(html).to.include('<tbody class="result-rows"></tbody>');
    expect(html).to.include('<template id="result-row">');
    expect(html).to.include('<template id="match-item">');
    expect(html).to.match(/<template id="match-group">\s*<dt><\/dt>\s*<dd><\/dd>\s*<\/template>/);
  });
});

describe("PanelTemplate regex101 link", () => {
  it("should link to regex101 with the regex and flags", () => {
    // Act
    const html = TEMPLATE.render(explainRegex("a+b", "gi", NO_BACKTRACKING), RESOURCES);

    // Assert
    expect(html).to.include(
      '<a class="regex101" href="https://regex101.com/?regex=a%2Bb&amp;flags=gi&amp;flavor=javascript"'
    );
  });
});

describe("PanelTemplate multiline note", () => {
  [
    { name: "the m flag", pattern: "^a$", flags: "m", expected: true },
    { name: "an inline (?m:) group", pattern: "(?m:^a$)", flags: "", expected: true },
    { name: "neither", pattern: "^a$", flags: "", expected: false },
  ].forEach(({ name, pattern, flags, expected }) => {
    it(`should ${expected ? "" : "not "}note multiline mode for ${name}`, () => {
      // Act
      const html = TEMPLATE.render(explainRegex(pattern, flags, NO_BACKTRACKING), RESOURCES);

      // Assert
      expect(html.includes('class="note multiline-note"')).to.equal(expected);
    });
  });
});

import { expect } from "chai";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { afterEach, beforeEach, describe, it } from "mocha";
import { tmpdir } from "os";
import * as path from "path";
import {
  allowEvents,
  parseArgs,
  renderPreview,
  startServer,
  themeCss,
  WEBVIEW_DIR,
} from "../preview-panel";

describe("parseArgs", () => {
  it("should default to the dark theme and a temporary directory", () => {
    // Act
    const options = parseArgs([]);

    // Assert
    expect(options.theme).to.equal("dark");
    expect(options.outDir).to.contain("regex-explain-preview");
  });

  it("should read the theme and output directory", () => {
    // Act
    const options = parseArgs(["--theme", "light", "--out", "somewhere"]);

    // Assert
    expect(options.theme).to.equal("light");
    expect(options.outDir).to.equal(path.resolve("somewhere"));
  });

  it("should watch on the default port unless told otherwise", () => {
    // Act
    const options = parseArgs([]);

    // Assert
    expect(options).to.include({ watch: true, port: 8765, live: false });
  });

  it("should read the build options", () => {
    // Act
    const options = parseArgs(["--once", "--port", "9000", "--live"]);

    // Assert
    expect(options).to.include({ watch: false, port: 9000, live: true });
  });

  it("should reject a port that is not a number", () => {
    // Act & Assert
    expect(() => parseArgs(["--port", "http"])).to.throw("Unknown or incomplete option");
  });

  it("should reject an unknown option", () => {
    // Act & Assert
    expect(() => parseArgs(["--theme", "blue"])).to.throw("Unknown or incomplete option");
  });
});

describe("themeCss", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`should declare every theme variable the stylesheet uses in the ${theme} theme`, () => {
      // Arrange
      const stylesheet = readFileSync(path.join(WEBVIEW_DIR, "panel.css"), "utf8");
      const used = [...new Set(stylesheet.match(/--vscode-[\w-]+/g))];

      // Act
      const css = themeCss(theme);

      // Assert
      expect(css).to.contain(":root {");
      expect(used.filter((name) => !css.includes(`${name}: `))).to.deep.equal([]);
    });
  });
});

describe("renderPreview", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(path.join(tmpdir(), "preview-panel-test-"));
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("should write a page whose table and script are wired to mock data", async () => {
    // Act
    const page = await renderPreview({ outDir, theme: "dark" });

    // Assert
    const html = readFileSync(page, "utf8");
    expect(html).to.contain("<vscode-table-row>");
    expect(html).to.contain('src="webview.js"');
    expect(existsSync(path.join(outDir, "webview.js"))).to.equal(true);
    expect(readFileSync(path.join(outDir, "panel.css"), "utf8")).to.contain("--vscode-foreground:");
  });
});

describe("allowEvents", () => {
  it("should let the page connect to its own server", () => {
    // Arrange
    const html = `<meta content="default-src 'none'; style-src 'self';">`;

    // Act & Assert
    expect(allowEvents(html)).to.contain("default-src 'none'; connect-src 'self';");
  });
});

describe("renderPreview in a live build", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(path.join(tmpdir(), "preview-panel-live-"));
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("should allow and open the event stream", async () => {
    // Act
    const page = await renderPreview({ outDir, live: true });

    // Assert
    expect(readFileSync(page, "utf8")).to.contain("connect-src 'self'");
    expect(readFileSync(path.join(outDir, "webview.js"), "utf8")).to.contain("/events");
  });
});

describe("startServer", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(path.join(tmpdir(), "preview-panel-server-"));
    writeFileSync(path.join(outDir, "index.html"), "<p>page</p>");
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("should serve the page at the root", async () => {
    // Arrange
    const server = await startServer(outDir, 0);

    // Act
    const response = await fetch(server.url);
    const body = await response.text();
    await server.close();

    // Assert
    expect(response.headers.get("content-type")).to.contain("text/html");
    expect(body).to.equal("<p>page</p>");
  });

  it("should answer 404 for a file the preview did not write", async () => {
    // Arrange
    const server = await startServer(outDir, 0);

    // Act
    const response = await fetch(`${server.url}missing.css`);
    await server.close();

    // Assert
    expect(response.status).to.equal(404);
  });

  it("should send change events to open pages", async () => {
    // Arrange
    const server = await startServer(outDir, 0);
    const response = await fetch(`${server.url}events`);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();

    // Act
    server.notify("css");
    const { value } = await reader.read();
    await reader.cancel();
    await server.close();

    // Assert
    expect(new TextDecoder().decode(value)).to.equal("event: css\ndata:\n\n");
  });
});

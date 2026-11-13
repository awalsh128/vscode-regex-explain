/**
 * Renders the explanation panel's page with mock data, so that it can be viewed in a browser
 * without running the extension. The page comes from the real templates and the real webview
 * script, which is bundled with a stand-in for the VS Code API that answers match requests with the
 * library's `findMatches`. Run it as `npm run preview-panel -- [--theme dark|light] [--out <dir>]
 * [--port <n>] [--once]`. By default it serves the page and follows changes to the panel's files
 * and the library: open the address it prints. With `--once`, it writes the page and exits: open
 * the `index.html` it prints.
 */
import { spawn } from "child_process";
import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "fs";
import * as http from "http";
import { AddressInfo } from "net";
import * as os from "os";
import * as path from "path";
import { explainRegex, RegexSource } from "regex-explain";
import { PanelTemplate } from "../packages/vscode-regex-explain/src/webview/panel";

/** The directory holding the panel's templates, stylesheet and script. */
export const WEBVIEW_DIR = path.resolve(__dirname, "../packages/vscode-regex-explain/src/webview");

/** The regex the mock page explains. Its nested quantifier triggers a backtracking warning. */
export const MOCK_REGEX: RegexSource = {
  pattern: "(?<user>[\\w.]+)@(a+)+\\.(com|org)",
  flags: "im",
};

/** The colors of a theme, as the VS Code theme variables the stylesheet uses. */
export type Theme = "dark" | "light";

/** Theme variables, without the `--vscode-` prefix, for each theme. */
const THEMES: Record<Theme, Record<string, string>> = {
  dark: {
    "editor-background": "#1e1e1e",
    foreground: "#cccccc",
    descriptionForeground: "#9d9d9d",
    disabledForeground: "#6e6e6e",
    "editorError-foreground": "#f48771",
    "editorWarning-foreground": "#cca700",
    "editorWidget-border": "#454545",
    focusBorder: "#007fd4",
    "list-hoverBackground": "#2a2d2e",
    "textLink-foreground": "#3794ff",
    "textLink-activeForeground": "#3794ff",
    "panel-border": "#80808059",
    "textCodeBlock-background": "#0a0a0a66",
    "editorLineNumber-foreground": "#6e7681",
    "editorLineNumber-activeForeground": "#cccccc",
    "charts-blue": "#3794ff",
    "charts-green": "#89d185",
    "charts-orange": "#d18616",
    "charts-purple": "#b180d7",
    "charts-red": "#f14c4c",
    "charts-yellow": "#cca700",
    "editorHoverWidget-background": "#252526",
    "editorHoverWidget-border": "#454545",
    "editorHoverWidget-foreground": "#cccccc",
    "widget-shadow": "#0000005c",
    "editor-font-family": "monospace",
    "editor-font-size": "14px",
    "font-family": "system-ui, sans-serif",
    "font-size": "13px",
  },
  light: {
    "editor-background": "#ffffff",
    foreground: "#333333",
    descriptionForeground: "#616161",
    disabledForeground: "#a0a0a0",
    "editorError-foreground": "#a1260d",
    "editorWarning-foreground": "#bf8803",
    "editorWidget-border": "#c8c8c8",
    focusBorder: "#0090f1",
    "list-hoverBackground": "#e8e8e8",
    "textLink-foreground": "#006ab1",
    "textLink-activeForeground": "#006ab1",
    "panel-border": "#80808059",
    "textCodeBlock-background": "#f3f3f3",
    "editorLineNumber-foreground": "#237893",
    "editorLineNumber-activeForeground": "#0b216f",
    "charts-blue": "#1a85ff",
    "charts-green": "#388a34",
    "charts-orange": "#d18616",
    "charts-purple": "#652d90",
    "charts-red": "#e51400",
    "charts-yellow": "#bf8803",
    "editorHoverWidget-background": "#f3f3f3",
    "editorHoverWidget-border": "#c8c8c8",
    "editorHoverWidget-foreground": "#616161",
    "widget-shadow": "#00000029",
    "editor-font-family": "monospace",
    "editor-font-size": "14px",
    "font-family": "system-ui, sans-serif",
    "font-size": "13px",
  },
};

/** Options for {@link renderPreview}. */
export interface PreviewOptions {
  /** The directory to write the page into. */
  readonly outDir: string;
  /** The theme whose variables the page uses. */
  readonly theme?: Theme;
  /** Whether to serve the page and rebuild it on changes, with {@link watchPreview}. */
  readonly watch?: boolean;
  /** The port to serve on when watching. */
  readonly port?: number;
  /** Whether the page listens to the server for changes; set by {@link watchPreview}'s builds. */
  readonly live?: boolean;
}

/**
 * Builds the stylesheet's theme variables.
 *
 * @param theme The theme.
 *
 * @returns CSS declaring the theme's `--vscode-*` variables on `:root`.
 */
export function themeCss(theme: Theme): string {
  const declarations = Object.entries(THEMES[theme]).map(
    ([name, value]) => `  --vscode-${name}: ${value};`
  );
  return `:root {\n${declarations.join("\n")}\n}\n\n`;
}

/**
 * Writes the preview page, its stylesheet and its script into a directory.
 *
 * @param options Where to write the page and which theme it uses.
 *
 * @returns The path of the page's `index.html`.
 */
export async function renderPreview(options: PreviewOptions): Promise<string> {
  const { outDir, theme = "dark", live = false } = options;
  mkdirSync(outDir, { recursive: true });

  const result = explainRegex(MOCK_REGEX.pattern, MOCK_REGEX.flags);
  const html = new PanelTemplate(WEBVIEW_DIR).render(result, {
    cspSource: "'self'",
    nonce: "preview",
    scriptUri: "webview.js",
    styleUri: "panel.css",
  });
  const page = path.join(outDir, "index.html");
  writeFileSync(page, live ? allowEvents(html) : html);

  const stylesheet = readFileSync(path.join(WEBVIEW_DIR, "panel.css"), "utf8");
  writeFileSync(path.join(outDir, "panel.css"), themeCss(theme) + stylesheet);

  // The stand-in stands where the extension host would: it runs the matcher the extension uses and
  // replies to each match request, so that typing in the input pane lists matches. Like VS Code, it
  // keeps the page's state across reloads, here in session storage.
  const stub = `
    import { describeMatches, findMatches, regex101Url } from "regex-explain";
    const source = ${JSON.stringify(MOCK_REGEX)};
    const STATE_KEY = "regex-explain-preview";
    globalThis.acquireVsCodeApi = () => ({
      postMessage(message) {
        if (message.type !== "match") return;
        const request = { ...source, text: message.text, limit: 1000, entries: message.entries };
        const response = findMatches(request);
        const model = describeMatches(response);
        const link = regex101Url(source, message.text);
        window.postMessage({ type: "matches", id: message.id, model, regex101Url: link }, "*");
      },
      getState: () => {
        try {
          return JSON.parse(sessionStorage.getItem(STATE_KEY) ?? "null") ?? undefined;
        } catch {
          return undefined;
        }
      },
      setState: (state) => {
        try {
          sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch {
          // Storage can be unavailable, as in a private window; the preview still works.
        }
      },
    });
    ${live ? LIVE_CLIENT : ""}
    import("./main");
  `;
  await build({
    stdin: { contents: stub, resolveDir: WEBVIEW_DIR, sourcefile: "preview.ts", loader: "ts" },
    bundle: true,
    // The extension's tsconfig maps the library to its source, so the bundle leaves out the
    // explainer's parsing and analysis, as the extension's own build does.
    tsconfig: path.join(WEBVIEW_DIR, "../../tsconfig.json"),
    // The tree-sitter runtime, which the explainer loads, has Node-only branches that a browser
    // never reaches; they are left as they are rather than bundled.
    external: ["url", "module", "fs", "fs/promises", "path"],
    platform: "browser",
    format: "iife",
    target: "es2022",
    outfile: path.join(outDir, "webview.js"),
    logLevel: "warning",
  });
  return page;
}

/**
 * Lets a page open the server's event stream. The panel's policy blocks all connections, which a
 * webview needs but the live preview does not.
 *
 * @param html The page.
 *
 * @returns The page with `connect-src 'self'` added to its content security policy.
 */
export function allowEvents(html: string): string {
  return html.replace("default-src 'none';", "default-src 'none'; connect-src 'self';");
}

/** A running preview server. */
export interface PreviewServer {
  /** The page's address. */
  readonly url: string;
  /**
   * Tells open pages that the preview changed.
   *
   * @param event `css` when only the stylesheet changed, so pages can swap it without reloading;
   *   `reload` otherwise.
   */
  notify(event: "css" | "reload"): void;
  /** Stops the server and closes the open pages' event streams. */
  close(): Promise<void>;
}

/** Content types of the files the preview writes. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

/**
 * Serves a preview directory on the loopback interface, with an `/events` stream that tells open
 * pages when to reload.
 *
 * @param outDir The directory {@link renderPreview} writes.
 * @param port The port; 0 picks a free one.
 *
 * @returns The server, once it is listening.
 */
export function startServer(outDir: string, port: number): Promise<PreviewServer> {
  const root = path.resolve(outDir);
  const streams = new Set<http.ServerResponse>();
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/events") {
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
      response.write(": connected\n\n");
      streams.add(response);
      request.on("close", () => streams.delete(response));
      return;
    }
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const { port: bound } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${bound}/`,
        notify: (event) => streams.forEach((stream) => stream.write(`event: ${event}\ndata:\n\n`)),
        close: () => {
          streams.forEach((stream) => stream.end());
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

/** Directories whose changes alter the preview: the panel's files, and the library it shows. */
const WATCHED_DIRS = [WEBVIEW_DIR, path.resolve(__dirname, "../packages/regex-explain/src")];

/** How long to wait for a burst of file events, such as an editor's save, to end. */
const SETTLE_MS = 100;

/**
 * Serves the preview and rebuilds it whenever the panel's files or the library change, until the
 * process is stopped. Each rebuild runs this script in a new process, so that changes to modules it
 * imports, such as `panel.ts` or the explainer, take effect.
 *
 * @param options Where to write the page, its theme, and the port to serve it on.
 *
 * @returns Resolves once the first build is served.
 */
export async function watchPreview(options: PreviewOptions): Promise<void> {
  const { outDir, theme = "dark", port = DEFAULT_PORT } = options;
  const rebuild = (): Promise<boolean> =>
    new Promise((resolve) => {
      const options = ["--out", outDir, "--theme", theme, "--once", "--live"];
      const args = [...process.execArgv, __filename, ...options];
      spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] }).on(
        "close",
        (code) => resolve(code === 0)
      );
    });

  if (!(await rebuild())) {
    throw new Error("The first build failed; see the errors above.");
  }
  const server = await startServer(outDir, port);
  console.log(`Serving ${server.url}; watching for changes. Press Ctrl+C to stop.`);

  // Changes are batched until files settle, and one rebuild runs at a time.
  let changed = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  let building = Promise.resolve();
  const flush = (): void => {
    const files = changed;
    changed = new Set();
    building = building.then(async () => {
      if (await rebuild()) {
        const cssOnly = [...files].every((file) => file === "panel.css");
        server.notify(cssOnly ? "css" : "reload");
        console.log(`Rebuilt after changes to ${[...files].join(", ")}.`);
      }
    });
  };
  for (const dir of WATCHED_DIRS) {
    watch(dir, { recursive: true }, (_event, file) => {
      changed.add(path.basename(file ?? ""));
      clearTimeout(timer);
      timer = setTimeout(flush, SETTLE_MS);
    });
  }
}

/** The port {@link watchPreview} serves on unless `--port` says otherwise. */
const DEFAULT_PORT = 8765;

/**
 * Listens to the server's events, in a live preview: swaps the stylesheet when only it changed, and
 * reloads the page otherwise.
 */
const LIVE_CLIENT = `
  const events = new EventSource("/events");
  events.addEventListener("css", () => {
    const link = document.querySelector('link[rel="stylesheet"]');
    if (link) link.href = "panel.css?" + Date.now();
  });
  events.addEventListener("reload", () => location.reload());
`;

/**
 * Parses the command line's options.
 *
 * @param args The arguments after the script name.
 *
 * @returns The options, with defaults for the ones not given.
 */
export function parseArgs(args: readonly string[]): PreviewOptions {
  let outDir = path.join(os.tmpdir(), "regex-explain-preview");
  let theme: Theme = "dark";
  let watching = true;
  let port = DEFAULT_PORT;
  let live = false;
  for (let i = 0; i < args.length; i++) {
    const value = args[i + 1];
    if (args[i] === "--out" && value) {
      outDir = path.resolve(value);
      i++;
    } else if (args[i] === "--theme" && (value === "dark" || value === "light")) {
      theme = value;
      i++;
    } else if (args[i] === "--port" && /^\d+$/.test(value ?? "")) {
      port = Number(value);
      i++;
    } else if (args[i] === "--once") {
      watching = false;
    } else if (args[i] === "--live") {
      // Internal: watchPreview's rebuilds pass it so that pages listen for changes.
      live = true;
    } else {
      throw new Error(`Unknown or incomplete option: ${args[i]}`);
    }
  }
  return { outDir, theme, watch: watching, port, live };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  Promise.resolve()
    .then(async () => {
      if (options.watch) {
        await watchPreview(options);
      } else {
        console.log(`Open ${await renderPreview(options)}`);
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

/**
 * Bundles the extension into dist/extension.js, the match worker into dist/matchWorker.js, and the
 * explanation panel's script into dist/webview.js, then copies the panel's templates and stylesheet
 * from src/webview/ and the tree-sitter runtime and the library's GRAMMARS next to them, where
 * activate() loads them. Build the library first.
 */
// @ts-check
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");

// tsconfig.json maps regex-explain to the library's source, so esbuild bundles the
// library's modules directly. Because the library declares "sideEffects": false, the worker keeps
// only findMatches and none of the explainer's parsing and analysis packages.
await build({
  entryPoints: {
    extension: path.join(root, "src/extension.ts"),
    matchWorker: path.join(root, "src/matcher.ts"),
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  minify: true,
  keepNames: true,
  sourcemap: true,
  outdir: dist,
});

await build({
  entryPoints: { webview: path.join(root, "src/webview/main.ts") },
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  sourcemap: true,
  outdir: dist,
});

const require = createRequire(import.meta.url);
const { GRAMMARS } = require("regex-explain");

const wasmDir = path.dirname(require.resolve("@vscode/tree-sitter-wasm"));
mkdirSync(dist, { recursive: true });
for (const file of ["tree-sitter.wasm", ...GRAMMARS.map((g) => `tree-sitter-${g}.wasm`)]) {
  copyFileSync(path.join(wasmDir, file), path.join(dist, file));
}
for (const file of ["panel.html", "parts.html", "panel.css"]) {
  copyFileSync(path.join(root, "src/webview", file), path.join(dist, file));
}

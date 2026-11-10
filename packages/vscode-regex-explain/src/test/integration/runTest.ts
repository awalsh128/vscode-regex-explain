import { runTests } from "@vscode/test-electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EXTENSION_DIR, TEST_WORKSPACE_DIR } from "./paths";

/** Downloads VS Code if needed and runs the integration suite in it. */
async function main(): Promise<void> {
  // A fresh profile per run keeps settings and editors from earlier runs out of the tests.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "regex-explain-test-"));
  // VS Code terminals and agents may set this; Electron must launch as an editor, not as Node.
  delete process.env.ELECTRON_RUN_AS_NODE;
  try {
    await runTests({
      extensionDevelopmentPath: EXTENSION_DIR,
      extensionTestsPath: path.resolve(__dirname, "./suite"),
      launchArgs: [
        `--user-data-dir=${userDataDir}`,
        "--disable-extensions",
        "--disable-workspace-trust",
        TEST_WORKSPACE_DIR,
      ],
    });
  } catch (error: unknown) {
    console.error("Integration tests failed:", error);
    process.exitCode = 1;
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

void main();

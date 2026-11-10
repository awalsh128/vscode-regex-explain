/** Paths shared by the test launcher, which runs in Node without the `vscode` module, and tests. */
import * as path from "path";

/** The extension package directory. */
export const EXTENSION_DIR = path.resolve(__dirname, "../../..");

/** The workspace folder tests open. */
export const TEST_WORKSPACE_DIR = path.join(EXTENSION_DIR, "test-workspace");

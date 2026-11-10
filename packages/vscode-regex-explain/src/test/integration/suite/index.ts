import * as fs from "fs";
import Mocha from "mocha";
import * as path from "path";
import * as vscode from "vscode";
import { resetSettings } from "../testing";

/**
 * Entry point that VS Code calls to run the integration tests.
 *
 * @returns Resolves when every test passes; rejects otherwise.
 */
export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 20000 });
  const grep = process.env.MOCHA_GREP;
  if (grep) {
    mocha.grep(grep);
  }

  mocha.suite.afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await resetSettings();
  });

  const testsRoot = path.resolve(__dirname, "..");
  fs.readdirSync(testsRoot)
    .filter((name) => name.endsWith(".test.js"))
    .forEach((name) => mocha.addFile(path.join(testsRoot, name)));

  return new Promise((resolve, reject) => {
    mocha.run((failures) =>
      failures > 0 ? reject(new Error(`${failures} tests failed.`)) : resolve()
    );
  });
}

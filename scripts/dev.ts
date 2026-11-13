/**
 * Development tasks: `check` verifies that related files agree, and `setup` prepares a fresh clone.
 *
 * ```sh
 * npm run check   # tsx scripts/dev.ts check
 * npm run setup   # npm install, then tsx scripts/dev.ts setup
 * ```
 */
import { spawnSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import * as path from "path";

/** Reads a repository file by its path relative to the repository root. */
export type ReadFile = (relativePath: string) => string;

/** Lists repository files in a directory and its subdirectories, relative to the repo root. */
export type ListFiles = (relativeDir: string) => string[];

/** Runs a command in the repository and throws if it cannot start or fails. */
export type CommandRunner = (command: string, args: string[]) => void;

/** The library package directory. */
export const LIBRARY_DIR = "packages/regex-explain";

/** The extension package directory. */
export const EXTENSION_DIR = "packages/vscode-regex-explain";

/** The only extension module that reads settings. */
export const SETTINGS_MODULE = `${EXTENSION_DIR}/src/configuration.ts`;

/** The extension's settings prefix. */
const SETTINGS_SECTION = "regexExplain.";

/**
 * Maps a setting name to its `RegexExplainConfiguration` key, e.g. `regexExplain.hover.enabled` to
 * `hoverEnabled`.
 *
 * @param name The full setting name.
 *
 * @returns The interface key.
 */
export function settingKey(name: string): string {
  return name
    .slice(SETTINGS_SECTION.length)
    .replace(/\.(\w)/g, (_match, letter: string) => letter.toUpperCase());
}

/**
 * Checks that the extension settings in package.json match the README settings table, including
 * defaults, and the `RegexExplainConfiguration` interface.
 *
 * @param read Reads a repository file.
 *
 * @returns The problems found.
 */
export function checkSettings(read: ReadFile): string[] {
  const manifest = JSON.parse(read(`${EXTENSION_DIR}/package.json`));
  const properties: Record<string, { default: unknown }> =
    manifest.contributes.configuration.properties;
  const readmePath = `${EXTENSION_DIR}/README.md`;
  // Settings table rows start with "| `regexExplain.name` | `default` |"; an array default lists
  // one code span per item, separated by <br>.
  const readmeDefaults = new Map(
    [...read(readmePath).matchAll(/^\| `(regexExplain\.[\w.]+)`\s*\|([^|]*)\|/gm)].map(
      ([, name, cell]) => [name, [...cell.matchAll(/`([^`]*)`/g)].map(([, span]) => span)]
    )
  );
  // The interface body ends at the first closing brace at the start of a line.
  const body = read(SETTINGS_MODULE).match(
    /export interface RegexExplainConfiguration \{([\s\S]*?)\n\}/
  );
  const interfaceKeys = new Set(
    [...(body?.[1] ?? "").matchAll(/readonly (\w+)\??:/g)].map(([, key]) => key)
  );

  const problems: string[] = [];
  for (const [name, property] of Object.entries(properties)) {
    const expected = JSON.stringify(property.default);
    const spans = readmeDefaults.get(name);
    const documented = Array.isArray(property.default) ? JSON.stringify(spans) : spans?.join(" ");
    if (spans === undefined) {
      problems.push(`${readmePath}: setting ${name} is missing from the settings table.`);
    } else if (documented !== expected) {
      problems.push(
        `${readmePath}: ${name} default is ${documented}, but package.json has ${expected}.`
      );
    }
    if (!interfaceKeys.has(settingKey(name))) {
      problems.push(
        `${SETTINGS_MODULE}: RegexExplainConfiguration is missing ${settingKey(name)}.`
      );
    }
  }
  for (const name of readmeDefaults.keys()) {
    if (!(name in properties)) {
      problems.push(
        `${readmePath}: settings table lists ${name}, which package.json does not define.`
      );
    }
  }
  const declaredKeys = new Set(Object.keys(properties).map(settingKey));
  for (const key of interfaceKeys) {
    if (!declaredKeys.has(key)) {
      problems.push(
        `${SETTINGS_MODULE}: RegexExplainConfiguration has ${key}, which package.json does not define.`
      );
    }
  }
  return problems;
}

/**
 * Checks that every extension command is in the Command Palette menu and that the README names it
 * by ID and title.
 *
 * @param read Reads a repository file.
 *
 * @returns The problems found.
 */
export function checkCommands(read: ReadFile): string[] {
  const manifest = JSON.parse(read(`${EXTENSION_DIR}/package.json`));
  const commands: { command: string; title: string }[] = manifest.contributes.commands;
  const palette = new Set(
    (manifest.contributes.menus?.commandPalette ?? []).map(
      (entry: { command: string }) => entry.command
    )
  );
  const readmePath = `${EXTENSION_DIR}/README.md`;
  // Wrapped lines would otherwise split titles.
  const readme = read(readmePath).replace(/\s+/g, " ");

  const problems: string[] = [];
  for (const { command, title } of commands) {
    if (!palette.has(command)) {
      problems.push(
        `${EXTENSION_DIR}/package.json: ${command} is missing from menus.commandPalette.`
      );
    }
    if (!readme.includes(`\`${command}\``)) {
      problems.push(`${readmePath}: command ID ${command} is not documented.`);
    }
    if (!readme.includes(`**${title}**`)) {
      problems.push(`${readmePath}: command title "${title}" is not documented.`);
    }
  }
  for (const command of palette) {
    if (!commands.some((declared) => declared.command === command)) {
      problems.push(
        `${EXTENSION_DIR}/package.json: menus.commandPalette lists undeclared command ${command}.`
      );
    }
  }
  return problems;
}

/**
 * Checks that only the settings module reads settings, so other modules use its accessors. Every
 * extension source file is checked, in any subdirectory of `src/` except the tests, which set
 * settings directly.
 *
 * @param read Reads a repository file.
 * @param list Lists repository files.
 *
 * @returns The problems found.
 */
export function checkSettingsAccess(read: ReadFile, list: ListFiles): string[] {
  return (
    list(`${EXTENSION_DIR}/src`)
      .filter((file) => file.endsWith(".ts") && !file.startsWith(`${EXTENSION_DIR}/src/test/`))
      // A plain text search also catches calls on aliased imports such as `ws.getConfiguration(`.
      .filter((file) => file !== SETTINGS_MODULE && read(file).includes("getConfiguration("))
      .map(
        (file) =>
          `${file}: reads settings with getConfiguration(); use getConfig() from ${SETTINGS_MODULE}.`
      )
  );
}

/**
 * Checks that every name exported from the library's entry point is documented in its README.
 *
 * @param read Reads a repository file.
 *
 * @returns The problems found.
 */
export function checkLibraryExports(read: ReadFile): string[] {
  const index = read(`${LIBRARY_DIR}/src/index.ts`);
  const readmePath = `${LIBRARY_DIR}/README.md`;
  const readme = read(readmePath);
  const names = [...index.matchAll(/export (?:type )?\{([^}]*)\}/g)].flatMap(([, list]) =>
    list
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
  );
  return names
    .filter((name) => !readme.includes(`\`${name}\``) && !readme.includes(`\`${name}(`))
    .map((name) => `${readmePath}: export ${name} is not documented.`);
}

/**
 * Checks that every source file has a test file with the same base name.
 *
 * @param list Lists repository files.
 *
 * @returns The problems found.
 */
export function checkTestFiles(list: ListFiles): string[] {
  const groups = [
    { source: `${LIBRARY_DIR}/src`, tests: [`${LIBRARY_DIR}/src/test`] },
    {
      source: `${EXTENSION_DIR}/src`,
      tests: [`${EXTENSION_DIR}/src/test`, `${EXTENSION_DIR}/src/test/integration`],
    },
    { source: "scripts", tests: ["scripts/test"] },
  ];
  return groups.flatMap(({ source, tests }) => {
    const testNames = new Set(tests.flatMap((dir) => list(dir)).map((file) => path.basename(file)));
    return list(source)
      .filter((file) => path.posix.dirname(file) === source)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
      .filter((file) => !testNames.has(path.basename(file).replace(/\.ts$/, ".test.ts")))
      .map(
        (file) =>
          `${file}: no matching ${path.basename(file).replace(/\.ts$/, ".test.ts")} in ${tests.join(" or ")}.`
      );
  });
}

/**
 * Checks that each package ships the repository license.
 *
 * @param read Reads a repository file.
 *
 * @returns The problems found.
 */
export function checkPackages(read: ReadFile): string[] {
  const problems: string[] = [];
  // npm and vsce only ship a LICENSE from the package's own directory.
  for (const dir of [LIBRARY_DIR, EXTENSION_DIR]) {
    if (read(`${dir}/LICENSE`) !== read("LICENSE")) {
      problems.push(`${dir}/LICENSE differs from LICENSE; copy it again.`);
    }
  }
  return problems;
}

/**
 * Runs every consistency check.
 *
 * @param read Reads a repository file.
 * @param list Lists repository files.
 *
 * @returns The problems found.
 */
export function checkConsistency(read: ReadFile, list: ListFiles): string[] {
  return [
    ...checkSettings(read),
    ...checkCommands(read),
    ...checkSettingsAccess(read, list),
    ...checkLibraryExports(read),
    ...checkTestFiles(list),
    ...checkPackages(read),
  ];
}

/**
 * Prepares a fresh clone: installs the recommended VS Code extensions and builds everything.
 * Dependencies must already be installed; `npm install` also enables the Git hooks in `.husky/`
 * through the root `prepare` script.
 *
 * @param read Reads a repository file.
 * @param run Runs a command.
 * @param log Prints progress.
 */
export function setupDev(
  read: ReadFile,
  run: CommandRunner,
  log: (message: string) => void = console.log
): void {
  const { recommendations = [] }: { recommendations?: string[] } = JSON.parse(
    read(".vscode/extensions.json")
  );
  try {
    for (const extension of recommendations) {
      run("code", ["--install-extension", extension]);
    }
    log(`Installed recommended extensions: ${recommendations.join(", ")}.`);
  } catch (error: unknown) {
    log(
      `Could not install extensions with the code CLI (${error}). Install them from the ` +
        `Extensions view instead: ${recommendations.join(", ")}.`
    );
  }

  run("npm", ["run", "compile"]);
  log("Setup complete. Press F5 in VS Code to open the extension in a development window.");
}

if (require.main === module) {
  const root = path.resolve(
    __dirname,
    existsSync(path.join(__dirname, "../package.json")) ? ".." : "../.."
  );
  const read: ReadFile = (relativePath) => readFileSync(path.join(root, relativePath), "utf-8");
  // Missing directories are empty.
  const list: ListFiles = (relativeDir) => {
    const dir = path.join(root, relativeDir);
    return existsSync(dir)
      ? readdirSync(dir, { recursive: true, encoding: "utf-8" })
          .filter((name) => statSync(path.join(dir, name)).isFile())
          .map((name) => `${relativeDir}/${name.split(path.sep).join("/")}`)
      : [];
  };
  const [command = "check"] = process.argv.slice(2);
  try {
    if (command === "check") {
      const problems = checkConsistency(read, list);
      problems.forEach((problem) => console.error(problem));
      process.exitCode = problems.length > 0 ? 1 : 0;
    } else if (command === "setup") {
      setupDev(read, (executable, args): void => {
        const result = spawnSync(executable, args, {
          cwd: root,
          stdio: "inherit",
          // npm and code are .cmd shims on Windows.
          shell: process.platform === "win32",
        });
        if (result.error || result.status !== 0) {
          throw result.error ?? new Error(`${executable} exited with ${result.status}`);
        }
      });
    } else {
      throw new Error(`Unknown command ${command}. Use check or setup.`);
    }
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

import { expect } from "chai";
import { describe, it } from "mocha";
import * as sinon from "sinon";
import {
  checkCommands,
  checkLibraryExports,
  checkPackages,
  checkSettings,
  checkSettingsAccess,
  checkTestFiles,
  EXTENSION_DIR,
  LIBRARY_DIR,
  ListFiles,
  ReadFile,
  settingKey,
  SETTINGS_MODULE,
  setupDev,
} from "../dev";

/** A setting whose name, default, README row, and interface key all agree. */
const SETTING = "regexExplain.hover.enabled";

/** A command that is declared, in the palette, and documented. */
const COMMAND = { command: "regexExplain.explain", title: "Regex Explain: Explain Regex" };

/** Builds an extension manifest. */
function manifest(
  overrides: { settings?: object; commands?: object[]; palette?: object[] } = {}
): string {
  return JSON.stringify({
    version: "1.0.0",
    contributes: {
      commands: overrides.commands ?? [COMMAND],
      menus: { commandPalette: overrides.palette ?? [{ command: COMMAND.command }] },
      configuration: { properties: overrides.settings ?? { [SETTING]: { default: true } } },
    },
  });
}

/** An extension README that documents {@link SETTING} and {@link COMMAND}. */
const README = [
  `Run **${COMMAND.title}** (\`${COMMAND.command}\`).`,
  "",
  "| Setting | Default |",
  "| --- | --- |",
  `| \`${SETTING}\` | \`true\` |`,
].join("\n");

/** A settings module whose interface has the key for {@link SETTING}. */
const SETTINGS_SOURCE =
  "export interface RegexExplainConfiguration {\n  readonly hoverEnabled: boolean;\n}\n";

/** Builds a reader over an in-memory repository. */
function repo(files: Readonly<Record<string, string | undefined>>): ReadFile {
  const all: Record<string, string | undefined> = {
    [`${EXTENSION_DIR}/package.json`]: manifest(),
    [`${EXTENSION_DIR}/README.md`]: README,
    [SETTINGS_MODULE]: SETTINGS_SOURCE,
    ...files,
  };
  return (relativePath) => {
    const content = all[relativePath];
    if (content === undefined) {
      throw new Error(`Unexpected read of ${relativePath}`);
    }
    return content;
  };
}

/** Builds a directory lister over in-memory file lists. */
function tree(dirs: Record<string, string[]>): ListFiles {
  return (dir) => (dirs[dir] ?? []).map((name) => `${dir}/${name}`);
}

describe("settingKey", () => {
  [
    { name: "regexExplain.hover.enabled", expected: "hoverEnabled" },
    { name: "regexExplain.checkBacktracking", expected: "checkBacktracking" },
  ].forEach(({ name, expected }) => {
    it(`should map ${name} to ${expected}`, () => {
      // Act & Assert
      expect(settingKey(name)).to.equal(expected);
    });
  });
});

describe("checkSettings", () => {
  it("should pass when manifest, README, and interface agree", () => {
    // Act & Assert
    expect(checkSettings(repo({}))).to.deep.equal([]);
  });

  it("should read an array default listed one item per code span", () => {
    // Arrange
    const files = {
      [`${EXTENSION_DIR}/package.json`]: manifest({
        settings: { [SETTING]: { default: ["javascript", "python"] } },
      }),
      [`${EXTENSION_DIR}/README.md`]: `| \`${SETTING}\` | \`javascript\`<br>\`python\` | Help |`,
    };

    // Act & Assert
    expect(checkSettings(repo(files))).to.deep.equal([]);
  });

  [
    {
      name: "an array default missing an item",
      files: {
        [`${EXTENSION_DIR}/package.json`]: manifest({
          settings: { [SETTING]: { default: ["javascript", "python"] } },
        }),
        [`${EXTENSION_DIR}/README.md`]: `| \`${SETTING}\` | \`javascript\` | Help |`,
      },
      expected: /default is \["javascript"\], but package.json has \["javascript","python"\]/,
    },
    {
      name: "a README default that differs",
      files: { [`${EXTENSION_DIR}/README.md`]: README.replace("`true` |", "`false` |") },
      expected: /default is false, but package.json has true/,
    },
    {
      name: "a setting missing from the README",
      files: { [`${EXTENSION_DIR}/README.md`]: "" },
      expected: /missing from the settings table/,
    },
    {
      name: "a setting missing from the interface",
      files: { [SETTINGS_MODULE]: "export interface RegexExplainConfiguration {\n}\n" },
      expected: /RegexExplainConfiguration is missing hoverEnabled/,
    },
    {
      name: "an interface key the manifest does not define",
      files: {
        [`${EXTENSION_DIR}/package.json`]: manifest({ settings: {} }),
        [`${EXTENSION_DIR}/README.md`]: "",
      },
      expected: /has hoverEnabled, which package.json does not define/,
    },
  ].forEach(({ name, files, expected }) => {
    it(`should report ${name}`, () => {
      // Act
      const problems = checkSettings(repo(files));

      // Assert
      expect(problems.join("\n")).to.match(expected);
    });
  });
});

describe("checkCommands", () => {
  it("should pass when commands are declared, in the palette, and documented", () => {
    // Act & Assert
    expect(checkCommands(repo({}))).to.deep.equal([]);
  });

  [
    {
      name: "a command missing from the palette",
      files: { [`${EXTENSION_DIR}/package.json`]: manifest({ palette: [] }) },
      expected: /missing from menus.commandPalette/,
    },
    {
      name: "an undocumented command title",
      files: { [`${EXTENSION_DIR}/README.md`]: `\`${COMMAND.command}\`` },
      expected: /command title "Regex Explain: Explain Regex" is not documented/,
    },
    {
      name: "a palette entry for an undeclared command",
      files: {
        [`${EXTENSION_DIR}/package.json`]: manifest({
          palette: [{ command: COMMAND.command }, { command: "regexExplain.ghost" }],
        }),
      },
      expected: /lists undeclared command regexExplain.ghost/,
    },
  ].forEach(({ name, files, expected }) => {
    it(`should report ${name}`, () => {
      // Act
      const problems = checkCommands(repo(files));

      // Assert
      expect(problems.join("\n")).to.match(expected);
    });
  });
});

describe("checkSettingsAccess", () => {
  it("should report settings reads outside the settings module", () => {
    // Arrange
    const hover = `${EXTENSION_DIR}/src/hover.ts`;
    const read = repo({ [hover]: "vscode.workspace.getConfiguration('x');" });

    // Act
    const problems = checkSettingsAccess(read, [SETTINGS_MODULE, hover]);

    // Assert
    expect(problems).to.have.length(1);
    expect(problems[0]).to.match(/hover\.ts: reads settings/);
  });
});

describe("checkLibraryExports", () => {
  it("should report exports the README does not name", () => {
    // Arrange
    const read = repo({
      [`${LIBRARY_DIR}/src/index.ts`]:
        'export { explainRegex, hidden } from "./explainer";\nexport type { Shown } from "./x";',
      [`${LIBRARY_DIR}/README.md`]: "Call `explainRegex(pattern)`; it returns `Shown`.",
    });

    // Act
    const problems = checkLibraryExports(read);

    // Assert
    expect(problems).to.deep.equal([`${LIBRARY_DIR}/README.md: export hidden is not documented.`]);
  });
});

describe("checkTestFiles", () => {
  it("should accept unit and integration tests and report missing ones", () => {
    // Arrange
    const list = tree({
      [`${LIBRARY_DIR}/src`]: ["explainer.ts"],
      [`${LIBRARY_DIR}/src/test`]: ["explainer.test.ts"],
      [`${EXTENSION_DIR}/src`]: ["hover.ts", "targets.ts", "types.d.ts"],
      [`${EXTENSION_DIR}/src/test`]: ["targets.test.ts"],
      [`${EXTENSION_DIR}/src/test/integration`]: ["hover.test.ts"],
      scripts: ["dev.ts", "orphan.ts"],
      "scripts/test": ["dev.test.ts"],
    });

    // Act
    const problems = checkTestFiles(list);

    // Assert
    expect(problems).to.have.length(1);
    expect(problems[0]).to.match(/^scripts\/orphan\.ts: no matching orphan\.test\.ts/);
  });
});

describe("checkPackages", () => {
  /** Files for {@link checkPackages} with the given extension license text. */
  const packages = (license: string): ReadFile =>
    repo({
      LICENSE: "L",
      [`${LIBRARY_DIR}/LICENSE`]: "L",
      [`${EXTENSION_DIR}/LICENSE`]: license,
    });

  [
    { name: "matching licenses", read: packages("L"), expected: 0 },
    { name: "a stale license copy", read: packages("old"), expected: 1 },
  ].forEach(({ name, read, expected }) => {
    it(`should report ${expected} problem(s) for ${name}`, () => {
      // Act & Assert
      expect(checkPackages(read)).to.have.length(expected);
    });
  });
});

describe("setupDev", () => {
  it("should install recommended extensions and compile", () => {
    // Arrange
    const run = sinon.stub();
    const read = repo({ ".vscode/extensions.json": JSON.stringify({ recommendations: ["a.b"] }) });

    // Act
    setupDev(read, run, () => {});

    // Assert
    expect(run.args).to.deep.equal([
      ["code", ["--install-extension", "a.b"]],
      ["npm", ["run", "compile"]],
    ]);
  });

  it("should continue when the code CLI is unavailable", () => {
    // Arrange
    const run = sinon.stub();
    run.withArgs("code").throws(new Error("not found"));
    const log = sinon.stub();
    const read = repo({ ".vscode/extensions.json": JSON.stringify({ recommendations: ["a.b"] }) });

    // Act
    setupDev(read, run, log);

    // Assert
    expect(run.lastCall.args).to.deep.equal(["npm", ["run", "compile"]]);
    expect(log.calledWithMatch(/Could not install extensions/)).to.equal(true);
  });
});

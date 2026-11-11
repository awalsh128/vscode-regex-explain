/**
 * ESLint configuration for the repository.
 *
 * See https://eslint.style and https://typescript-eslint.io for additional linting options.
 */
// @ts-check
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import functional from "eslint-plugin-functional";
import mocha from "eslint-plugin-mocha";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/out", "**/dist", ".vscode-test", "**/*.vsix", ".stryker-tmp", "reports"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      "@stylistic": stylistic,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      curly: "warn",
      // A single group keeps imports contiguous: side effects, packages, absolute, then relative.
      "simple-import-sort/imports": ["warn", { groups: [["^\\u0000", "^@?\\w", "^", "^\\."]] }],
      "@stylistic/semi": ["warn", "always"],
      "@stylistic/max-len": [
        "warn",
        {
          code: 100,
          comments: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // The library's logic is kept free of side effects (see docs/AI_GUIDELINES.md), so it builds
    // new values rather than mutating arrays and objects. The rule needs type information to tell
    // arrays and objects from other types. Disable it on a line only for caches, with a comment.
    files: ["packages/regex-explain/src/**/*.ts"],
    ignores: ["**/test/**"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { functional },
    rules: { "functional/immutable-data": "error" },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { process: "readonly" } },
  },
  {
    files: ["**/test/**/*.ts"],
    ...mocha.configs.recommended,
    rules: {
      ...mocha.configs.recommended.rules,
      // Parameterized tests generate `it` calls in loops.
      "mocha/no-setup-in-describe": "off",
    },
  }
);

# Development Guidelines

These guidelines apply to every contributor, human or AI. [AGENTS.md](../AGENTS.md) holds the
repository policy for documentation, settings, commits, and validation; this file covers code and
tests.

## Checklist

- Every `.ts` file directly in a package's `src/` or in `scripts/` has a test file with the same
  base name (`npm run check` enforces this; `src/webview/` is not checked, but its extension-host
  modules still get tests in `src/test/`).
- [docs/SOURCE_CODE.md](SOURCE_CODE.md) is updated when files, modules, or data flow change.
- Package READMEs are updated when behavior or the API changes.
- This file is updated when patterns or testing standards change.

## Tests

### Location and framework

Tests use **Mocha**, **Chai** (`expect`), and **Sinon** (stubs).

| Source                                                    | Tests                                                                                      | Runs in         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| `packages/regex-explain/src/*.ts`                         | `packages/regex-explain/src/test/*.test.ts`                                                | Node            |
| `packages/vscode-regex-explain/src/*.ts`                  | `src/test/*.test.ts` if it does not import `vscode`, else `src/test/integration/*.test.ts` | Node or VS Code |
| `scripts/*.ts`                                            | `scripts/test/*.test.ts`                                                                   | Node (tsx)      |
| `packages/vscode-regex-explain/src/webview/main.ts`       | None; keep logic in testable modules such as `panel.ts`                                    | Webview         |
| `packages/vscode-regex-explain/src/webview/*.ts` (others) | `src/test/*.test.ts` if it does not import `vscode`, else `src/test/integration/*.test.ts` | Node or VS Code |

- `npm test` compiles, runs the Node unit tests, then runs the integration tests in a downloaded VS
  Code (`.vscode-test/`). Set `MOCHA_GREP` to run matching integration tests only.
- `npm run test:unit` runs only the Node tests, after `npm run compile`.
- `npm run test:scripts` runs the script tests directly from TypeScript.
- Shared helpers live in `testing.ts` next to the tests that use them. The integration launcher
  (`runTest.ts`) runs in plain Node, so anything it imports must not import `vscode`; shared paths
  live in `paths.ts` for that reason.

### Principles

1. **Arrange, Act, Assert.** Each `it` body marks its sections with `// Arrange`, `// Act`, and
   `// Assert` comments, or `// Act & Assert` when one expression does both.
2. **No logic in tests.** No conditionals, loops, or calculations inside `it`. Put repetition in
   parameterized cases instead.
3. **Parameterize similar cases.** Use `[...].forEach(({ input, expected }) => it(...))` with a
   descriptive, interpolated test name.
4. **DAMP over DRY.** Prefer a readable expected literal over a computed one. For explanation trees,
   compare the `outline()` lines from `packages/regex-explain/src/test/testing.ts` in full.
5. **Name irrelevant values.** Use module-level constants such as `NO_FLAGS` for inputs that do not
   affect the behavior under test.
6. **Abstract setup with helpers.** Use factories such as `openEditor()` and `repo()` rather than
   repeating setup.
7. **Test behavior, not implementation.** Assert on returned values and visible effects, not on
   private functions.

```ts
describe("describeCount", () => {
  [
    { min: 0, max: 1, expected: "optionally" },
    { min: 2, max: 3, expected: "between 2 and 3 times" },
  ].forEach(({ min, max, expected }) => {
    it(`should word {${min},${max}} as "${expected}"`, () => {
      // Act & Assert
      expect(describeCount(min, max)).to.equal(expected);
    });
  });
});
```

## TypeScript

- No `any`; use specific types, generics, or `unknown` with a type guard (see `isRegexSource` in the
  library).
- Declare return types on functions and methods.
- Prefer a functional style: small pure functions that take their inputs as parameters and return
  their result, `const` and `readonly` over reassigned and mutated values, and expressions that
  build new values over statements that change existing ones. Keep side effects (VS Code calls, file
  and process access, logging) at the edges, in the extension host and the scripts, and keep the
  library's logic free of them. ESLint's `functional/immutable-data` rejects mutated arrays, maps,
  and objects in the library's source. Disable it on a line only for a cache, with a comment saying
  so, as `RegexFinder` does in `packages/regex-explain/src/locator.ts`.
- Build collections with functions that return their result: `map`, `flatMap`, `filter`, `reduce`,
  or a recursive function that returns what it finds. Do not declare an array and then fill it from
  a closure or `forEach` callback; a reader has to track the outer variable, and the logic cannot be
  tested alone. A plain `for` loop that fills a local array is fine when the order of steps matters.
  Compare `flatten` in `packages/regex-explain/src/render.ts`.
- Handle `undefined` and `null` explicitly; the compiler runs in strict mode.
- Prefer `async`/`await`, and await or explicitly `void` every promise.
- The library returns errors as values (`RegexExplanationError`) rather than throwing, so callers
  can show them. Catch only around operations that throw, and keep the error's message.
- Register every VS Code disposable on `context.subscriptions`.

## Style

Follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).
Prettier formats code and Markdown (100 columns, double quotes, trailing commas in ES5 positions);
ESLint enforces the rest.

- Classes, interfaces, and types use `PascalCase`; functions and variables `camelCase`; module-level
  constants `CONSTANT_CASE`.
- File names are lowercase and match existing modules.
- Imports are sorted by `simple-import-sort` in one group: packages first, then relative modules.
  Run `npx eslint --fix` rather than ordering them by hand.

### Documentation comments

- Every exported function, class, and interface has a JSDoc comment: a summary sentence, then
  `@param` and `@returns` when it takes or returns values.
- Every interface member has a `/** ... */` comment.
- Service classes (providers, handlers) declare `private readonly` fields and document the
  constructor as `Constructs a new ClassName.` with `@param` tags. Compare with `RegexHoverProvider`
  in `packages/vscode-regex-explain/src/hover.ts`.
- Implementation comments explain why, not what.

## Dependencies

Prefer a maintained npm package that ships TypeScript types over hand-written parsing or analysis.
Before adding one, check its license (MIT, BSD, ISC, or Apache-2.0), types, maintenance, and bundle
size, and record why it was chosen in [docs/SOURCE_CODE.md](SOURCE_CODE.md#dependencies).

- Library runtime dependencies ship to npm users, so keep them few. They must work in Node and in
  bundlers. A large dependency that only one feature needs, such as `@vscode/tree-sitter-wasm` for
  `RegexFinder`, is an optional peer dependency imported on first use.
- Extension dependencies are bundled into `dist/extension.js`, or `dist/webview.js` for the panel
  script (WASM files are copied next to them by `bundle.mjs`), and listed as `devDependencies`.
- Build and test tools are root `devDependencies`.

The regex tooling in use (`@eslint-community/regexpp`, `regexp-ast-analysis`, `scslre`) shares one
AST, so new analysis should build on it rather than on a second parser.

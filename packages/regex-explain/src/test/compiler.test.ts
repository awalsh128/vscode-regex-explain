import { expect } from "chai";
import { describe, it } from "mocha";
import { GRAMMARS, SUPPORTED_LANGUAGE_IDS } from "../compiler";
import { findIn } from "./testing";

describe("LANGUAGES", () => {
  [
    {
      language: "javascript",
      source: 'new RegExp("x\\\\d+", "g"); RegExp(`a\\\\.b`);',
      expected: [
        { pattern: "x\\d+", flags: "g", text: '"x\\\\d+"' },
        { pattern: "a\\.b", flags: "", text: "`a\\\\.b`" },
      ],
    },
    {
      language: "typescript",
      source: "const re = /a\\/b[/]c/gi;",
      expected: [{ pattern: "a\\/b[/]c", flags: "gi", text: "/a\\/b[/]c/gi" }],
    },
    {
      language: "typescriptreact",
      source: "const el = <a title={/x/.source}>/not/</a>;",
      expected: [{ pattern: "x", flags: "", text: "/x/" }],
    },
    {
      language: "vue",
      source:
        '<template><p>/not/</p></template>\n<script setup lang="ts">\nconst r = /v+/;\n</script>',
      expected: [{ pattern: "v+", flags: "", text: "/v+/" }],
    },
    {
      language: "svelte",
      source: "<script>\nconst r = /s+/;\n</script>\n<p>/not/</p>",
      expected: [{ pattern: "s+", flags: "", text: "/s+/" }],
    },
    {
      language: "python",
      source: 'x = re.compile(r"\\d+", re.I)\ny = regex.match("a\\\\.b\\q", s)',
      expected: [
        { pattern: "\\d+", flags: "", text: 'r"\\d+"' },
        { pattern: "a\\.b\\q", flags: "", text: '"a\\\\.b\\q"' },
      ],
    },
    {
      language: "go",
      source: 'var r = regexp.MustCompile(`\\d+`)\nvar s, _ = regexp.Compile("a\\\\.b")',
      expected: [
        { pattern: "\\d+", flags: "", text: "`\\d+`" },
        { pattern: "a\\.b", flags: "", text: '"a\\\\.b"' },
      ],
    },
    {
      language: "rust",
      source: 'fn f() { Regex::new(r"\\d+"); regex::bytes::RegexBuilder::new(r#"a"b"#); }',
      expected: [
        { pattern: "\\d+", flags: "", text: 'r"\\d+"' },
        { pattern: 'a"b', flags: "", text: 'r#"a"b"#' },
      ],
    },
    {
      language: "java",
      source:
        'class A { Object p = Pattern.compile("\\\\d+"); Object q = s.replaceAll("x+", "y"); Object r = s.split(","); }',
      expected: [
        { pattern: "\\d+", flags: "", text: '"\\\\d+"' },
        { pattern: "x+", flags: "", text: '"x+"' },
        { pattern: ",", flags: "", text: '","' },
      ],
    },
    {
      language: "csharp",
      source:
        'class A { Regex r = new Regex(@"\\d+""x"); bool b = Regex.IsMatch(s, "a\\\\.b"); [GeneratedRegex("""a"b""")] partial Regex G(); }',
      expected: [
        { pattern: '\\d+"x', flags: "", text: '@"\\d+""x"' },
        { pattern: "a\\.b", flags: "", text: '"a\\\\.b"' },
        { pattern: 'a"b', flags: "", text: '"""a"b"""' },
      ],
    },
    {
      language: "ruby",
      source: 'r = /a\\/b/i\ns = %r{a/b}m\nt = Regexp.new("a\\\\d")',
      expected: [
        { pattern: "a\\/b", flags: "i", text: "/a\\/b/i" },
        { pattern: "a/b", flags: "s", text: "%r{a/b}m" },
        { pattern: "a\\d", flags: "", text: '"a\\\\d"' },
      ],
    },
    {
      language: "php",
      source: "<p>/not/</p><?php preg_match('/a\\d+/iu', $s); preg_replace(\"{x}\", '', $s);",
      expected: [
        { pattern: "a\\d+", flags: "i", text: "'/a\\d+/iu'" },
        { pattern: "x", flags: "", text: '"{x}"' },
      ],
    },
  ].forEach(({ language, source, expected }) => {
    it(`should find regexes in ${language}`, async () => {
      // Act
      const found = await findIn(source, language);

      // Assert
      expect(found).to.deep.equal(expected);
    });
  });

  [
    {
      language: "java",
      source: 'class A { Object p = Pattern.compile("a\\sb"); }',
      expected: "a b",
    },
    { language: "ruby", source: 'Regexp.new("a\\sb")', expected: "a b" },
    { language: "ruby", source: "Regexp.new('a\\sb')", expected: "a\\sb" },
    { language: "javascript", source: 'new RegExp("a\\sb")', expected: "asb" },
  ].forEach(({ language, source, expected }) => {
    it(`should decode ${source} in ${language} as ${JSON.stringify(expected)}`, async () => {
      // Act
      const [found] = await findIn(source, language);

      // Assert
      expect(found.pattern).to.equal(expected);
    });
  });

  [
    { name: "a Python f-string", language: "python", source: 're.compile(f"{x}+")' },
    { name: "a Ruby interpolation", language: "ruby", source: "r = /a#{b}/" },
    { name: "a PHP variable", language: "php", source: '<?php preg_match("/$x/", $s);' },
    { name: "a JavaScript substitution", language: "javascript", source: "RegExp(`${x}+`)" },
    {
      name: "a Java text block",
      language: "java",
      source: 'class A { Object p = Pattern.compile("""\n  x\n  """); }',
    },
    {
      name: "Matcher.replaceAll's replacement",
      language: "java",
      source: 'class A { Object r = m.replaceAll("$1"); }',
    },
    { name: "a Python \\N{...} escape", language: "python", source: 're.compile("\\N{DASH}")' },
    { name: "a call to another module", language: "python", source: 'os.split("a+")' },
  ].forEach(({ name, language, source }) => {
    it(`should skip ${name}`, async () => {
      // Act
      const found = await findIn(source, language);

      // Assert
      expect(found).to.deep.equal([]);
    });
  });
});

describe("GRAMMARS", () => {
  it("should list each grammar once", () => {
    // Act & Assert
    expect(GRAMMARS).to.deep.equal([
      "javascript",
      "typescript",
      "tsx",
      "python",
      "go",
      "rust",
      "java",
      "c-sharp",
      "ruby",
      "php",
    ]);
  });
});

describe("SUPPORTED_LANGUAGE_IDS", () => {
  it("should list the VS Code language IDs", () => {
    // Act & Assert
    expect(SUPPORTED_LANGUAGE_IDS).to.deep.equal([
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
      "vue",
      "svelte",
      "python",
      "go",
      "rust",
      "java",
      "csharp",
      "ruby",
      "php",
    ]);
  });
});

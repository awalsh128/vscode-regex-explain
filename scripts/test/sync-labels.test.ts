import { expect } from "chai";
import { describe, it } from "mocha";
import { needsUpdate, normalizeColor, parseLabelConfig, requireEnv } from "../sync-labels";

/** A configured label whose GitHub copy is in sync. */
const LABEL = { name: "bug", color: "#d73a4a", description: "Something isn't working" };

describe("normalizeColor", () => {
  [
    { color: "#d73a4a", expected: "d73a4a" },
    { color: "d73a4a", expected: "d73a4a" },
  ].forEach(({ color, expected }) => {
    it(`should normalize ${color}`, () => {
      // Act & Assert
      expect(normalizeColor(color)).to.equal(expected);
    });
  });
});

describe("requireEnv", () => {
  it("should return a set variable", () => {
    // Act & Assert
    expect(requireEnv("TOKEN", { TOKEN: "x" })).to.equal("x");
  });

  it("should throw for an unset variable", () => {
    // Act & Assert
    expect(() => requireEnv("TOKEN", {})).to.throw(/Missing required environment variable: TOKEN/);
  });
});

describe("parseLabelConfig", () => {
  it("should read the labels list", () => {
    // Arrange
    const yaml = 'labels:\n  - name: bug\n    color: "#d73a4a"\n';

    // Act
    const labels = parseLabelConfig(yaml);

    // Assert
    expect(labels).to.deep.equal([{ name: "bug", color: "#d73a4a" }]);
  });
});

describe("needsUpdate", () => {
  [
    { existing: { color: "d73a4a", description: LABEL.description }, expected: false },
    { existing: { color: "000000", description: LABEL.description }, expected: true },
    { existing: { color: "d73a4a", description: null }, expected: true },
  ].forEach(({ existing, expected }) => {
    it(`should return ${expected} for ${JSON.stringify(existing)}`, () => {
      // Act & Assert
      expect(needsUpdate(existing, LABEL)).to.equal(expected);
    });
  });
});

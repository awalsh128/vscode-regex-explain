import { expect } from "chai";
import { describe, it } from "mocha";
import { highlight } from "../webview/highlight";

describe("highlight", () => {
  it("should color each token in both themes", () => {
    // Act
    const html = highlight("[a-z]+");

    // Assert
    expect(html).to.equal(
      '<span style="--shiki-light:#D16969;--shiki-dark:#CE9178">[</span>' +
        '<span style="--shiki-light:#811F3F;--shiki-dark:#D16969">a-z</span>' +
        '<span style="--shiki-light:#D16969;--shiki-dark:#CE9178">]</span>' +
        '<span style="--shiki-light:#000000;--shiki-dark:#D7BA7D">+</span>'
    );
  });

  it("should escape markup in the pattern", () => {
    // Act
    const html = highlight("<b>&");

    // Assert
    expect(html).to.equal(
      '<span style="--shiki-light:#000000;--shiki-dark:#D4D4D4">&#x3C;b>&#x26;</span>'
    );
  });

  it("should return no markup for an empty pattern", () => {
    // Act & Assert
    expect(highlight("")).to.equal("");
  });
});

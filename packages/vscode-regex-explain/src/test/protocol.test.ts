import { expect } from "chai";
import { describe, it } from "mocha";
import { isMatchMessage } from "../webview/protocol";

describe("isMatchMessage", () => {
  [
    { value: { type: "match", id: 1, text: "abc", entries: false }, expected: true },
    { value: { type: "match", id: 1, text: "abc", entries: true }, expected: true },
    { value: { type: "match", id: 1, text: "abc" }, expected: false },
    { value: { type: "match", id: "1", text: "abc", entries: false }, expected: false },
    { value: { type: "matches", id: 1, text: "abc" }, expected: false },
    { value: { type: "match", id: 1 }, expected: false },
    { value: undefined, expected: false },
  ].forEach(({ value, expected }) => {
    it(`should return ${expected} for ${JSON.stringify(value)}`, () => {
      // Act & Assert
      expect(isMatchMessage(value)).to.equal(expected);
    });
  });
});

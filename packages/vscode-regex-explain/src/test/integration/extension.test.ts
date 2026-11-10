import { expect } from "chai";
import { describe, it } from "mocha";
import * as vscode from "vscode";
import { EXPLAIN_COMMAND } from "../../preview";
import { activateExtension } from "./testing";

describe("extension", () => {
  it("should activate", async () => {
    // Act
    const extension = await activateExtension();

    // Assert
    expect(extension.isActive).to.equal(true);
  });

  it("should register the explain command", async () => {
    // Arrange
    await activateExtension();

    // Act
    const commands = await vscode.commands.getCommands(true);

    // Assert
    expect(commands).to.include(EXPLAIN_COMMAND);
  });
});

import { expect } from "chai";
import { describe, it } from "mocha";
import { DEFAULT_CONFIGURATION, getConfig, SECTION } from "../../configuration";
import {
  activateExtension,
  openEditor,
  OVERRIDE_LANGUAGE,
  setLanguageSetting,
  setSetting,
} from "./testing";

/** The manifest's setting declarations. */
type ManifestProperties = Record<string, { default: unknown }>;

describe("getConfig", () => {
  it("should return the defaults when nothing is set", () => {
    // Act
    const config = getConfig();

    // Assert
    expect(config).to.deep.equal(DEFAULT_CONFIGURATION);
  });

  it("should use the same defaults as package.json", async () => {
    // Arrange
    const extension = await activateExtension();
    const properties: ManifestProperties =
      extension.packageJSON.contributes.configuration.properties;

    // Act
    const manifestDefaults = {
      hoverEnabled: properties[`${SECTION}.hover.enabled`].default,
      hoverLanguages: properties[`${SECTION}.hover.languages`].default,
      checkBacktracking: properties[`${SECTION}.checkBacktracking`].default,
      panelFollow: properties[`${SECTION}.panel.follow`].default,
    };

    // Assert
    expect(manifestDefaults).to.deep.equal(DEFAULT_CONFIGURATION);
  });

  [
    { key: "hover.enabled", value: false, field: "hoverEnabled" },
    { key: "hover.languages", value: ["python"], field: "hoverLanguages" },
    { key: "checkBacktracking", value: false, field: "checkBacktracking" },
    { key: "panel.follow", value: false, field: "panelFollow" },
  ].forEach(({ key, value, field }) => {
    it(`should read ${SECTION}.${key}`, async () => {
      // Arrange
      await setSetting(key, value);

      // Act
      const config = getConfig();

      // Assert
      expect(config).to.have.deep.property(field, value);
    });
  });

  it("should apply language-specific overrides to documents in that language", async () => {
    // Arrange
    await setLanguageSetting("hover.enabled", false);
    const overridden = await openEditor("/a/", OVERRIDE_LANGUAGE);
    const other = await openEditor("/a/", "javascript");

    // Act
    const overriddenConfig = getConfig(overridden.document);
    const otherConfig = getConfig(other.document);

    // Assert
    expect(overriddenConfig.hoverEnabled).to.equal(false);
    expect(otherConfig.hoverEnabled).to.equal(true);
  });
});

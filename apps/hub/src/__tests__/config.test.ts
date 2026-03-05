import { afterEach, describe, expect, it } from "vitest";
import { getHubConfig } from "../config.js";

afterEach(() => {
  delete process.env.HUB_PROFILE;
  delete process.env.NODE_ENV;
  delete process.env.HUB_ENABLED_PROVIDERS;
  delete process.env.HUB_REQUIRE_PROVIDER_SECRETS;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.HUB_PORT;
  delete process.env.TERMINAL_CONFIRM_REQUIRED;
});

describe("hub config", () => {
  it("loads defaults for development profile", () => {
    process.env.HUB_PROFILE = "development";
    const config = getHubConfig();
    expect(config.profile).toBe("development");
    expect(config.server.port).toBe(3000);
    expect(config.security.terminalConfirmRequired).toBe(true);
    expect(config.providers.enabled).toContain("mock");
  });

  it("enforces provider secret checks when required", () => {
    process.env.HUB_PROFILE = "production";
    process.env.HUB_ENABLED_PROVIDERS = "chatgpt";
    process.env.HUB_REQUIRE_PROVIDER_SECRETS = "true";

    expect(() => getHubConfig()).toThrow("Missing required provider secrets");

    process.env.OPENAI_API_KEY = "test-key";
    expect(() => getHubConfig()).not.toThrow();
  });

  it("parses provider and boolean settings", () => {
    process.env.HUB_ENABLED_PROVIDERS = "mock,chatgpt";
    process.env.TERMINAL_CONFIRM_REQUIRED = "false";
    process.env.HUB_PORT = "4321";

    const config = getHubConfig();
    expect(config.providers.enabled).toEqual(["mock", "chatgpt"]);
    expect(config.security.terminalConfirmRequired).toBe(false);
    expect(config.server.port).toBe(4321);
  });
});

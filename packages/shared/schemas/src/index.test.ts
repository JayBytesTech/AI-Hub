import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { schemaPaths } from "./index";

const schemaFiles = [
  ["toolRequest", new URL("../schemas/tool-request.schema.json", import.meta.url)],
  ["toolResponse", new URL("../schemas/tool-response.schema.json", import.meta.url)],
  ["wsEvent", new URL("../schemas/ws-event.schema.json", import.meta.url)],
  ["hubHealthResponse", new URL("../schemas/hub-health-response.schema.json", import.meta.url)],
  ["hubProvidersResponse", new URL("../schemas/hub-providers-response.schema.json", import.meta.url)],
  ["hubTerminalAuditResponse", new URL("../schemas/hub-terminal-audit-response.schema.json", import.meta.url)],
  ["hubWsEvent", new URL("../schemas/hub-ws-event.schema.json", import.meta.url)]
] as const;

describe("schemaPaths", () => {
  it("exports stable schema locations", () => {
    expect(schemaPaths.toolRequest).toBe("packages/shared/schemas/schemas/tool-request.schema.json");
    expect(schemaPaths.toolResponse).toBe("packages/shared/schemas/schemas/tool-response.schema.json");
    expect(schemaPaths.wsEvent).toBe("packages/shared/schemas/schemas/ws-event.schema.json");
    expect(schemaPaths.hubHealthResponse).toBe(
      "packages/shared/schemas/schemas/hub-health-response.schema.json"
    );
    expect(schemaPaths.hubProvidersResponse).toBe(
      "packages/shared/schemas/schemas/hub-providers-response.schema.json"
    );
    expect(schemaPaths.hubTerminalAuditResponse).toBe(
      "packages/shared/schemas/schemas/hub-terminal-audit-response.schema.json"
    );
    expect(schemaPaths.hubWsEvent).toBe("packages/shared/schemas/schemas/hub-ws-event.schema.json");
  });

  it("points to valid JSON schema files", async () => {
    for (const [name, fileUrl] of schemaFiles) {
      const raw = await readFile(fileUrl, "utf-8");
      const parsed = JSON.parse(raw) as { $schema?: string; type?: string; oneOf?: unknown[] };
      expect(parsed.$schema, `${name} should define JSON schema version`).toBeTypeOf("string");
      expect(
        typeof parsed.type === "string" || Array.isArray(parsed.oneOf),
        `${name} should declare a root type or oneOf schema`
      ).toBe(true);
    }
  });
});

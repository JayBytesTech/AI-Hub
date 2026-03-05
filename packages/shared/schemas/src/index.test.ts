import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { schemaPaths } from "./index";

const schemaFiles = [
  ["toolRequest", new URL("../schemas/tool-request.schema.json", import.meta.url)],
  ["toolResponse", new URL("../schemas/tool-response.schema.json", import.meta.url)],
  ["wsEvent", new URL("../schemas/ws-event.schema.json", import.meta.url)]
] as const;

describe("schemaPaths", () => {
  it("exports stable schema locations", () => {
    expect(schemaPaths.toolRequest).toBe("packages/shared/schemas/schemas/tool-request.schema.json");
    expect(schemaPaths.toolResponse).toBe("packages/shared/schemas/schemas/tool-response.schema.json");
    expect(schemaPaths.wsEvent).toBe("packages/shared/schemas/schemas/ws-event.schema.json");
  });

  it("points to valid JSON schema files", async () => {
    for (const [name, fileUrl] of schemaFiles) {
      const raw = await readFile(fileUrl, "utf-8");
      const parsed = JSON.parse(raw) as { $schema?: string; type?: string };
      expect(parsed.$schema, `${name} should define JSON schema version`).toBeTypeOf("string");
      expect(parsed.type, `${name} should declare a root type`).toBeTypeOf("string");
    }
  });
});

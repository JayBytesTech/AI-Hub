import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { App } from "./App";

describe("App", () => {
  it("renders the shell and chat composer", () => {
    const markup = renderToString(<App />);
    expect(markup).toContain("AI Hub");
    expect(markup).toContain("Provider");
    expect(markup).toContain("Ask the hub...");
  });
});

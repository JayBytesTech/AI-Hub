import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { getProvider } from "../providers/index.js";
import { ProviderError } from "../providers/reliability.js";
import type { TerminalManager } from "../terminal/manager.js";
import type { Db } from "../storage/db.js";

type StreamRequest = {
  runId?: string;
  prompt?: string;
  provider?: string;
  threadId?: string;
  workspaceId?: string;
  artifactIds?: string[];
};

export async function registerWs(app: FastifyInstance, terminalManager: TerminalManager, db: Db) {
  app.get("/stream", { websocket: true }, (socket) => {
    socket.on("message", async (raw: unknown) => {
      let payload: StreamRequest = {};
      try {
        const text =
          typeof raw === "string"
            ? raw
            : Buffer.isBuffer(raw)
              ? raw.toString("utf-8")
              : String(raw);
        payload = JSON.parse(text) as StreamRequest;
      } catch {
        socket.send(JSON.stringify({ error: "invalid JSON payload" }));
        return;
      }

      const runId = payload.runId ?? randomUUID();
      let prompt = payload.prompt ?? "";
      const providerName = payload.provider;
      try {
        const artifactIds = Array.isArray(payload.artifactIds) ? payload.artifactIds : [];
        if (artifactIds.length > 0) {
          const placeholders = artifactIds.map(() => "?").join(", ");
          const rows = db
            .prepare(
              `SELECT id, workspace_id, type, title, content FROM artifacts WHERE id IN (${placeholders})`
            )
            .all(...artifactIds) as Array<{
              id: string;
              workspace_id: string;
              type: string;
              title: string;
              content: string;
            }>;

          const filteredRows = payload.workspaceId
            ? rows.filter((row) => row.workspace_id === payload.workspaceId)
            : rows;

          if (filteredRows.length > 0) {
            const artifactContext = filteredRows
              .map(
                (item, index) =>
                  `Artifact ${index + 1} [${item.type}] ${item.title} (${item.id}):\n${item.content}`
              )
              .join("\n\n");
            prompt = `Use the following artifacts as context:\n\n${artifactContext}\n\nUser prompt:\n${prompt}`;
          }
        }

        const provider = getProvider(providerName);
        socket.send(JSON.stringify({ type: "chat.stream.start", runId, provider: provider.name }));

        for await (const token of provider.stream({
          runId,
          prompt,
          threadId: payload.threadId,
          workspaceId: payload.workspaceId
        })) {
          socket.send(
            JSON.stringify({
              type: "chat.stream.delta",
              runId,
              content: token
            })
          );
        }

        socket.send(JSON.stringify({ type: "chat.stream.end", runId }));
      } catch (error) {
        const normalized =
          error instanceof ProviderError
            ? {
                message: error.message,
                code: error.code,
                retryable: error.retryable,
                statusCode: error.statusCode,
                provider: error.provider
              }
            : {
                message: error instanceof Error ? error.message : "provider streaming failed",
                code: "unknown",
                retryable: false,
                statusCode: null,
                provider: providerName ?? "unknown"
              };
        socket.send(
          JSON.stringify({
            type: "chat.stream.error",
            runId,
            error: normalized.message,
            errorCode: normalized.code,
            retryable: normalized.retryable,
            statusCode: normalized.statusCode,
            provider: normalized.provider
          })
        );
      }
    });
  });

  app.get("/terminal/stream", { websocket: true }, (socket) => {
    let subscribedSessionId: string | null = null;

    const unsubscribe = terminalManager.subscribe((event) => {
      if (!subscribedSessionId || event.sessionId !== subscribedSessionId) {
        return;
      }
      socket.send(JSON.stringify(event));
    });

    socket.on("message", (raw: unknown) => {
      let payload: { sessionId?: string } = {};
      try {
        const text =
          typeof raw === "string"
            ? raw
            : Buffer.isBuffer(raw)
              ? raw.toString("utf-8")
              : String(raw);
        payload = JSON.parse(text) as { sessionId?: string };
      } catch {
        socket.send(JSON.stringify({ error: "invalid JSON payload" }));
        return;
      }

      if (!payload.sessionId) {
        socket.send(JSON.stringify({ error: "sessionId is required" }));
        return;
      }
      if (!terminalManager.hasSession(payload.sessionId)) {
        socket.send(JSON.stringify({ error: "terminal session not found" }));
        return;
      }

      subscribedSessionId = payload.sessionId;
      const output = terminalManager.getOutput(subscribedSessionId, 200);
      socket.send(
        JSON.stringify({
          type: "terminal.backlog",
          sessionId: subscribedSessionId,
          output
        })
      );
    });

    socket.on("close", () => {
      unsubscribe();
    });
  });
}

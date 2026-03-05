import { randomUUID } from "node:crypto";
import { getProvider } from "../providers/index.js";
export async function registerWs(app) {
    app.get("/stream", { websocket: true }, (socket) => {
        socket.on("message", async (raw) => {
            let payload = {};
            try {
                const text = typeof raw === "string"
                    ? raw
                    : Buffer.isBuffer(raw)
                        ? raw.toString("utf-8")
                        : String(raw);
                payload = JSON.parse(text);
            }
            catch {
                socket.send(JSON.stringify({ error: "invalid JSON payload" }));
                return;
            }
            const runId = payload.runId ?? randomUUID();
            const prompt = payload.prompt ?? "";
            try {
                const provider = getProvider(payload.provider);
                socket.send(JSON.stringify({ type: "chat.stream.start", runId, provider: provider.name }));
                for await (const token of provider.stream({
                    runId,
                    prompt,
                    threadId: payload.threadId,
                    workspaceId: payload.workspaceId
                })) {
                    socket.send(JSON.stringify({
                        type: "chat.stream.delta",
                        runId,
                        content: token
                    }));
                }
                socket.send(JSON.stringify({ type: "chat.stream.end", runId }));
            }
            catch (error) {
                socket.send(JSON.stringify({
                    type: "chat.stream.error",
                    runId,
                    error: error instanceof Error ? error.message : "provider streaming failed"
                }));
            }
        });
    });
}

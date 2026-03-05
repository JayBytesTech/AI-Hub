import { FormEvent, useEffect, useMemo, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ProvidersResponse = { data: string[] };

const HUB_HTTP_BASE = import.meta.env.VITE_HUB_HTTP_BASE ?? "http://localhost:3000/v1";
const HUB_WS_BASE = import.meta.env.VITE_HUB_WS_BASE ?? "ws://localhost:3000/v1/stream";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function App() {
  const [providers, setProviders] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("mock");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [health, setHealth] = useState<"loading" | "ok" | "down">("loading");
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    fetch(`${HUB_HTTP_BASE}/health`)
      .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));

    fetch(`${HUB_HTTP_BASE}/providers`)
      .then((resp) => resp.json() as Promise<ProvidersResponse>)
      .then((data) => {
        setProviders(data.data);
        if (data.data.length > 0) {
          setSelectedProvider(data.data[0]);
        }
      })
      .catch(() => setProviders(["mock"]));
  }, []);

  const canSend = useMemo(
    () => prompt.trim().length > 0 && !isStreaming && health === "ok",
    [prompt, isStreaming, health]
  );

  const sendPrompt = (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const runId = uniqueId();
    const userMessage: ChatMessage = { id: uniqueId(), role: "user", content: prompt.trim() };
    const assistantId = uniqueId();

    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setPrompt("");
    setIsStreaming(true);

    const socket = new WebSocket(HUB_WS_BASE);
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          runId,
          provider: selectedProvider,
          prompt: userMessage.content
        })
      );
    });

    socket.addEventListener("message", (messageEvent) => {
      const eventData = JSON.parse(messageEvent.data) as {
        type?: string;
        runId?: string;
        content?: string;
        error?: string;
        errorCode?: string;
        retryable?: boolean;
        provider?: string;
      };

      if (eventData.runId !== runId) {
        return;
      }

      if (eventData.type === "chat.stream.delta") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, content: msg.content + (eventData.content ?? "") } : msg
          )
        );
      }

      if (eventData.type === "chat.stream.end" || eventData.type === "chat.stream.error") {
        if (eventData.type === "chat.stream.error") {
          const details = [
            eventData.provider ? `provider=${eventData.provider}` : null,
            eventData.errorCode ? `code=${eventData.errorCode}` : null,
            eventData.retryable !== undefined ? `retryable=${String(eventData.retryable)}` : null
          ]
            .filter((part) => part !== null)
            .join(", ");
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: `${msg.content}\n[error] ${eventData.error ?? "unknown error"}${
                      details.length > 0 ? ` (${details})` : ""
                    }`
                  }
                : msg
            )
          );
        }
        setIsStreaming(false);
        socket.close();
      }
    });

    socket.addEventListener("error", () => {
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: `${msg.content}\n[error] websocket connection failed` } : msg
        )
      );
      socket.close();
    });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>AI Hub</h1>
        <p className={`status status-${health}`}>Hub: {health}</p>
        <label htmlFor="provider-select">Provider</label>
        <select
          id="provider-select"
          value={selectedProvider}
          onChange={(event) => setSelectedProvider(event.target.value)}
          disabled={providers.length === 0}
        >
          {providers.map((provider) => (
            <option value={provider} key={provider}>
              {provider}
            </option>
          ))}
        </select>
      </aside>

      <main className="chat-panel">
        <div className="messages">
          {messages.length === 0 ? <p className="empty">Send a prompt to start a thread.</p> : null}
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <header>{message.role}</header>
              <pre>{message.content}</pre>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={sendPrompt}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask the hub..."
            rows={3}
          />
          <button type="submit" disabled={!canSend}>
            {isStreaming ? "Streaming..." : "Send"}
          </button>
        </form>
      </main>
    </div>
  );
}

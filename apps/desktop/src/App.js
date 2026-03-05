import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
const HUB_HTTP_BASE = import.meta.env.VITE_HUB_HTTP_BASE ?? "http://localhost:3000/v1";
const HUB_WS_BASE = import.meta.env.VITE_HUB_WS_BASE ?? "ws://localhost:3000/v1/stream";
function uniqueId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
export function App() {
    const [providers, setProviders] = useState([]);
    const [selectedProvider, setSelectedProvider] = useState("mock");
    const [prompt, setPrompt] = useState("");
    const [messages, setMessages] = useState([]);
    const [health, setHealth] = useState("loading");
    const [isStreaming, setIsStreaming] = useState(false);
    useEffect(() => {
        fetch(`${HUB_HTTP_BASE}/health`)
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then(() => setHealth("ok"))
            .catch(() => setHealth("down"));
        fetch(`${HUB_HTTP_BASE}/providers`)
            .then((resp) => resp.json())
            .then((data) => {
            setProviders(data.data);
            if (data.data.length > 0) {
                setSelectedProvider(data.data[0]);
            }
        })
            .catch(() => setProviders(["mock"]));
    }, []);
    const canSend = useMemo(() => prompt.trim().length > 0 && !isStreaming && health === "ok", [prompt, isStreaming, health]);
    const sendPrompt = (event) => {
        event.preventDefault();
        if (!canSend) {
            return;
        }
        const runId = uniqueId();
        const userMessage = { id: uniqueId(), role: "user", content: prompt.trim() };
        const assistantId = uniqueId();
        setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "" }]);
        setPrompt("");
        setIsStreaming(true);
        const socket = new WebSocket(HUB_WS_BASE);
        socket.addEventListener("open", () => {
            socket.send(JSON.stringify({
                runId,
                provider: selectedProvider,
                prompt: userMessage.content
            }));
        });
        socket.addEventListener("message", (messageEvent) => {
            const eventData = JSON.parse(messageEvent.data);
            if (eventData.runId !== runId) {
                return;
            }
            if (eventData.type === "chat.stream.delta") {
                setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, content: msg.content + (eventData.content ?? "") } : msg));
            }
            if (eventData.type === "chat.stream.end" || eventData.type === "chat.stream.error") {
                if (eventData.type === "chat.stream.error") {
                    setMessages((prev) => prev.map((msg) => msg.id === assistantId
                        ? { ...msg, content: `${msg.content}\n[error] ${eventData.error ?? "unknown error"}` }
                        : msg));
                }
                setIsStreaming(false);
                socket.close();
            }
        });
        socket.addEventListener("error", () => {
            setIsStreaming(false);
            setMessages((prev) => prev.map((msg) => msg.id === assistantId ? { ...msg, content: `${msg.content}\n[error] websocket connection failed` } : msg));
            socket.close();
        });
    };
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("h1", { children: "AI Hub" }), _jsxs("p", { className: `status status-${health}`, children: ["Hub: ", health] }), _jsx("label", { htmlFor: "provider-select", children: "Provider" }), _jsx("select", { id: "provider-select", value: selectedProvider, onChange: (event) => setSelectedProvider(event.target.value), disabled: providers.length === 0, children: providers.map((provider) => (_jsx("option", { value: provider, children: provider }, provider))) })] }), _jsxs("main", { className: "chat-panel", children: [_jsxs("div", { className: "messages", children: [messages.length === 0 ? _jsx("p", { className: "empty", children: "Send a prompt to start a thread." }) : null, messages.map((message) => (_jsxs("article", { className: `message ${message.role}`, children: [_jsx("header", { children: message.role }), _jsx("pre", { children: message.content })] }, message.id)))] }), _jsxs("form", { className: "composer", onSubmit: sendPrompt, children: [_jsx("textarea", { value: prompt, onChange: (event) => setPrompt(event.target.value), placeholder: "Ask the hub...", rows: 3 }), _jsx("button", { type: "submit", disabled: !canSend, children: isStreaming ? "Streaming..." : "Send" })] })] })] }));
}

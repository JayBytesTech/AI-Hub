function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class MockProvider {
    name = "mock";
    async *stream(request) {
        const prompt = request.prompt.trim();
        const base = prompt.length > 0
            ? `Mock response for: ${prompt}`
            : "Mock response: send a prompt to receive token deltas.";
        const tokens = base.split(/\s+/);
        for (const token of tokens) {
            await sleep(70);
            yield `${token} `;
        }
    }
}

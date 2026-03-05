export type StreamRequest = {
  runId: string;
  prompt: string;
  threadId?: string;
  workspaceId?: string;
};

export interface ChatProvider {
  readonly name: string;
  stream(request: StreamRequest): AsyncGenerator<string, void, void>;
}


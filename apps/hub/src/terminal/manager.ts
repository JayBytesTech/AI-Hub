import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type StreamKind = "stdout" | "stderr";

export type TerminalOutputChunk = {
  stream: StreamKind;
  chunk: string;
  timestamp: number;
};

export type TerminalEvent =
  | {
      type: "terminal.start";
      sessionId: string;
      workspaceId: string;
      timestamp: number;
    }
  | {
      type: "terminal.output";
      sessionId: string;
      stream: StreamKind;
      chunk: string;
      timestamp: number;
    }
  | {
      type: "terminal.exit";
      sessionId: string;
      code: number | null;
      signal: NodeJS.Signals | null;
      timestamp: number;
    };

type TerminalSession = {
  id: string;
  workspaceId: string;
  cwd: string;
  shell: string;
  startedAt: number;
  active: boolean;
  process: ChildProcessWithoutNullStreams;
  output: TerminalOutputChunk[];
};

function getDefaultShell() {
  return process.platform === "win32" ? "powershell" : "bash";
}

function getDefaultShellArgs(shell: string) {
  if (shell.toLowerCase().includes("powershell")) {
    return ["-NoLogo", "-NoProfile"];
  }
  return [];
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private emitter = new EventEmitter();

  createSession(input: { workspaceId: string; cwd: string; shell?: string }) {
    const sessionId = randomUUID();
    const shell = input.shell && input.shell.length > 0 ? input.shell : getDefaultShell();
    const args = getDefaultShellArgs(shell);

    const child = spawn(shell, args, {
      cwd: input.cwd,
      stdio: "pipe"
    });

    const session: TerminalSession = {
      id: sessionId,
      workspaceId: input.workspaceId,
      cwd: input.cwd,
      shell,
      startedAt: Date.now(),
      active: true,
      process: child,
      output: []
    };
    this.sessions.set(sessionId, session);

    this.emit({
      type: "terminal.start",
      sessionId,
      workspaceId: input.workspaceId,
      timestamp: Date.now()
    });

    child.stdout.on("data", (data) => this.pushOutput(sessionId, "stdout", data.toString("utf-8")));
    child.stderr.on("data", (data) => this.pushOutput(sessionId, "stderr", data.toString("utf-8")));
    child.on("exit", (code, signal) => {
      const current = this.sessions.get(sessionId);
      if (current) {
        current.active = false;
      }
      this.emit({
        type: "terminal.exit",
        sessionId,
        code,
        signal,
        timestamp: Date.now()
      });
    });

    return {
      id: session.id,
      workspaceId: session.workspaceId,
      cwd: session.cwd,
      shell: session.shell,
      startedAt: session.startedAt,
      active: session.active
    };
  }

  listSessions() {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      workspaceId: session.workspaceId,
      cwd: session.cwd,
      shell: session.shell,
      startedAt: session.startedAt,
      active: session.active
    }));
  }

  hasSession(sessionId: string) {
    return this.sessions.has(sessionId);
  }

  writeInput(sessionId: string, input: string, appendNewline: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("terminal session not found");
    }
    if (!session.active) {
      throw new Error("terminal session is not active");
    }

    session.process.stdin.write(appendNewline ? `${input}\n` : input);
  }

  stopSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("terminal session not found");
    }

    if (session.active) {
      session.process.kill();
      session.active = false;
    }
  }

  getOutput(sessionId: string, limit: number) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("terminal session not found");
    }

    return session.output.slice(-Math.max(1, limit));
  }

  subscribe(listener: (event: TerminalEvent) => void) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  private pushOutput(sessionId: string, stream: StreamKind, chunk: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const item: TerminalOutputChunk = {
      stream,
      chunk,
      timestamp: Date.now()
    };
    session.output.push(item);
    if (session.output.length > 2000) {
      session.output.splice(0, session.output.length - 2000);
    }

    this.emit({
      type: "terminal.output",
      sessionId,
      stream,
      chunk,
      timestamp: item.timestamp
    });
  }

  private emit(event: TerminalEvent) {
    this.emitter.emit("event", event);
  }
}


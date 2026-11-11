// A small client for the ModelBrain helper program. It starts the helper as
// a child process and exchanges one JSON message per line, which is how every
// assistant talks to ModelBrain. Nothing here opens a network connection.
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

/** The two timer functions the client needs. In Obsidian these are the window's. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
}

interface RpcMessage {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolResult {
  content?: { type: string; text?: string }[];
  isError?: boolean;
  structuredContent?: unknown;
}

export class ToolError extends Error {}

export class McpClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private starting: Promise<void> | null = null;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly clientVersion: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly timers: Timers = window
  ) {}

  get running(): boolean {
    return this.proc !== null;
  }

  private start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const proc = spawn(this.command, this.args, { env: this.env, stdio: ["pipe", "pipe", "pipe"] });
      this.proc = proc;
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => this.onData(chunk));
      proc.stderr.on("data", () => {
        // The helper logs to stderr. It is not part of the conversation.
      });
      const fail = (err: Error) => this.onClosed(err);
      proc.on("error", fail);
      proc.on("exit", (code) => fail(new Error(`ModelBrain helper stopped (exit ${code ?? "unknown"}).`)));
      proc.stdin.on("error", fail);
      await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "Obsidian", version: this.clientVersion },
      });
      this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    })();
    this.starting.catch(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.onLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string): void {
    let msg: RpcMessage;
    try {
      msg = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }
    if (typeof msg.id !== "number") return;
    const waiter = this.pending.get(msg.id);
    if (!waiter) return;
    this.pending.delete(msg.id);
    this.timers.clearTimeout(waiter.timer);
    if (msg.error) waiter.reject(new Error(msg.error.message));
    else waiter.resolve(msg.result);
  }

  private onClosed(err: Error): void {
    if (!this.proc) return;
    this.proc = null;
    this.starting = null;
    this.buffer = "";
    for (const waiter of this.pending.values()) {
      this.timers.clearTimeout(waiter.timer);
      waiter.reject(err);
    }
    this.pending.clear();
  }

  private send(message: object): void {
    if (!this.proc) throw new Error("ModelBrain helper is not running.");
    this.proc.stdin.write(JSON.stringify(message) + "\n");
  }

  private request(method: string, params: object, timeoutMs = 30000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = this.timers.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("ModelBrain did not answer in time."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ jsonrpc: "2.0", id, method, params });
      } catch (err) {
        this.pending.delete(id);
        this.timers.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** Calls one ModelBrain tool and returns its answer as parsed JSON when it is JSON. */
  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    await this.start();
    const result = (await this.request("tools/call", { name, arguments: args }, timeoutMs)) as ToolResult;
    const text = (result.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n");
    if (result.isError) throw new ToolError(text || `ModelBrain refused the ${name} request.`);
    if (result.structuredContent !== undefined) return result.structuredContent as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  stop(): void {
    const proc = this.proc;
    this.onClosed(new Error("ModelBrain helper was stopped."));
    if (proc) {
      proc.removeAllListeners();
      proc.stdin.end();
      proc.kill();
    }
  }
}

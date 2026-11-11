import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { McpClient, Timers, ToolError } from "../src/client";

const nodeTimers = { setTimeout, clearTimeout } as unknown as Timers;

const fake = path.resolve(__dirname, "..", "test", "fake-server.cjs");
const make = (mode = "ok") => new McpClient(process.execPath, [fake, mode], "0.0.0-test", process.env, nodeTimers);

test("ping returns parsed JSON", async () => {
  const c = make();
  try {
    const ping = await c.callTool<{ alive: boolean; version: string }>("ping");
    assert.equal(ping.alive, true);
    assert.equal(ping.version, "9.9.9");
  } finally {
    c.stop();
  }
});

test("recall reassembles an answer split across writes and passes arguments", async () => {
  const c = make();
  try {
    const out = await c.callTool<{ hits: { key: string }[]; query: string; k: number }>("recall", { query: "pricing", k: 7 });
    assert.deepEqual(out.hits.map((h) => h.key), ["A", "B"]);
    assert.equal(out.query, "pricing");
    assert.equal(out.k, 7);
  } finally {
    c.stop();
  }
});

test("remember sends text, tags and speaker", async () => {
  const c = make();
  try {
    const out = await c.callTool<{ key: string; echoed: { text: string; tags: string[]; speaker: string } }>("remember", {
      text: "hello",
      tags: ["obsidian"],
      speaker: "user",
    });
    assert.equal(out.key, "01TESTKEY");
    assert.deepEqual(out.echoed, { text: "hello", tags: ["obsidian"], speaker: "user" });
  } finally {
    c.stop();
  }
});

test("several calls share one helper process and get the right answers", async () => {
  const c = make();
  try {
    const [a, b, d] = await Promise.all([
      c.callTool<{ version: string }>("ping"),
      c.callTool<{ query: string }>("recall", { query: "x" }),
      c.callTool<{ version: string }>("ping"),
    ]);
    assert.equal(a.version, "9.9.9");
    assert.equal(b.query, "x");
    assert.equal(d.version, "9.9.9");
  } finally {
    c.stop();
  }
});

test("a tool error is raised as ToolError with the helper's message", async () => {
  const c = make();
  try {
    await assert.rejects(c.callTool("nope"), (err: unknown) => err instanceof ToolError && /unknown tool nope/.test((err as Error).message));
  } finally {
    c.stop();
  }
});

test("a blocked client surfaces the refusal", async () => {
  const c = make("blocked");
  try {
    await assert.rejects(c.callTool("ping"), /client_blocked/);
  } finally {
    c.stop();
  }
});

test("a helper that exits mid-request rejects, and the next call starts a new one", async () => {
  const c = make("crash");
  try {
    await assert.rejects(c.callTool("recall", { query: "x" }), /stopped/);
    assert.equal(c.running, false);
    const ping = await c.callTool<{ alive: boolean }>("ping");
    assert.equal(ping.alive, true);
  } finally {
    c.stop();
  }
});

test("a helper that never answers times out", async () => {
  const c = make("silent");
  try {
    await assert.rejects(c.callTool("recall", { query: "x" }, 300), /did not answer in time/);
  } finally {
    c.stop();
  }
});

test("a missing helper rejects instead of throwing synchronously", async () => {
  const c = new McpClient(path.join(__dirname, "no-such-program"), [], "0.0.0-test", process.env, nodeTimers);
  await assert.rejects(c.callTool("ping"));
  c.stop();
});

test("works against the public launcher when the app is absent", async () => {
  const launcher = path.resolve(__dirname, "..", "node_modules", "modelbrain-mcp", "bin", "modelbrain-mcp.js");
  const c = new McpClient(process.execPath, [launcher], "0.0.0-test", { ...process.env, MODELBRAIN_MCP_FORCE_OFFLINE: "1" }, nodeTimers);
  try {
    await assert.rejects(c.callTool("ping"), (err: unknown) => err instanceof ToolError && (err as Error).message.length > 0);
  } finally {
    c.stop();
  }
});

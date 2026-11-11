// A stand-in for the ModelBrain helper, used only by the tests. It answers
// the same line-by-line requests with canned data.
const readline = require("node:readline");
const mode = process.argv[2] || "ok";
const rl = readline.createInterface({ input: process.stdin });
const memories = [];
function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
function tool(id, payload, isError = false) {
  reply(id, { content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) }], isError });
}
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  if (msg.method === "initialize") {
    if (mode === "blocked") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "client_blocked" } }) + "\n");
      return;
    }
    return reply(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "0" }, clientName: msg.params.clientInfo.name });
  }
  if (msg.method !== "tools/call") return;
  const { name, arguments: args } = msg.params;
  if (mode === "crash" && name === "recall") process.exit(3);
  if (mode === "silent" && name === "recall") return;
  if (name === "ping") return tool(msg.id, { alive: true, version: "9.9.9", degraded: false });
  if (name === "remember") {
    memories.push(args);
    return tool(msg.id, { key: "01TESTKEY", status: "ok", echoed: args });
  }
  if (name === "recall") {
    // Split across two writes to prove the client reassembles lines.
    const out = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: JSON.stringify({ hits: [
      { key: "A", text: "Keep the monthly price visible.", relevance: 0.91, source: "connector", connector_id: "notes", source_uri: "Projects/Pricing.md" },
      { key: "B", text: "Prefers short answers.", relevance: 0.5, source: "user", object_type: "fact" },
    ], query: args.query, k: args.k }) }] } }) + "\n";
    if (args.query !== "pricing") return void process.stdout.write(out);
    process.stdout.write(out.slice(0, 40));
    setTimeout(() => process.stdout.write(out.slice(40)), 20);
    return;
  }
  tool(msg.id, `unknown tool ${name}`, true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { isStructureEntry, matchVault, memoryText, parseConnectorList, relatedQuery, snippet, vaultPathForHit } from "../src/format";
import { helperFileName, installDirs } from "../src/paths";

const listOutput = [
  "Connectors registered against /Users/me/Library/Application Support/ModelBrain/data:",
  "  notes  ->  /Users/me/Documents/My Vault",
  "  work  ->  /Users/me/Work  (paused)",
  "",
].join("\n");

test("parses the connector list, including spaces and paused", () => {
  assert.deepEqual(parseConnectorList(listOutput), [
    { id: "notes", root: "/Users/me/Documents/My Vault", paused: false },
    { id: "work", root: "/Users/me/Work", paused: true },
  ]);
  assert.deepEqual(parseConnectorList("No connectors registered against /x yet.\nRegister one by running: ..."), []);
  assert.deepEqual(parseConnectorList("  docs  ->  C:\\Users\\me\\Vault\r\n"), [{ id: "docs", root: "C:\\Users\\me\\Vault", paused: false }]);
});

test("matches a vault that is the connected folder", () => {
  const m = matchVault(parseConnectorList(listOutput), "/Users/me/Documents/My Vault/", false);
  assert.equal(m?.connector.id, "notes");
  assert.equal(m?.vaultInsideRoot, "");
});

test("matches a vault inside a connected folder, picking the nearest parent", () => {
  const connectors = [
    { id: "home", root: "/Users/me", paused: false },
    { id: "docs", root: "/Users/me/Documents", paused: false },
  ];
  const m = matchVault(connectors, "/Users/me/Documents/Vault", false);
  assert.equal(m?.connector.id, "docs");
  assert.equal(m?.vaultInsideRoot, "Vault");
});

test("does not match a sibling folder with a shared prefix, or a child of the vault", () => {
  assert.equal(matchVault([{ id: "a", root: "/Users/me/Vault2", paused: false }], "/Users/me/Vault", false), null);
  assert.equal(matchVault([{ id: "a", root: "/Users/me/Vault/sub", paused: false }], "/Users/me/Vault", false), null);
});

test("case and slash differences follow the platform", () => {
  const c = [{ id: "v", root: "C:\\Users\\Me\\Vault", paused: false }];
  assert.equal(matchVault(c, "c:/users/me/vault", true)?.connector.id, "v");
  assert.equal(matchVault(c, "c:/users/me/vault", false), null);
});

test("maps hits to vault paths", () => {
  const same = matchVault(parseConnectorList(listOutput), "/Users/me/Documents/My Vault", false);
  assert.equal(vaultPathForHit({ source: "connector", connector_id: "notes", source_uri: "Projects/Pricing.md" }, same), "Projects/Pricing.md");
  assert.equal(vaultPathForHit({ source: "connector", connector_id: "work", source_uri: "a.md" }, same), null);
  assert.equal(vaultPathForHit({ source: "user" }, same), null);
  assert.equal(vaultPathForHit({ source: "connector", connector_id: "notes", source_uri: "a.md" }, null), null);

  const inside = matchVault([{ id: "docs", root: "/Users/me/Documents", paused: false }], "/Users/me/Documents/Vault", false);
  assert.equal(vaultPathForHit({ source: "connector", connector_id: "docs", source_uri: "Vault/Daily/1.md" }, inside), "Daily/1.md");
  assert.equal(vaultPathForHit({ source: "connector", connector_id: "docs", source_uri: "Other/1.md" }, inside), null);
  assert.equal(vaultPathForHit({ source: "connector", connector_id: "docs", source_uri: "Vault\\Daily\\1.md" }, inside), "Daily/1.md");
});

test("the generated folder listing is not treated as a note", () => {
  const same = matchVault(parseConnectorList(listOutput), "/Users/me/Documents/My Vault", false);
  assert.equal(isStructureEntry("__connector_structure__"), true);
  assert.equal(isStructureEntry("Sub/__connector_structure__"), true);
  assert.equal(isStructureEntry("Projects/__init__.md"), false);
  assert.equal(isStructureEntry("Notes/a.md"), false);
  assert.equal(isStructureEntry(undefined), false);
  assert.equal(vaultPathForHit({ source: "connector", connector_id: "notes", source_uri: "__connector_structure__" }, same), null);
});

test("text helpers", () => {
  assert.equal(snippet("a  b\n\nc"), "a b c");
  assert.equal(snippet("x".repeat(300), 10).length, 10);
  assert.equal(memoryText("  hi  ", "Notes/a.md"), "hi\n\nSource note: Notes/a.md");
  assert.equal(memoryText("hi", null), "hi");
  assert.equal(relatedQuery("Title", "---\ntags: [a]\n---\nBody text"), "Title. Body text");
  assert.ok(relatedQuery("T", "y".repeat(1000)).length <= 400);
});

test("install locations per platform", () => {
  assert.deepEqual(installDirs("darwin", "/Users/me", {}), ["/Applications/ModelBrain.app/Contents/MacOS", "/Users/me/Applications/ModelBrain.app/Contents/MacOS"]);
  assert.deepEqual(installDirs("linux", "/home/me", {}), ["/home/me/.local/lib/modelbrain"]);
  assert.equal(installDirs("win32", "C:\\Users\\me", { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }).length, 1);
  assert.deepEqual(installDirs("win32", "C:\\Users\\me", {}), []);
  assert.deepEqual(installDirs("freebsd", "/home/me", {}), []);
  assert.equal(helperFileName("mcp_server", "win32"), "mcp_server.exe");
  assert.equal(helperFileName("connector_sync", "darwin"), "connector_sync");
});

// Pure helpers, kept free of Obsidian imports so they can be tested in Node.

export interface Connector {
  id: string;
  root: string;
  paused: boolean;
}

/** Parses the output of `connector_sync list`. */
export function parseConnectorList(output: string): Connector[] {
  const connectors: Connector[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const match = /^\s+(\S+)\s+->\s+(.+?)(\s+\(paused\))?\s*$/.exec(raw);
    if (!match) continue;
    connectors.push({ id: match[1], root: match[2], paused: Boolean(match[3]) });
  }
  return connectors;
}

function normalize(p: string, caseInsensitive: boolean): string {
  let out = p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (caseInsensitive) out = out.toLowerCase();
  return out;
}

export interface VaultMatch {
  connector: Connector;
  /** Path of the vault inside the connector root, "" when they are the same folder. */
  vaultInsideRoot: string;
}

/**
 * Finds the connected folder that contains this vault: either the vault
 * itself or a parent folder of it.
 */
export function matchVault(connectors: Connector[], vaultPath: string, caseInsensitive: boolean): VaultMatch | null {
  const vault = normalize(vaultPath, caseInsensitive);
  let best: VaultMatch | null = null;
  for (const connector of connectors) {
    const root = normalize(connector.root, caseInsensitive);
    if (vault === root) return { connector, vaultInsideRoot: "" };
    if (vault.startsWith(root + "/")) {
      const inside = normalize(vaultPath, false).slice(root.length + 1);
      if (!best || root.length > normalize(best.connector.root, caseInsensitive).length) {
        best = { connector, vaultInsideRoot: inside };
      }
    }
  }
  return best;
}

/**
 * Turns the source of a search hit into a path inside the vault, or null
 * when the hit did not come from this vault.
 */
export function vaultPathForHit(
  hit: { source?: string; connector_id?: string; source_uri?: string },
  match: VaultMatch | null
): string | null {
  if (!match || hit.source !== "connector" || !hit.source_uri) return null;
  if (hit.connector_id !== match.connector.id) return null;
  const uri = hit.source_uri.replace(/\\/g, "/");
  if (!match.vaultInsideRoot) return uri;
  const prefix = match.vaultInsideRoot + "/";
  return uri.startsWith(prefix) ? uri.slice(prefix.length) : null;
}

export function snippet(text: string, max = 280): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + "…";
}

/** The text sent to ModelBrain when a selection is saved from a note. */
export function memoryText(selection: string, notePath: string | null): string {
  const body = selection.trim();
  return notePath ? `${body}\n\nSource note: ${notePath}` : body;
}

/** A short query describing a note, used to look up related memories. */
export function relatedQuery(title: string, body: string, max = 400): string {
  const withoutFrontmatter = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  return snippet(`${title}. ${withoutFrontmatter}`, max).replace(/…$/, "");
}

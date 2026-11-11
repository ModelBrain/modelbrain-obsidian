// Where the ModelBrain desktop app installs its helper programs. The same
// locations the public modelbrain-mcp launcher searches.
import * as os from "os";
import * as path from "path";

export type HelperName = "mcp_server" | "connector_sync";

export function installDirs(
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (platform === "darwin") {
    return [
      "/Applications/ModelBrain.app/Contents/MacOS",
      path.join(home, "Applications/ModelBrain.app/Contents/MacOS"),
    ];
  }
  if (platform === "win32") {
    const local = env.LOCALAPPDATA;
    return local ? [path.join(local, "Programs", "ModelBrain")] : [];
  }
  if (platform === "linux") {
    return [path.join(home, ".local", "lib", "modelbrain")];
  }
  return [];
}

export function helperFileName(name: HelperName, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? `${name}.exe` : name;
}

/** What running a helper told us: whether the program exists, and what it printed. */
export interface RunResult {
  missing: boolean;
  stdout: string;
}

export type Runner = (file: string, args: string[]) => Promise<RunResult>;

export interface Install {
  /** Folder that holds the ModelBrain helper programs. */
  dir: string;
  /** Output of ModelBrain's read-only list of connected folders. */
  connectorList: string;
}

/**
 * Finds the installed app by asking each known location for its list of
 * connected folders. A location counts as missing only when the program is
 * not there to run, so nothing has to look at the disk first.
 */
export async function locateInstall(run: Runner, overrideDir = "", dirs: string[] = installDirs()): Promise<Install | null> {
  const candidates = overrideDir.trim() ? [overrideDir.trim()] : dirs;
  for (const dir of candidates) {
    const result = await run(path.join(dir, helperFileName("connector_sync")), ["list"]);
    if (!result.missing) return { dir, connectorList: result.stdout };
  }
  return null;
}

export function helperIn(dir: string, name: HelperName): string {
  return path.join(dir, helperFileName(name));
}

// Where the ModelBrain desktop app installs its helper programs. The same
// locations the public modelbrain-mcp launcher searches.
import * as fs from "fs";
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

/** Returns the path of an installed helper, or null when the app is not installed. */
export function findHelper(name: HelperName, overrideDir = ""): string | null {
  const dirs = overrideDir.trim() ? [overrideDir.trim()] : installDirs();
  for (const dir of dirs) {
    const candidate = path.join(dir, helperFileName(name));
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try the next location
    }
  }
  return null;
}

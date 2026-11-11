import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type ModelBrainPlugin from "./main";

export interface ModelBrainSettings {
  installDir: string;
  resultCount: number;
}

export const DEFAULT_SETTINGS: ModelBrainSettings = {
  installDir: "",
  resultCount: 12,
};

interface PingAnswer {
  alive?: boolean;
  version?: string;
  degraded?: boolean;
}

export class ModelBrainSettingTab extends PluginSettingTab {
  // What the last check found. Rows are only ever drawn from these values.
  // A check runs once when the tab is shown, stores its results, and then
  // asks Obsidian to draw the tab again.
  private statusText: string | null = null;
  private vaultText: string | null = null;
  private checking = false;

  constructor(app: App, private readonly plugin: ModelBrainPlugin) {
    super(app, plugin);
  }

  hide(): void {
    // Check afresh the next time the tab is opened.
    this.statusText = null;
    this.vaultText = null;
    super.hide();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Status",
        searchable: false,
        render: (setting: Setting) => {
          setting.setDesc(this.statusText ?? "Checking…");
          setting.addButton((btn) =>
            btn
              .setButtonText("Check again")
              .setDisabled(this.checking)
              .onClick(() => void this.check())
          );
          // Only start a check when the row is really on screen. Obsidian also
          // reads these definitions at startup to index them for search, and
          // that must not start ModelBrain's helper.
          if (this.statusText === null && !this.checking) void this.check();
        },
      },
      {
        name: "This vault",
        searchable: false,
        render: (setting: Setting) => {
          setting.setDesc(this.vaultText ?? "Checking…");
        },
      },
      {
        name: "Results per search",
        desc: "How many results the search panel asks for.",
        control: { type: "slider", key: "resultCount", min: 5, max: 30, step: 1, defaultValue: DEFAULT_SETTINGS.resultCount },
      },
      {
        name: "Install folder",
        desc: "Leave empty unless ModelBrain is installed somewhere unusual. This is the folder that holds its helper programs.",
        control: { type: "text", key: "installDir", placeholder: "Found automatically", defaultValue: "" },
      },
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof ModelBrainSettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "resultCount" && typeof value === "number") {
      this.plugin.settings.resultCount = value;
    } else if (key === "installDir" && typeof value === "string") {
      this.plugin.settings.installDir = value.trim();
      this.plugin.resetClient();
    } else {
      return;
    }
    await this.plugin.saveSettings();
  }

  /** Runs both checks once, then has Obsidian draw the tab again with the results. */
  private async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const [status, vault] = await Promise.all([this.describeStatus(), this.describeVault()]);
      this.statusText = status;
      this.vaultText = vault;
    } finally {
      this.checking = false;
    }
    this.update();
  }

  private async describeStatus(): Promise<string> {
    if (!(await this.plugin.installed())) {
      return "The ModelBrain desktop app was not found. Install it from modelbrain.net, start it once, then choose Check again.";
    }
    try {
      const ping = await (await this.plugin.client()).callTool<PingAnswer>("ping", {}, 15000);
      const version = ping.version ? `version ${ping.version}` : "version unknown";
      return ping.degraded ? `Connected, ${version}. ModelBrain reports a problem: open its menu for details.` : `Connected, ${version}.`;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return `Installed, but it did not answer: ${reason} If ModelBrain asked whether to allow Obsidian, choose Allow.`;
    }
  }

  private async describeVault(): Promise<string> {
    const vaultPath = this.plugin.vaultPath();
    if (!vaultPath) return "This vault is not a folder on this computer, so ModelBrain cannot read it.";
    const match = await this.plugin.vaultMatch(true);
    if (match) {
      const where = match.vaultInsideRoot ? `as part of the folder "${match.connector.id}"` : `as "${match.connector.id}"`;
      const paused = match.connector.paused ? " It is paused: resume it from the ModelBrain menu." : "";
      return `Your assistants can read this vault. ModelBrain has it ${where}.${paused}`;
    }
    return (
      "Not connected yet. ModelBrain only adds a folder when you choose it yourself, so this plugin cannot do it for you. " +
      `Open the ModelBrain menu, choose Add Vault, and pick this folder: ${vaultPath} ` +
      "On Linux, run connector_sync register with a name and that folder in a terminal."
    );
  }
}

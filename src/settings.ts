import { App, Notice, PluginSettingTab, Setting } from "obsidian";
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
  // What the last check found. display() only ever draws from these, and
  // never starts work on its own once a check has run: Obsidian may call
  // display() again whenever the tab's content changes, so a display() that
  // changed its own content later would be drawn in a loop.
  private statusText: string | null = null;
  private vaultText: string | null = null;
  private vaultConnected = true;
  private checking = false;

  constructor(app: App, private readonly plugin: ModelBrainPlugin) {
    super(app, plugin);
  }

  hide(): void {
    // Check afresh the next time the tab is opened.
    this.statusText = null;
    this.vaultText = null;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Status")
      .setDesc(this.statusText ?? "Checking\u2026")
      .addButton((btn) =>
        btn
          .setButtonText("Check again")
          .setDisabled(this.checking)
          .onClick(() => void this.check())
      );

    const vault = new Setting(containerEl).setName("This vault").setDesc(this.vaultText ?? "Checking\u2026");
    const vaultPath = this.plugin.vaultPath();
    if (this.vaultText !== null && !this.vaultConnected && vaultPath) {
      vault.addButton((btn) =>
        btn.setButtonText("Copy vault folder").onClick(async () => {
          await navigator.clipboard.writeText(vaultPath);
          new Notice("Vault folder copied.");
        })
      );
    }

    new Setting(containerEl)
      .setName("Results per search")
      .setDesc("How many results the search panel asks for.")
      .addSlider((slider) =>
        slider
          .setLimits(5, 30, 1)
          .setValue(this.plugin.settings.resultCount)
          .onChange(async (value) => {
            this.plugin.settings.resultCount = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Install folder")
      .setDesc("Leave empty unless ModelBrain is installed somewhere unusual. This is the folder that holds its helper programs.")
      .addText((text) =>
        text
          .setPlaceholder("Found automatically")
          .setValue(this.plugin.settings.installDir)
          .onChange(async (value) => {
            this.plugin.settings.installDir = value.trim();
            await this.plugin.saveSettings();
            this.plugin.resetClient();
          })
      );

    if (this.statusText === null && !this.checking) void this.check();
  }

  /** Runs both checks once, then redraws the tab once with the results. */
  private async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const [status, vault] = await Promise.all([this.describeStatus(), this.describeVault()]);
      this.statusText = status;
      this.vaultText = vault.text;
      this.vaultConnected = vault.connected;
    } finally {
      this.checking = false;
    }
    this.display();
  }

  private async describeStatus(): Promise<string> {
    if (!this.plugin.helperPath()) {
      return "The ModelBrain desktop app was not found. Install it from modelbrain.net, start it once, then choose Check again.";
    }
    try {
      const ping = await this.plugin.client().callTool<PingAnswer>("ping", {}, 15000);
      const version = ping.version ? `version ${ping.version}` : "version unknown";
      return ping.degraded ? `Connected, ${version}. ModelBrain reports a problem: open its menu for details.` : `Connected, ${version}.`;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return `Installed, but it did not answer: ${reason} If ModelBrain asked whether to allow Obsidian, choose Allow.`;
    }
  }

  private async describeVault(): Promise<{ text: string; connected: boolean }> {
    if (!this.plugin.vaultPath()) {
      return { text: "This vault is not a folder on this computer, so ModelBrain cannot read it.", connected: true };
    }
    const match = await this.plugin.vaultMatch(true);
    if (match) {
      const where = match.vaultInsideRoot ? `as part of the folder "${match.connector.id}"` : `as "${match.connector.id}"`;
      const paused = match.connector.paused ? " It is paused: resume it from the ModelBrain menu." : "";
      return { text: `Your assistants can read this vault. ModelBrain has it ${where}.${paused}`, connected: true };
    }
    return {
      text:
        "Not connected yet. ModelBrain only adds a folder when you choose it yourself, so this plugin cannot do it for you. " +
        "Open the ModelBrain menu, choose Add Vault, and pick this vault's folder. On Linux, run: connector_sync register <name> <folder> in a terminal.",
      connected: false,
    };
  }
}

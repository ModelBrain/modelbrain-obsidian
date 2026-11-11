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
  constructor(app: App, private readonly plugin: ModelBrainPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const status = new Setting(containerEl).setName("Status").setDesc("Checking…");
    status.addButton((btn) => btn.setButtonText("Check again").onClick(() => this.display()));
    void this.describeStatus().then((text) => status.setDesc(text));

    const vault = new Setting(containerEl).setName("This vault").setDesc("Checking…");
    void this.describeVault(vault);

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

  private async describeVault(setting: Setting): Promise<void> {
    const vaultPath = this.plugin.vaultPath();
    if (!vaultPath) {
      setting.setDesc("This vault is not a folder on this computer, so ModelBrain cannot read it.");
      return;
    }
    const match = await this.plugin.vaultMatch(true);
    if (match) {
      const where = match.vaultInsideRoot ? `as part of the folder "${match.connector.id}"` : `as "${match.connector.id}"`;
      const paused = match.connector.paused ? " It is paused: resume it from the ModelBrain menu." : "";
      setting.setDesc(`Your assistants can read this vault. ModelBrain has it ${where}.${paused}`);
      return;
    }
    setting.setDesc(
      "Not connected yet. ModelBrain only adds a folder when you choose it yourself, so this plugin cannot do it for you. " +
        "Open the ModelBrain menu, choose Add Vault, and pick this vault's folder. On Linux, run: connector_sync register <name> <folder> in a terminal."
    );
    setting.addButton((btn) =>
      btn.setButtonText("Copy vault folder").onClick(async () => {
        await navigator.clipboard.writeText(vaultPath);
        new Notice("Vault folder copied.");
      })
    );
  }
}

import { Editor, FileSystemAdapter, MarkdownFileInfo, MarkdownView, Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { execFile } from "child_process";
import { McpClient } from "./client";
import { helperIn, Install, locateInstall, RunResult } from "./paths";
import { matchVault, memoryText, parseConnectorList, relatedQuery, VaultMatch } from "./format";
import { DEFAULT_SETTINGS, ModelBrainSettings, ModelBrainSettingTab } from "./settings";
import { SearchView, VIEW_TYPE } from "./view";

interface RememberAnswer {
  key?: string;
}

export default class ModelBrainPlugin extends Plugin {
  settings: ModelBrainSettings = DEFAULT_SETTINGS;
  private mcp: McpClient | null = null;
  private cachedMatch: { at: number; value: VaultMatch | null } | null = null;
  private install: Install | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new SearchView(leaf, this));
    this.addRibbonIcon("brain", "Open ModelBrain search", () => void this.openView(true));

    this.addCommand({
      id: "open-search",
      name: "Open search",
      callback: () => void this.openView(true),
    });

    this.addCommand({
      id: "remember-selection",
      name: "Remember selection",
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        if (!editor.getSelection().trim()) return false;
        if (!checking) void this.rememberSelection(editor, view.file);
        return true;
      },
    });

    this.addCommand({
      id: "related-to-note",
      name: "Show memories related to this note",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.showRelated(file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view) => {
        if (!editor.getSelection().trim()) return;
        menu.addItem((item) =>
          item
            .setTitle("Remember selection in ModelBrain")
            .setIcon("brain")
            .onClick(() => void this.rememberSelection(editor, view.file))
        );
      })
    );

    this.addSettingTab(new ModelBrainSettingTab(this.app, this));
  }

  onunload(): void {
    this.resetClient();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<ModelBrainSettings> | null);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * Where the ModelBrain app is installed, or null. A found location is
   * remembered until the settings change; `fresh` asks again.
   */
  async locate(fresh = false): Promise<Install | null> {
    if (this.install && !fresh) return this.install;
    const run = (file: string, args: string[]) =>
      new Promise<RunResult>((resolve) => {
        execFile(file, args, { timeout: 10000 }, (err, stdout) => {
          const code = err ? (err as NodeJS.ErrnoException).code : undefined;
          resolve({ missing: code === "ENOENT" || code === "EACCES" || code === "ENOTDIR", stdout: err ? "" : String(stdout) });
        });
      });
    this.install = await locateInstall(run, this.settings.installDir);
    return this.install;
  }

  async installed(): Promise<boolean> {
    return (await this.locate()) !== null;
  }

  async client(): Promise<McpClient> {
    if (!this.mcp) {
      const install = await this.locate();
      if (!install) throw new Error("The ModelBrain desktop app was not found on this computer.");
      this.mcp ??= new McpClient(helperIn(install.dir, "mcp_server"), [], this.manifest.version);
    }
    return this.mcp;
  }

  resetClient(): void {
    this.mcp?.stop();
    this.mcp = null;
    this.cachedMatch = null;
    this.install = null;
  }

  vaultPath(): string | null {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
  }

  /**
   * Which connected folder holds this vault, if any. Reads the list of
   * connected folders with ModelBrain's own read-only list command.
   */
  async vaultMatch(fresh = false): Promise<VaultMatch | null> {
    if (!fresh && this.cachedMatch && Date.now() - this.cachedMatch.at < 60000) return this.cachedMatch.value;
    const vaultPath = this.vaultPath();
    let value: VaultMatch | null = null;
    const install = vaultPath ? await this.locate(true) : null;
    if (vaultPath && install) {
      value = matchVault(parseConnectorList(install.connectorList), vaultPath, process.platform !== "linux");
    }
    this.cachedMatch = { at: Date.now(), value };
    return value;
  }

  private async openView(focus: boolean): Promise<SearchView | null> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return null;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    const view = leaf.view instanceof SearchView ? leaf.view : null;
    if (focus) view?.focusInput();
    return view;
  }

  private async rememberSelection(editor: Editor, file: TFile | null): Promise<void> {
    const selection = editor.getSelection();
    if (!selection.trim()) return;
    try {
      const answer = await (await this.client()).callTool<RememberAnswer>("remember", {
        text: memoryText(selection, file ? file.path : null),
        tags: ["obsidian"],
        speaker: "user",
      });
      new Notice(answer?.key ? "Saved to ModelBrain." : "ModelBrain answered, but did not confirm the save.");
    } catch (err) {
      new Notice(`Could not save to ModelBrain: ${err instanceof Error ? err.message : String(err)}`, 8000);
    }
  }

  private async showRelated(file: TFile): Promise<void> {
    const body = file.extension === "md" ? await this.app.vault.cachedRead(file) : "";
    const view = await this.openView(false);
    await view?.search(relatedQuery(file.basename, body), `Related to ${file.basename}`);
  }
}

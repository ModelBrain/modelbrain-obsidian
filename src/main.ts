import { Editor, FileSystemAdapter, MarkdownFileInfo, MarkdownView, Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { execFile } from "child_process";
import { McpClient } from "./client";
import { findHelper } from "./paths";
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

  /** Path of the installed helper that talks to ModelBrain, or null. */
  helperPath(): string | null {
    return findHelper("mcp_server", this.settings.installDir);
  }

  client(): McpClient {
    if (!this.mcp) {
      const helper = this.helperPath();
      if (!helper) throw new Error("The ModelBrain desktop app was not found on this computer.");
      this.mcp = new McpClient(helper, [], this.manifest.version);
    }
    return this.mcp;
  }

  resetClient(): void {
    this.mcp?.stop();
    this.mcp = null;
    this.cachedMatch = null;
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
    const lister = findHelper("connector_sync", this.settings.installDir);
    let value: VaultMatch | null = null;
    if (vaultPath && lister) {
      const output = await new Promise<string>((resolve) => {
        execFile(lister, ["list"], { timeout: 10000 }, (err, stdout) => resolve(err ? "" : String(stdout)));
      });
      value = matchVault(parseConnectorList(output), vaultPath, process.platform !== "linux");
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
      const answer = await this.client().callTool<RememberAnswer>("remember", {
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

import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type ModelBrainPlugin from "./main";
import { snippet, vaultPathForHit } from "./format";

export const VIEW_TYPE = "modelbrain-search";
const DOWNLOAD_URL = "https://modelbrain.net/get-it.html";

export interface Hit {
  key: string;
  text: string;
  relevance?: number;
  source?: string;
  connector_id?: string;
  source_uri?: string;
  partition?: string;
  object_type?: string;
  source_date?: string;
}

interface RecallAnswer {
  hits?: Hit[];
  answer?: string;
}

export class SearchView extends ItemView {
  private inputEl!: HTMLInputElement;
  private scopeEl!: HTMLSelectElement;
  private resultsEl!: HTMLElement;
  private runId = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ModelBrainPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return "ModelBrain";
  }

  getIcon(): string {
    return "brain";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("modelbrain-view");

    const form = root.createEl("form", { cls: "modelbrain-form" });
    this.inputEl = form.createEl("input", {
      type: "search",
      cls: "modelbrain-input",
      attr: { placeholder: "Search notes and memories", "aria-label": "Search notes and memories" },
    });
    this.scopeEl = form.createEl("select", { cls: "dropdown modelbrain-scope", attr: { "aria-label": "Where to search" } });
    this.scopeEl.createEl("option", { text: "Everything", value: "all" });
    this.scopeEl.createEl("option", { text: "This vault", value: "vault" });
    this.scopeEl.createEl("option", { text: "Saved memories", value: "memories" });
    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      void this.search(this.inputEl.value);
    });

    this.resultsEl = root.createDiv({ cls: "modelbrain-results" });
    this.showHint();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  focusInput(): void {
    this.inputEl?.focus();
  }

  private showHint(): void {
    this.resultsEl.empty();
    if (!this.plugin.helperPath()) {
      this.showNotInstalled();
      return;
    }
    this.resultsEl.createEl("p", {
      cls: "modelbrain-muted",
      text: "Search this vault together with everything your assistants have been told to remember.",
    });
  }

  private showNotInstalled(): void {
    const box = this.resultsEl.createDiv({ cls: "modelbrain-notice" });
    box.createEl("p", { text: "The ModelBrain desktop app was not found on this computer." });
    box.createEl("p", {
      cls: "modelbrain-muted",
      text: "This plugin is a window onto that app. Install it, start it once, then come back here.",
    });
    box.createEl("a", { text: "Download ModelBrain", href: DOWNLOAD_URL });
  }

  /** Runs a search and shows the hits. `label` replaces the query in the heading. */
  async search(query: string, label?: string): Promise<void> {
    const text = query.trim();
    if (!text) return;
    if (!label) this.inputEl.value = text;
    const run = ++this.runId;
    this.resultsEl.empty();
    if (!this.plugin.helperPath()) {
      this.showNotInstalled();
      return;
    }
    this.resultsEl.createEl("p", { cls: "modelbrain-muted", text: "Searching…" });

    let answer: RecallAnswer;
    try {
      answer = await this.plugin.client().callTool<RecallAnswer>("recall", {
        query: text,
        k: this.plugin.settings.resultCount,
      });
    } catch (err) {
      if (run !== this.runId) return;
      this.resultsEl.empty();
      const box = this.resultsEl.createDiv({ cls: "modelbrain-notice" });
      box.createEl("p", { text: "ModelBrain could not answer." });
      box.createEl("p", { cls: "modelbrain-muted", text: err instanceof Error ? err.message : String(err) });
      box.createEl("p", {
        cls: "modelbrain-muted",
        text: "Check that the app is running. The first time, it asks whether to allow Obsidian: choose Allow.",
      });
      return;
    }
    if (run !== this.runId) return;

    const match = await this.plugin.vaultMatch();
    const scope = this.scopeEl.value;
    const hits = (answer.hits ?? []).filter((hit) => {
      const inVault = vaultPathForHit(hit, match) !== null;
      if (scope === "vault") return inVault;
      if (scope === "memories") return hit.source !== "connector";
      return true;
    });

    this.resultsEl.empty();
    if (label) this.resultsEl.createDiv({ cls: "modelbrain-heading", text: label });
    if (hits.length === 0) {
      this.resultsEl.createEl("p", { cls: "modelbrain-muted", text: "Nothing found." });
      return;
    }
    for (const hit of hits) this.renderHit(hit, vaultPathForHit(hit, match));
  }

  private renderHit(hit: Hit, notePath: string | null): void {
    const card = this.resultsEl.createDiv({ cls: "modelbrain-hit" });
    const head = card.createDiv({ cls: "modelbrain-hit-head" });
    const icon = head.createSpan({ cls: "modelbrain-hit-icon" });
    setIcon(icon, notePath ? "file-text" : hit.source === "connector" ? "folder" : "bookmark");

    if (notePath) {
      const link = head.createEl("a", { cls: "modelbrain-hit-title", text: notePath, href: "#" });
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        void this.app.workspace.openLinkText(notePath, "", evt.ctrlKey || evt.metaKey);
      });
    } else if (hit.source === "connector") {
      head.createSpan({ cls: "modelbrain-hit-title", text: hit.source_uri ?? "Another folder" });
    } else {
      head.createSpan({ cls: "modelbrain-hit-title", text: hit.object_type ? `Memory (${hit.object_type})` : "Memory" });
    }
    if (typeof hit.relevance === "number") {
      head.createSpan({ cls: "modelbrain-hit-score", text: hit.relevance.toFixed(2), attr: { "aria-label": "Relevance" } });
    }

    card.createEl("p", { cls: "modelbrain-hit-text", text: snippet(hit.text ?? "") });
    const meta: string[] = [];
    if (hit.partition) meta.push(hit.partition);
    if (hit.source_date) meta.push(hit.source_date.slice(0, 10));
    if (meta.length) card.createDiv({ cls: "modelbrain-hit-meta", text: meta.join(" · ") });
  }
}

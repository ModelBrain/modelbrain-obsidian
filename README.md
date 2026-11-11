# ModelBrain for your vault

Search this vault together with everything your AI assistants have been told to remember, and save a selection as a memory that Claude, ChatGPT and Cursor can all recall.

This plugin is a window onto the [ModelBrain](https://modelbrain.net) desktop app. It does nothing without it. ModelBrain is a memory layer for AI assistants that keeps its index on your own computer. It is free for one person, with no account.

## What it does

- **Search panel.** One search across your notes and your saved memories. A result from this vault opens the note it came from.
- **Remember selection.** Select text in a note, then run "Remember selection" from the command palette or the right-click menu. The text is saved as a memory, with the note's path, so any connected assistant can recall it later.
- **Related memories.** "Show memories related to this note" lists what your assistants already know that touches the open note.
- **Status.** The settings tab shows whether ModelBrain is running, its version, and whether this vault is connected.

It never changes, creates or deletes a note.

## Requirements

- Obsidian on macOS, Windows or Linux. Desktop only: there is no phone or tablet support, because the plugin talks to a program on your computer.
- The ModelBrain desktop app, installed and started once. [Download it here](https://modelbrain.net/get-it.html).

## First run

1. Install and start ModelBrain.
2. Enable this plugin and open its settings tab. Status should read "Connected".
3. The first time the plugin talks to ModelBrain, ModelBrain may ask whether to allow Obsidian. Choose Allow.
4. Connect the vault, below.

## Connecting this vault

ModelBrain only reads a folder that you have chosen yourself, in its own menu or in a terminal. That is a deliberate safety rule, and this plugin does not get around it.

- macOS and Windows: open the ModelBrain menu, choose **Add Vault**, and pick this vault's folder. The settings tab has a button that copies the folder path.
- Linux: run `connector_sync register notes /path/to/vault` in a terminal.

The first pass over a large vault takes a while. After that only changed notes are read again. See the [Obsidian guide](https://modelbrain.net/docs/obsidian.html) for what is read and what is skipped.

## Privacy and disclosures

Obsidian asks plugins to state these plainly.

- **Programs outside the vault.** The plugin starts two helper programs that the ModelBrain app installed: `mcp_server`, which passes requests to ModelBrain, and `connector_sync list`, which reads the list of folders ModelBrain is connected to. It needs these because ModelBrain is a separate app. It does not read or write any other file outside your vault.
- **Network.** The plugin makes no network requests. It talks to ModelBrain on the same computer through that helper program.
- **What it sends to ModelBrain.** The text you type into the search box; the text you select when you run "Remember selection", with the note's path; and, for related memories, the note's title and about its first 400 characters.
- **Telemetry.** None.
- **Account and payment.** None needed. ModelBrain sells optional sync between computers and team sharing. This plugin does not use or need either.
- **Source.** This plugin is open source under the MIT licence. The ModelBrain app it talks to is closed source.

What ModelBrain itself does with your notes is described on its [privacy page](https://modelbrain.net/privacy.html).

## Settings

- **Results per search.** How many results the panel asks for.
- **Install folder.** Leave empty. Set it only if ModelBrain is installed somewhere unusual.

## Limits

- Plain search returns ranked results. It does not write an answer.
- A result from a connected folder other than this vault is shown but cannot be opened from here.
- Notes you have just edited take a little while to show up, because ModelBrain indexes in the background.

## Development

```
npm install
npm run build   # type-check and bundle to main.js
npm test        # runs the client against a stand-in helper
npx eslint .
```

To try a build, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/modelbrain/` and enable the plugin.

## Licence

MIT. See [LICENSE](LICENSE).

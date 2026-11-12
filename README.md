# Smart RTL Chat

Makes Cursor's chat right-to-left only where it should be, paragraph by paragraph:

- **Arabic, Persian or Hebrew paragraph or heading**: right-aligned and RTL, even inside an English reply.
- **English paragraph**: left-aligned, even inside an Arabic reply.
- **Lists and tables** go with most of their items, so all the bullets stay on one side. Each item still reads in its own direction.
- **English reply**: left exactly as Cursor draws it. Nothing is touched.
- **Code**, inline or in a block, is always left-to-right.
- **Questions** Cursor asks you (the ask-question card) turn RTL when the question is Arabic, with the letters on the right and each option reading in its own direction.
- **The prompt input** follows what you type.

Replies are re-judged while they stream, so a paragraph that opens with "OK" and continues in Arabic flips as soon as the Arabic arrives.

## How it decides

The runtime counts the letters in each paragraph, leaving out anything inside code, and turns the paragraph RTL once Arabic-script (or Hebrew) letters make up at least `smartRtl.threshold` of them, which is 30% by default.

That differs from `dir="auto"`, which most chat apps use and which goes by the first letter only. `React هو مكتبة لبناء الواجهات` opens with an English word, so `dir="auto"` lays it out left-to-right. Counting letters gets it right.

Set `smartRtl.mode` to `message` to judge the whole reply instead: a mostly Arabic reply then aligns right throughout, English lines included.

## Requirements

[Custom UI Style](https://open-vsx.org/extension/subframe7536/custom-ui-style) does the actual injection into Cursor's workbench. It is installed automatically as a dependency from the marketplace. If you sideload the `.vsix`, install it first.

Custom UI Style patches Cursor's workbench files to load the script. If you'd rather nothing in Cursor's install folder is touched, use the [launcher](#without-custom-ui-style) instead.

## Commands

| Command | What it does |
|---|---|
| **Smart RTL: Apply Settings and Reload** | Regenerates the injected script from your settings and reloads |
| **Smart RTL: Remove Injected Script** | Unregisters the script; Custom UI Style strips it on its next apply |

## Settings

| Setting | Default | |
|---|---|---|
| `smartRtl.mode` | `paragraph` | `paragraph` judges each paragraph on its own; `message` judges the whole reply |
| `smartRtl.threshold` | `0.3` | Share of letters that must be RTL for a paragraph (or reply) to flip |
| `smartRtl.messageSelector` | Cursor, VS Code and Claude chat elements | What counts as one message. Only change it if a Cursor update renames something |

Changing any of them regenerates the script and asks to reload.

## Without Custom UI Style

The same runtime works on its own two other ways:

- **One-off**: paste `runtime/smartRtl.js` into **Developer: Toggle Developer Tools → Console**. It lasts until the window reloads. `__smartRtl.stop()` undoes it.
- **Launcher**: `node launcher/smart-rtl.mjs cursor --restart` relaunches Cursor with a DevTools port bound to `127.0.0.1` and injects the script into every window, without touching any of Cursor's files. Keep it running while you use Cursor. It also takes `vscode`, `antigravity` and `claude`. While the port is open, any program on your machine can control that window.

## Credits

Started from [mrezadalaee/cursor-rtl-chat-fix](https://github.com/mrezadalaee/cursor-rtl-chat-fix), which forces the whole chat RTL. This extension decides from the text itself instead.

## License

MIT

# Changelog

## 0.2.2

- Cursor's ask-question card now turns right-to-left for Arabic questions. It is not markdown, so nothing reached it before. Each question is judged by its own label, so an Arabic question with English options such as "React" and "Vue" still lays out from the right, and each option reads in its own direction. Cursor's left-side margins on the card are mirrored, and the English "Other..." placeholder no longer prints as "...Other"

## 0.2.1

- Fixed Custom UI Style asking "Configuration changed, apply now?" on every start when Composer Zoom is also installed. Both extensions moved their own import to the end of `custom-ui-style.external.imports` each time they started, so each undid the other and rewrote the setting. Smart RTL now leaves its entry where it already is

## 0.2.0

- Direction is now decided per paragraph by default. An Arabic paragraph inside an English reply goes right, and an English one inside an Arabic reply goes left. Previously the reply was judged as a whole, so a short Arabic paragraph in a long English reply stayed left. The old behaviour is still available as `"smartRtl.mode": "message"`
- Lists and tables go with most of their items rather than with the paragraph threshold, so bullets and columns stay on one side. Items are counted, not letters: an Arabic item full of English terms like `await` and `request` still counts as Arabic
- A message added in one piece, rather than streamed into an existing element, is now picked up
- A generic wrapper around a whole conversation can no longer be taken for a single message

## 0.1.0

Initial release.

- Decides direction per message from its prose, with code left out: Arabic, Persian or Hebrew replies turn right-to-left, English replies are not touched
- Inside an RTL reply, each paragraph, heading, list item and table cell reads in its own direction while staying right-aligned, and lists keep every bullet on one side
- Code blocks and inline code stay left-to-right
- Re-judges replies while they stream, and the prompt input as you type
- Covers Cursor's classic chat and the Cursor 3 Agents window, with a generic fallback for chats it does not name
- Configurable threshold and message selector
- Delegates workbench injection to Custom UI Style rather than patching Cursor directly
- Also ships a standalone launcher that injects through a local DevTools port, for setups without Custom UI Style

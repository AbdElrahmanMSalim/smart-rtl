#!/bin/zsh
# Double-click on macOS: launches Cursor with Smart RTL. Close this window to stop re-injecting.
cd "${0:A:h}" && exec node launcher/smart-rtl.mjs cursor --restart

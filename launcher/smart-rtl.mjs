#!/usr/bin/env node
/**
 * Launches an Electron AI editor with a local DevTools port and injects runtime/smartRtl.js
 * into every window. Nothing inside the app's install folder is modified.
 *
 *   node smart-rtl.mjs cursor            # launch Cursor (or attach if already launched by us)
 *   node smart-rtl.mjs vscode --restart  # quit the running VS Code first, then relaunch
 *   node smart-rtl.mjs --port 9333 --attach   # only attach to an app already on that port
 *
 * Keep it running while you use the app; it re-injects on reloads and new windows.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = readFileSync(join(here, '..', 'runtime', 'smartRtl.js'), 'utf8');

const LOCAL = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
const APPS = {
  cursor: {
    name: 'Cursor', port: 9301,
    darwin: ['/Applications/Cursor.app/Contents/MacOS/Cursor', join(homedir(), 'Applications/Cursor.app/Contents/MacOS/Cursor')],
    win32: [join(LOCAL, 'Programs', 'cursor', 'Cursor.exe')],
    linux: ['/usr/bin/cursor', '/opt/Cursor/cursor', '/usr/share/cursor/cursor'],
  },
  vscode: {
    name: 'Code', port: 9302,
    darwin: ['/Applications/Visual Studio Code.app/Contents/MacOS/Electron', '/Applications/Visual Studio Code.app/Contents/MacOS/Code'],
    win32: [join(LOCAL, 'Programs', 'Microsoft VS Code', 'Code.exe')],
    linux: ['/usr/share/code/code', '/usr/bin/code'],
  },
  antigravity: {
    name: 'Antigravity', port: 9303,
    darwin: ['/Applications/Antigravity.app/Contents/MacOS/Electron', '/Applications/Antigravity.app/Contents/MacOS/Antigravity'],
    win32: [join(LOCAL, 'Programs', 'Antigravity', 'Antigravity.exe')],
    linux: ['/usr/share/antigravity/antigravity', '/usr/bin/antigravity'],
  },
  claude: {
    name: 'Claude', port: 9304,
    darwin: ['/Applications/Claude.app/Contents/MacOS/Claude'],
    win32: [join(LOCAL, 'AnthropicClaude', 'claude.exe')],
    linux: [],
  },
};

function parseArgs(argv) {
  const opts = { app: null, port: null, restart: false, attach: false, extra: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--restart') opts.restart = true;
    else if (a === '--attach') opts.attach = true;
    else if (a === '--') { opts.extra = argv.slice(i + 1); break; }
    else if (!opts.app) opts.app = a.toLowerCase();
  }
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(1500) });
  return res.json();
}

async function portIsUp(port) {
  try { await getJson(port, '/json/version'); return true; } catch { return false; }
}

function isRunning(app) {
  try {
    if (platform() === 'win32') {
      return execFileSync('tasklist', ['/FI', `IMAGENAME eq ${app.name}.exe`], { encoding: 'utf8' }).includes(app.name);
    }
    const bin = app[platform()].find(existsSync);
    execFileSync('pgrep', ['-f', bin], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

async function quit(app) {
  if (platform() === 'darwin') execFileSync('osascript', ['-e', `quit app "${app.name}"`]);
  else if (platform() === 'win32') execFileSync('taskkill', ['/IM', `${app.name}.exe`]);
  else execFileSync('pkill', ['-f', app.linux.find(existsSync)]);
  for (let i = 0; i < 40 && isRunning(app); i++) await sleep(250);
}

function launch(app, port, extra) {
  const bin = (app[platform()] || []).find(existsSync);
  if (!bin) throw new Error(`Could not find ${app.name} on this machine.`);
  // Electron binds the DevTools port to 127.0.0.1 only.
  const child = spawn(bin, [`--remote-debugging-port=${port}`, ...extra], {
    detached: true, stdio: 'ignore',
  });
  child.unref();
}

// One CDP session per window. Kept open so the script is re-applied on reloads.
const sessions = new Map();

function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
  sessions.set(target.id, ws);
  ws.addEventListener('open', () => {
    send('Page.enable');
    send('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT });
    send('Runtime.evaluate', { expression: SCRIPT });
    console.log(`  ✓ injected into ${target.title || target.url}`);
  });
  ws.addEventListener('close', () => sessions.delete(target.id));
  ws.addEventListener('error', () => sessions.delete(target.id));
}

async function watch(port) {
  let misses = 0;
  for (;;) {
    let targets;
    try {
      targets = await getJson(port, '/json/list');
      misses = 0;
    } catch {
      if (++misses >= 3) { console.log('App closed. Bye.'); process.exit(0); }
      await sleep(1000);
      continue;
    }
    for (const t of targets) {
      if (sessions.has(t.id) || !t.webSocketDebuggerUrl) continue;
      if (!['page', 'webview'].includes(t.type) || t.url.startsWith('devtools://')) continue;
      attach(t);
    }
    await sleep(2000);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const app = APPS[opts.app];
  if (!app && !opts.attach) {
    console.log(`Usage: node smart-rtl.mjs <${Object.keys(APPS).join('|')}> [--restart] [--port N] [-- extra app args]`);
    console.log('       node smart-rtl.mjs --attach --port N');
    process.exit(1);
  }
  const port = opts.port || app.port;

  if (!opts.attach && !(await portIsUp(port))) {
    // A separate --user-data-dir is its own instance, so a running copy doesn't matter.
    const separateProfile = opts.extra.some((a) => a.startsWith('--user-data-dir'));
    if (!separateProfile && isRunning(app)) {
      if (!opts.restart) {
        console.log(`${app.name} is already running without the RTL port.`);
        console.log(`Quit it and run this again, or add --restart to let me quit it for you.`);
        process.exit(1);
      }
      console.log(`Quitting ${app.name}…`);
      await quit(app);
    }
    console.log(`Launching ${app.name} with RTL support…`);
    launch(app, port, opts.extra);
  }

  for (let i = 0; i < 60 && !(await portIsUp(port)); i++) await sleep(500);
  if (!(await portIsUp(port))) {
    console.log(`No DevTools port on ${port}. The app may block --remote-debugging-port.`);
    process.exit(1);
  }
  console.log(`Connected on 127.0.0.1:${port}. Leave this running; Ctrl+C to stop.`);
  await watch(port);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

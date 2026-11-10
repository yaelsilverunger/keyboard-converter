'use strict';

const {
  app, BrowserWindow, globalShortcut, clipboard,
  Tray, Menu, nativeImage, Notification, systemPreferences
} = require('electron');
const { exec } = require('child_process');
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const fs = require('fs');
const { convert } = require('./converter');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.keyboard-converter');
}

let win, tray;
let isQuitting = false;

// VBScript file for fast key simulation (cscript starts in ~50ms vs PowerShell ~400ms)
const VBS_PATH = path.join(os.tmpdir(), 'kbconv_sendkeys.vbs');

function initVbs() {
  if (process.platform !== 'win32') return;
  fs.writeFileSync(VBS_PATH,
    'Set ws = CreateObject("WScript.Shell")\n' +
    'ws.SendKeys WScript.Arguments(0)\n'
  );
}

// ---- Generate a 16x16 solid-color PNG icon (no external files needed) ----
function buildPng(r, g, b) {
  const W = 16, H = 16;
  const row = Buffer.alloc(W * 3 + 1);
  row[0] = 0; // filter: none
  for (let x = 0; x < W; x++) { row[1+x*3]=r; row[2+x*3]=g; row[3+x*3]=b; }
  const raw = Buffer.concat(Array.from({ length: H }, () => Buffer.from(row)));
  const compressed = zlib.deflateSync(raw);

  function crc32(buf) {
    let c = 0xffffffff;
    for (const byte of buf) {
      c ^= byte;
      for (let i = 0; i < 8; i++) c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type), td = Buffer.concat([t, data]);
    const len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // bit depth=8, RGB color type

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Reads clipboard text, handling both sync and async clipboard.readText() implementations
async function readClipboardText() {
  const raw = await Promise.resolve(clipboard.readText());
  return String(raw || '');
}

// ---- Key simulation via VBScript (cscript.exe starts in ~50ms, no focus steal) ----
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// macOS virtual key codes - layout independent, so they work while the Hebrew layout is active
const MAC_KEY_CODES = { '^c': 8, '^v': 9 };

function sendKeys(keys) {
  return new Promise(resolve => {
    if (process.platform === 'darwin') {
      // macOS: simulate Cmd+<key> via System Events (needs Accessibility permission)
      const code = MAC_KEY_CODES[keys];
      exec(`osascript -e 'tell application "System Events" to key code ${code} using command down'`, err => {
        if (err) {
          console.error('osascript failed:', err.message);
          notify('Cannot simulate keys - grant Accessibility permission in System Settings > Privacy & Security');
        }
        resolve();
      });
    } else {
      exec(`cscript //nologo "${VBS_PATH}" "${keys}"`, { windowsHide: true }, resolve);
    }
  });
}

// ---- Convert and paste back (Ctrl+Shift+Z) ----
// macOS: copies the current selection automatically. Windows: user must Ctrl+C first.
async function convertAndPaste() {
  if (process.platform === 'darwin') {
    // Wait for the user to release Ctrl+Shift, otherwise they combine with the simulated Cmd+C / Cmd+V
    await sleep(300);
    const previous = await readClipboardText();
    clipboard.clear();
    await sendKeys('^c');
    await sleep(150);
    if (!(await readClipboardText())) {
      clipboard.writeText(previous);
      notify('No text selected');
      return;
    }
  }

  const text = await readClipboardText();

  if (!text) {
    notify('Clipboard is empty - select your text and press Ctrl+C first');
    return;
  }

  const converted = convert(text);

  if (converted === text) {
    notify('No change - text may already be correct');
    return;
  }

  clipboard.writeText(converted);
  await sleep(100);
  await sendKeys('^v');
  notify(`Converted: "${converted.slice(0, 50)}"`);
}

// ---- Convert clipboard content only (no auto-paste) ----
async function convertClipboard() {
  const text = await readClipboardText();
  if (!text) { notify('Clipboard is empty'); return; }
  const converted = convert(text);
  if (converted === text) { notify('No change - text may already be correct'); return; }
  clipboard.writeText(converted);
  notify(`"${text.slice(0, 30)}" → "${converted.slice(0, 30)}"\nPress Ctrl+V to paste`);
}

function notify(body) {
  if (Notification.isSupported()) {
    new Notification({ title: 'Keyboard Converter', body }).show();
  }
}

// ---- Main window ----
function createWindow() {
  win = new BrowserWindow({
    width: 780, height: 560,
    minWidth: 600, minHeight: 460,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    title: 'Keyboard Layout Converter',
    backgroundColor: '#12121f',
    skipTaskbar: true, // hidden from taskbar when not focused
    show: false
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => win.show());
  win.on('show', () => win.setSkipTaskbar(false));
  win.on('hide', () => win.setSkipTaskbar(true));

  // Close button hides to tray instead of quitting
  win.on('close', e => {
    if (!isQuitting) { e.preventDefault(); win.hide(); }
  });
}

// ---- System tray ----
function createTray() {
  const icon = nativeImage.createFromBuffer(buildPng(90, 79, 232)); // #5a4fe8
  tray = new Tray(icon);
  tray.setToolTip('Keyboard Converter');

  const menu = Menu.buildFromTemplate([
    { label: 'Open', click: () => { win.show(); win.focus(); } },
    { type: 'separator' },
    {
      label: 'Convert & paste clipboard   Ctrl+Shift+Z',
      click: () => convertAndPaste().catch(console.error)
    },
    {
      label: 'Convert clipboard   Ctrl+Shift+X',
      click: () => convertClipboard()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { isQuitting = true; app.quit(); }
    }
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// ---- App lifecycle ----
app.whenReady().then(() => {
  initVbs(); // write the VBScript helper to temp dir
  if (process.platform === 'darwin') {
    systemPreferences.isTrustedAccessibilityClient(true); // prompts for Accessibility permission if missing
  }
  createWindow();
  createTray();

  // Ctrl+Shift+Z: convert clipboard and paste back (user must Ctrl+C first)
  if (!globalShortcut.register('Control+Shift+Z', () => {
    convertAndPaste().catch(console.error);
  })) console.error('Failed to register Ctrl+Shift+Z - another app may be using it');

  // Ctrl+Shift+X: convert clipboard only (fallback if selection doesn't work)
  globalShortcut.register('Control+Shift+X', () => {
    convertClipboard().catch(console.error);
  });
});

app.on('before-quit', () => { isQuitting = true; });
app.on('activate', () => { if (win) { win.show(); win.focus(); } }); // macOS: Dock click
app.on('window-all-closed', () => { /* stay alive via tray */ });

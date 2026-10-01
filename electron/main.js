// Scratch Sheet - Electron main process
// Floating, always-on-top spreadsheet post-it. Lives in the tray, toggled by a global hotkey.

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, nativeImage, clipboard, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { exportXlsx } = require('./export');

// ---------------------------------------------------------------------------
// Paths (single configurable location: everything lives under userData)
// ---------------------------------------------------------------------------
const DATA_DIR = app.getPath('userData');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const SHEET_PATH = path.join(DATA_DIR, 'sheet.json');
const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.png');

const DEFAULT_CONFIG = {
  hotkey: 'Control+Alt+Space',
  alwaysOnTop: true,
  darkMode: true,
  launchAtLogin: true,
  bounds: { width: 560, height: 400 },
};

app.setName('Scratch Sheet');
let config = loadConfig();
let win = null;
let tray = null;
let quitting = false;
const startHidden = process.argv.includes('--hidden');

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw, bounds: { ...DEFAULT_CONFIG.bounds, ...(raw.bounds || {}) } };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('config save failed', err);
  }
}

// Atomic write so a crash mid-save never corrupts the sheet.
async function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, file);
}

// ---------------------------------------------------------------------------
// Single instance: a second launch just shows the existing window
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(init);
}

function init() {
  createWindow();
  createTray();
  registerHotkey();
  applyLoginItem();
  if (!startHidden) showWindow();
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    ...config.bounds,
    minWidth: 280,
    minHeight: 160,
    frame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: config.alwaysOnTop,
    backgroundColor: config.darkMode ? '#1b1f24' : '#ffffff',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // Keep formulas and autosave running when the note is covered by another window.
      backgroundThrottling: false,
    },
  });

  if (config.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Close = hide to tray. Quit only from the tray menu.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  const rememberBounds = debounce(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    config.bounds = win.getBounds();
    saveConfig();
  }, 400);
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);

  // Open any external links in the browser, never inside the note.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showWindow() {
  if (!win) return;
  win.show();
  win.focus();
  win.webContents.send('window:shown');
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) {
    win.hide();
  } else {
    showWindow();
  }
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray() {
  const img = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
  tray.setToolTip('Scratch Sheet');
  tray.on('click', toggleWindow);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'Show / Hide', click: toggleWindow },
    { label: `Hotkey: ${config.hotkey}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: config.alwaysOnTop,
      click: (item) => {
        config.alwaysOnTop = item.checked;
        win.setAlwaysOnTop(item.checked, 'floating');
        saveConfig();
        win.webContents.send('config:changed', publicConfig());
      },
    },
    {
      label: 'Dark mode',
      type: 'checkbox',
      checked: config.darkMode,
      click: (item) => {
        config.darkMode = item.checked;
        saveConfig();
        win.setBackgroundColor(item.checked ? '#1b1f24' : '#ffffff');
        win.webContents.send('config:changed', publicConfig());
      },
    },
    {
      label: 'Launch at startup',
      type: 'checkbox',
      checked: config.launchAtLogin,
      click: (item) => {
        config.launchAtLogin = item.checked;
        saveConfig();
        applyLoginItem();
      },
    },
    { type: 'separator' },
    { label: 'Open data folder', click: () => shell.openPath(DATA_DIR) },
    { label: 'Edit config', click: () => { saveConfig(); shell.openPath(CONFIG_PATH); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ---------------------------------------------------------------------------
// Hotkey + login item
// ---------------------------------------------------------------------------
function registerHotkey() {
  globalShortcut.unregisterAll();
  if (!config.hotkey) return;
  let ok = false;
  try {
    ok = globalShortcut.register(config.hotkey, toggleWindow);
  } catch (err) {
    console.error('hotkey register threw', err);
  }
  if (!ok) {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Scratch Sheet',
      message: `Could not register hotkey "${config.hotkey}".`,
      detail: 'Another app probably owns it. Change "hotkey" in config.json (tray > Edit config) and restart.',
    });
  }
}

function applyLoginItem() {
  // Only the packaged exe registers itself to run at login. A dev run (electron .) must not
  // leave a startup entry pointing at node_modules.
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin: config.launchAtLogin, path: process.execPath, args: ['--hidden'] });
  } catch (err) {
    console.error('login item failed', err);
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function publicConfig() {
  return { hotkey: config.hotkey, darkMode: config.darkMode, alwaysOnTop: config.alwaysOnTop };
}

ipcMain.handle('config:get', () => publicConfig());

ipcMain.handle('sheet:load', async () => {
  try {
    return JSON.parse(await fsp.readFile(SHEET_PATH, 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('sheet:save', async (_e, snapshot) => {
  await writeAtomic(SHEET_PATH, JSON.stringify(snapshot));
  return true;
});

ipcMain.handle('clipboard:write', (_e, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

ipcMain.handle('sheet:export', async (_e, snapshot) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save Scratch Sheet as spreadsheet',
    defaultPath: path.join(app.getPath('documents'), `scratch-sheet-${stamp()}.xlsx`),
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    await exportXlsx(snapshot, filePath);
    return { ok: true, filePath };
  } catch (err) {
    console.error('export failed', err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.on('window:hide', () => win && win.hide());
ipcMain.on('window:toggle-pin', () => {
  config.alwaysOnTop = !config.alwaysOnTop;
  win.setAlwaysOnTop(config.alwaysOnTop, 'floating');
  saveConfig();
  refreshTrayMenu();
  win.webContents.send('config:changed', publicConfig());
});

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

app.on('will-quit', () => globalShortcut.unregisterAll());
// Keep running in the tray even when the window is hidden.
app.on('window-all-closed', () => {});

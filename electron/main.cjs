'use strict';
// Desktop wrapper: loads the built UI (ui/dist) from disk. Everything runs offline; no network access is needed.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

const dev = process.argv.includes('--dev');

// Packaged app keeps all its data (saved state, caches) in a "data" folder next to the executable,
// so the whole installation can live in one place (e.g. D:\C\programx580vnx).
if (app.isPackaged) {
  const dir = path.join(path.dirname(process.execPath), 'data');
  app.setPath('userData', dir);
  app.setPath('sessionData', dir);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 880,
    minWidth: 300,
    minHeight: 540,
    backgroundColor: '#101114',
    title: 'fx-580VN X Emulator',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  // never navigate away from the app and never open new windows
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:') && !(dev && url.startsWith('http://localhost'))) e.preventDefault();
  });
  if (dev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'ui', 'dist', 'index.html'));
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('second-instance', () => {
    const [w] = BrowserWindow.getAllWindows();
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

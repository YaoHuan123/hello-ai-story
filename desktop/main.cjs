const { app, BrowserWindow, Menu } = require("electron");

const WINDOW_TITLE = "Hello Story Live";
const DEFAULT_URL = "http://localhost:5173";
const DEFAULT_WIDTH = 430;
const DEFAULT_HEIGHT = 932;
const MIN_HEIGHT = 600;

/** @type {BrowserWindow | null} */
let mainWindow = null;

function shellUrl() {
  return process.env.LIVE_SHELL_URL?.trim() || DEFAULT_URL;
}

function alwaysOnTop() {
  return process.env.LIVE_SHELL_ALWAYS_ON_TOP === "1";
}

function openDevTools() {
  return process.env.NODE_ENV !== "production" && process.env.LIVE_SHELL_DEVTOOLS !== "0";
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: WINDOW_TITLE,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: DEFAULT_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: "#f2f2f7",
    alwaysOnTop: alwaysOnTop(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.setTitle(WINDOW_TITLE);
  void mainWindow.loadURL(shellUrl());

  if (openDevTools()) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

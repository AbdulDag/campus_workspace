// ─────────────────────────────────────────────────────────────
// Campus Workspace — Main Process (Dynamic Multi-Tab Browser)
// Manages a dynamic array of BrowserViews, each sharing the
// persist:campus-workspace session for SSO. Enforces HTTPS-only
// browsing, permission request blocking, and Courselink heartbeat.
// ─────────────────────────────────────────────────────────────
const {
  app, BrowserWindow, BrowserView, Tray, Menu,
  ipcMain, powerSaveBlocker, session, nativeImage, net
} = require('electron');
const path = require('path');

// ── Chromium Feature Pruning ─────────────────────────────────
app.commandLine.appendSwitch('disable-webrtc');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('use-angle', 'default');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');

// ── Constants ────────────────────────────────────────────────
const PARTITION          = 'persist:campus-workspace';
const HOME_URL           = 'https://courselink.uoguelph.ca/shared/login/login.html';
const NEW_TAB_URL        = 'https://www.google.com';
const TITLE_BAR_HEIGHT   = 36;
const NAV_BAR_HEIGHT     = 44;
const STATUS_BAR_HEIGHT  = 26;
const CHROME_HEIGHT      = TITLE_BAR_HEIGHT + NAV_BAR_HEIGHT + STATUS_BAR_HEIGHT;

// ── Globals ──────────────────────────────────────────────────
let mainWindow     = null;
let pomodoroWindow = null;
let tray           = null;
let powerBlockerId = null;

// Tab management: array of { id, view, url, title }
let tabs          = [];
let activeTabId   = null;
let nextTabId     = 1;

// ── Heartbeat (Main Process) ─────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const HEARTBEAT_ENDPOINT    = 'https://courselink.uoguelph.ca/d2l/api/lp/1.0/users/whoami';
let heartbeatInterval = null;
let heartbeatStatus   = { time: null, status: 'idle' };

async function sendHeartbeat() {
  try {
    // Use ses.fetch() — directly uses the session's cookie store
    const ses = session.fromPartition(PARTITION);
    const resp = await ses.fetch(HEARTBEAT_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
    });
    heartbeatStatus.status = resp.ok ? 'ok' : `error:${resp.status}`;
    heartbeatStatus.time = new Date().toISOString();
    console.log(`[Heartbeat] ${heartbeatStatus.status} @ ${heartbeatStatus.time}`);
  } catch (err) {
    heartbeatStatus.status = 'error:network';
    heartbeatStatus.time = new Date().toISOString();
    console.warn('[Heartbeat] Failed:', err.message);
  }
  // Push status to renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('heartbeat-update', { ...heartbeatStatus });
  }
}

function startHeartbeat() {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  console.log('[Heartbeat] Started — interval', HEARTBEAT_INTERVAL_MS / 1000, 's');
}

// Always fire immediately on each Courselink navigation (e.g. after login)
function triggerHeartbeat() {
  startHeartbeat();  // ensure interval is running
  sendHeartbeat();   // fire NOW, don't wait 15 min
}

// ── Session & Permission Setup ───────────────────────────────
function setupSession() {
  const ses = session.fromPartition(PARTITION);

  // Block all permission requests by default unless the user
  // explicitly approves camera/mic/geolocation via a dialog.
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['clipboard-read', 'clipboard-sanitized-write', 'notifications'];
    if (allowed.includes(permission)) {
      callback(true);
      return;
    }
    console.log(`[Permissions] Blocked: ${permission} from ${webContents.getURL()}`);
    callback(false);
  });

  ses.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['clipboard-read', 'clipboard-sanitized-write', 'notifications'];
    return allowed.includes(permission);
  });
}

// ── HTTPS-Only Navigation Guard ──────────────────────────────
function isSecureUrl(url) {
  if (!url) return false;
  return url.startsWith('https://') || url.startsWith('file://') || url.startsWith('about:');
}

// ── BrowserView Tab Management ───────────────────────────────
function createTab(url = NEW_TAB_URL) {
  const id = nextTabId++;
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: PARTITION,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const tabData = { id, view, url, title: 'New Tab' };
  tabs.push(tabData);

  // ── Navigation security for this view ────────────────────
  const wc = view.webContents;

  // HTTPS-only: block non-secure navigations
  wc.on('will-navigate', (event, navUrl) => {
    console.log(`[Tab ${id}] will-navigate →`, navUrl);
    if (!isSecureUrl(navUrl)) {
      console.warn(`[Tab ${id}] Blocked insecure navigation:`, navUrl);
      event.preventDefault();
    }
  });

  wc.on('did-redirect-navigation', (_event, navUrl) => {
    console.log(`[Tab ${id}] did-redirect-navigation →`, navUrl);
  });

  // Intercept new-window requests (e.g. target="_blank")
  // → open in a new tab instead of a new Electron window
  wc.setWindowOpenHandler(({ url: popupUrl }) => {
    if (isSecureUrl(popupUrl)) {
      // Open in a new tab within our browser
      setImmediate(() => {
        const newId = createTab(popupUrl);
        switchTab(newId);
        notifyRendererTabsChanged();
      });
    } else {
      console.warn(`[Tab ${id}] Blocked insecure popup:`, popupUrl);
    }
    return { action: 'deny' }; // always deny external window
  });

  // Track title changes
  wc.on('page-title-updated', (_event, title) => {
    tabData.title = title || 'Untitled';
    notifyRendererTabsChanged();
  });

  // Track URL changes & detect Courselink for heartbeat
  wc.on('did-navigate', (_event, navUrl) => {
    tabData.url = navUrl;
    if (tabData.id === activeTabId) {
      mainWindow.webContents.send('url-changed', navUrl);
    }
    // Start/refresh heartbeat when user reaches Courselink
    if (navUrl && navUrl.includes('courselink.uoguelph.ca')) {
      triggerHeartbeat();
    }
  });

  wc.on('did-navigate-in-page', (_event, navUrl) => {
    tabData.url = navUrl;
    if (tabData.id === activeTabId) {
      mainWindow.webContents.send('url-changed', navUrl);
    }
  });

  // Loading state
  wc.on('did-start-loading', () => {
    if (tabData.id === activeTabId) {
      mainWindow.webContents.send('loading-state', true);
    }
  });

  wc.on('did-stop-loading', () => {
    if (tabData.id === activeTabId) {
      mainWindow.webContents.send('loading-state', false);
    }
  });

  // Load the URL
  view.webContents.loadURL(url);

  return id;
}

function switchTab(id) {
  const tabData = tabs.find(t => t.id === id);
  if (!tabData || !mainWindow) return;

  // Remove current view
  const currentView = mainWindow.getBrowserView();
  if (currentView) {
    mainWindow.removeBrowserView(currentView);
  }

  activeTabId = id;
  mainWindow.addBrowserView(tabData.view);
  resizeActiveView();

  // Notify renderer of current URL & title
  mainWindow.webContents.send('url-changed', tabData.url || '');
  mainWindow.webContents.send('tab-activated', id);
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tabData = tabs[idx];

  // Remove the view from the window if it's active
  if (activeTabId === id) {
    mainWindow.removeBrowserView(tabData.view);
  }

  // Destroy the webContents
  tabData.view.webContents.destroy();
  tabs.splice(idx, 1);

  // If we closed the active tab, switch to another
  if (activeTabId === id) {
    if (tabs.length > 0) {
      const nextIdx = Math.min(idx, tabs.length - 1);
      switchTab(tabs[nextIdx].id);
    } else {
      // No tabs left — create a new one
      const newId = createTab();
      switchTab(newId);
    }
  }

  notifyRendererTabsChanged();
}

function resizeActiveView() {
  if (!mainWindow) return;
  const tabData = tabs.find(t => t.id === activeTabId);
  if (!tabData) return;

  const [winW, winH] = mainWindow.getContentSize();
  tabData.view.setBounds({
    x: 0,
    y: CHROME_HEIGHT,
    width: winW,
    height: winH - CHROME_HEIGHT,
  });
}

function notifyRendererTabsChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const tabList = tabs.map(t => ({
    id: t.id,
    title: t.title || 'New Tab',
    url: t.url || '',
    active: t.id === activeTabId,
  }));
  mainWindow.webContents.send('tabs-updated', tabList);
}

// ── Main Window ──────────────────────────────────────────────
function createMainWindow() {
  setupSession();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Campus Workspace',
    backgroundColor: '#191b1f',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      partition: PARTITION,  // share session with BrowserView tabs for heartbeat
    },
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Create the default Courselink tab
    const firstTabId = createTab(HOME_URL);
    switchTab(firstTabId);
    notifyRendererTabsChanged();
  });

  // Resize the BrowserView when the window resizes
  mainWindow.on('resize', () => {
    resizeActiveView();
  });

  // Close → hide to tray
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Pomodoro Widget Window ───────────────────────────────────
function createPomodoroWindow() {
  if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
    pomodoroWindow.show();
    pomodoroWindow.focus();
    return;
  }

  const { width: screenW, height: screenH } = require('electron').screen.getPrimaryDisplay().workAreaSize;

  pomodoroWindow = new BrowserWindow({
    width: 320,
    height: 460,
    x: screenW - 340,
    y: screenH - 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'pomodoro-preload.js'),
    },
  });

  pomodoroWindow.loadFile('pomodoro.html');

  pomodoroWindow.on('closed', () => {
    pomodoroWindow = null;
  });
}

// ── IPC Handlers ─────────────────────────────────────────────
// Tab management
ipcMain.on('new-tab', (_event, url) => {
  const targetUrl = (url && typeof url === 'string' && url.trim()) ? url.trim() : NEW_TAB_URL;
  const id = createTab(targetUrl);
  switchTab(id);
  notifyRendererTabsChanged();
});

ipcMain.on('switch-tab', (_event, id) => {
  switchTab(id);
  notifyRendererTabsChanged();
});

ipcMain.on('close-tab', (_event, id) => {
  closeTab(id);
});

ipcMain.on('navigate-tab', (_event, url) => {
  const tabData = tabs.find(t => t.id === activeTabId);
  if (!tabData) return;

  let targetUrl = url.trim();

  // If isn't a URL, treat as Google search
  if (!targetUrl.match(/^https?:\/\//i)) {
    if (targetUrl.match(/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/)) {
      // Looks like a domain
      targetUrl = 'https://' + targetUrl;
    } else {
      // Treat as search query
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
    }
  }

  // HTTPS-only enforcement
  if (!isSecureUrl(targetUrl)) {
    console.warn('[Navigate] Blocked insecure URL:', targetUrl);
    mainWindow.webContents.send('navigation-blocked', targetUrl);
    return;
  }

  tabData.view.webContents.loadURL(targetUrl);
});

ipcMain.on('go-back', () => {
  const tabData = tabs.find(t => t.id === activeTabId);
  if (tabData && tabData.view.webContents.canGoBack()) {
    tabData.view.webContents.goBack();
  }
});

ipcMain.on('go-forward', () => {
  const tabData = tabs.find(t => t.id === activeTabId);
  if (tabData && tabData.view.webContents.canGoForward()) {
    tabData.view.webContents.goForward();
  }
});

ipcMain.on('reload-tab', () => {
  const tabData = tabs.find(t => t.id === activeTabId);
  if (tabData) {
    tabData.view.webContents.reload();
  }
});

// Window controls
ipcMain.on('toggle-pomodoro', () => {
  if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
    pomodoroWindow.close();
  } else {
    createPomodoroWindow();
  }
});

ipcMain.on('close-pomodoro', () => {
  if (pomodoroWindow && !pomodoroWindow.isDestroyed()) {
    pomodoroWindow.close();
  }
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

// ── System Tray ──────────────────────────────────────────────
function createTray() {
  const iconDataUrl = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVQ4T2P8z8Dwn4EIwMjIyEiMOgY0A4hxAcMoF4xyAQMDA8N/dEcT44eRHQajXDDKBQxEpwMAGbQYEXfWxVQAAAAASUVORK5CYII='
  );

  tray = new Tray(iconDataUrl);
  tray.setToolTip('Campus Workspace');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Workspace',
      click: () => { mainWindow.show(); mainWindow.focus(); },
    },
    {
      label: 'Pomodoro Timer',
      click: () => createPomodoroWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ── App Lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  console.log('[Power] powerSaveBlocker started, id:', powerBlockerId);

  createMainWindow();
  createTray();
});

app.on('window-all-closed', () => { /* keep running in tray */ });

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
  }
});

app.on('will-quit', () => {
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
    console.log('[Power] powerSaveBlocker stopped');
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

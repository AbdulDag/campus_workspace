// ─────────────────────────────────────────────────────────────
// Campus Workspace — Secure Preload Script
// Heartbeat runs in the main process (net.fetch with session).
// This preload only:
//   1. Receives heartbeat status updates via IPC
//   2. Provides contextBridge API for renderer UI
//   3. IPC bridge for tab management & window controls
// ─────────────────────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require('electron');

// ── Context Bridge API ───────────────────────────────────────
contextBridge.exposeInMainWorld('campusWorkspace', {
  // Heartbeat (status pushed from main process)
  onHeartbeatUpdate: (cb) => ipcRenderer.on('heartbeat-update', (_e, status) => cb(status)),

  // Tab management (IPC to main process)
  newTab:      (url) => ipcRenderer.send('new-tab', url),
  switchTab:   (id)  => ipcRenderer.send('switch-tab', id),
  closeTab:    (id)  => ipcRenderer.send('close-tab', id),
  navigateTab: (url) => ipcRenderer.send('navigate-tab', url),
  goBack:      ()    => ipcRenderer.send('go-back'),
  goForward:   ()    => ipcRenderer.send('go-forward'),
  reloadTab:   ()    => ipcRenderer.send('reload-tab'),

  // Listen for main-process events
  onTabsUpdated:      (cb) => ipcRenderer.on('tabs-updated', (_e, data) => cb(data)),
  onUrlChanged:       (cb) => ipcRenderer.on('url-changed', (_e, url)  => cb(url)),
  onTabActivated:     (cb) => ipcRenderer.on('tab-activated', (_e, id)  => cb(id)),
  onLoadingState:     (cb) => ipcRenderer.on('loading-state', (_e, loading) => cb(loading)),
  onNavigationBlocked:(cb) => ipcRenderer.on('navigation-blocked', (_e, url) => cb(url)),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow:    () => ipcRenderer.send('close-window'),

  // Pomodoro
  togglePomodoro: () => ipcRenderer.send('toggle-pomodoro'),
});

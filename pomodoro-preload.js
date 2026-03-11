// ─────────────────────────────────────────────────────────────
// Campus Workspace — Pomodoro Preload
// Minimal contextBridge for the Pomodoro frameless window.
// ─────────────────────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomodoroAPI', {
  closeWindow: () => ipcRenderer.send('close-pomodoro'),
});

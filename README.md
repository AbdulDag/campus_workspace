<p align="center">
  <img src="assets/icon.png" width="80" alt="Campus Workspace Logo"/>
</p>

<h1 align="center">Campus Workspace</h1>

<p align="center">
  <strong>A modern, secure Electron browser built for Ontario university students.</strong><br/>
  Eliminates D2L/Microsoft MFA fatigue and inactivity timeouts — without touching your credentials.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-41-47848f?logo=electron" alt="Electron 41"/>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"/>
  <img src="https://img.shields.io/badge/Platform-Windows%20|%20macOS%20|%20Linux-blue" alt="Platforms"/>
</p>

---

## 🎯 Project Vision

University students hate re-authenticating through Microsoft Entra ID and D2L Brightspace. Shared computers, AFK timeouts, and MFA fatigue break study flow constantly.

**Campus Workspace** is a purpose-built Electron browser that:
- Persists your authenticated D2L session across app restarts and system reboots
- Sends a silent 15-minute heartbeat to prevent idle logouts
- Shares a single SSO session across all tabs — log in once, access everything
- Looks and feels like a modern browser (Brave-inspired dark UI)

> **Zero credentials stored. Zero cloud sync. Zero tracking.**

---

## ✨ Key Features

### 🔗 Persistent Shared Sessions
All tabs share a single `persist:campus-workspace` session partition. Your D2L login carries over to Outlook, Teams, OneDrive, and any Microsoft service — in any tab. Sessions survive app restarts via OS-level encrypted storage.

### 💓 D2L Inactivity Heartbeat
A main-process heartbeat sends a non-destructive `GET` to `/d2l/api/lp/1.0/users/whoami` every 15 minutes. The `powerSaveBlocker` ensures this runs even when the laptop lid is closed. No auto-clicker bots. No page manipulation.

### 🎨 Brave-Inspired Dark UI
- Charcoal background (`#191b1f`) with orange accents (`#ff7632`)
- Dynamic tab strip with `+` button and keyboard shortcuts (`Ctrl+T/W/L`)
- Pill-shaped address bar with smart URL/search detection
- Heartbeat status indicator with real-time feedback

### 🍅 Pomodoro Timer
A frameless, always-on-top productivity timer with:
- Configurable focus, short break, and long break durations
- Adjustable cycle count (1–10 sessions before long break)
- Auto-start toggles for breaks and focus phases
- Web Audio API beep notifications

### 🛡️ Security Guardrails
- HTTPS-only navigation enforcement
- Camera, microphone, and geolocation blocked by default
- `target="_blank"` popups intercepted and opened as new tabs
- Full sandbox: `nodeIntegration: false`, `contextIsolation: true`

---

## 🔒 Security Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Campus Workspace                      │
│                                                          │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ BrowserView│  │ BrowserView  │  │   BrowserView    │ │
│  │  Courselink │  │   Outlook    │  │   Google/Other   │ │
│  │  (Tab 1)   │  │   (Tab 2)    │  │    (Tab N)       │ │
│  └─────┬──────┘  └──────┬───────┘  └───────┬──────────┘ │
│        │                │                   │            │
│        └────────────────┼───────────────────┘            │
│                         │                                │
│              ┌──────────▼──────────┐                     │
│              │  persist:campus-    │                      │
│              │  workspace session  │ ◄── Shared cookies   │
│              └──────────┬──────────┘                     │
│                         │                                │
│              ┌──────────▼──────────┐                     │
│              │  OS Encrypted Store │                      │
│              │  (DPAPI / Keychain) │ ◄── Zero-Knowledge   │
│              └─────────────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

### Zero-Knowledge Model
The app **never touches your credentials**. It hosts the official university SSO portal (Microsoft Entra ID → D2L Brightspace redirect chain) inside a sandboxed `BrowserView`. Your username and password are entered directly into Microsoft's login page — the app simply retains the resulting session cookies.

### OS-Level Encryption
Session cookies are stored in Electron's `persist:` partition, which uses:
- **Windows**: DPAPI (Data Protection API) — encrypted with your Windows login credentials
- **macOS**: Keychain — encrypted with your macOS user account
- **Linux**: libsecret / GNOME Keyring

No cloud sync. No telemetry. All data stays on your device.

---

## 📁 Project Structure

```
campus_workspace/
├── main.js                 # Electron main process (tabs, heartbeat, security)
├── preload.js              # Secure IPC bridge (sandboxed)
├── pomodoro-preload.js     # Minimal preload for Pomodoro widget
├── index.html              # Main browser shell UI
├── styles.css              # Brave-inspired dark theme
├── renderer.js             # Tab strip, address bar, keyboard shortcuts
├── pomodoro.html           # Pomodoro timer widget UI
├── pomodoro.css            # Pomodoro widget styles
├── pomodoro.js             # Pomodoro timer logic (configurable)
├── package.json            # Dependencies & electron-builder config
├── .gitignore              # Excludes node_modules, dist, sessions
├── assets/
│   └── icon.png            # App icon
└── dist/                   # Build output (gitignored)
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (LTS recommended)
- [Git](https://git-scm.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/campus-workspace.git
cd campus-workspace

# Install dependencies
npm install

# Launch the app
npm start
```

### Build Installer

```bash
# Windows (.exe installer)
npm run build

# All platforms
npm run build:all
```

The installer will be generated in the `dist/` folder.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close active tab |
| `Ctrl+L` / `F6` | Focus address bar |
| `Ctrl+R` / `F5` | Reload tab |
| `Enter` (in address bar) | Navigate or search Google |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ for university students who deserve better than MFA fatigue.
</p>

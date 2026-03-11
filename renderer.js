// ─────────────────────────────────────────────────────────────
// Campus Workspace — Renderer Script (Dynamic Multi-Tab)
// Manages the dynamic tab strip, address bar with autocomplete,
// navigation controls, heartbeat UI, and session age tracking.
// ─────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── DOM References ──────────────────────────────────────
  const tabStrip       = document.getElementById('tab-strip');
  const btnNewTab      = document.getElementById('btn-new-tab');
  const addressBar     = document.getElementById('address-bar');
  const suggestions    = document.getElementById('address-suggestions');
  const btnBack        = document.getElementById('btn-back');
  const btnForward     = document.getElementById('btn-forward');
  const btnReload      = document.getElementById('btn-reload');
  const heartbeatDot   = document.getElementById('heartbeat-dot');
  const heartbeatLabel = document.getElementById('heartbeat-label');
  const statusUrl      = document.getElementById('status-url');
  const sessionAge     = document.getElementById('session-age');
  const btnPomodoro    = document.getElementById('btn-pomodoro');
  const btnMinimize    = document.getElementById('btn-minimize');
  const btnMaximize    = document.getElementById('btn-maximize');
  const btnClose       = document.getElementById('btn-close');
  const secureIcon     = document.getElementById('address-bar-secure-icon');

  const api = window.campusWorkspace;
  if (!api) {
    console.error('[Renderer] campusWorkspace API not available');
    return;
  }

  // ── Session start time ──────────────────────────────────
  const sessionStart = Date.now();

  // ── Browsing History (in-memory, per session) ───────────
  const MAX_HISTORY = 200;
  let browsingHistory = []; // { url, title, timestamp }

  function addToHistory(url, title) {
    if (!url || url === 'about:blank') return;
    // Skip duplicates of the exact same URL in sequence
    if (browsingHistory.length > 0 && browsingHistory[0].url === url) return;

    browsingHistory.unshift({
      url,
      title: title || '',
      timestamp: Date.now(),
    });

    // Cap history
    if (browsingHistory.length > MAX_HISTORY) {
      browsingHistory.length = MAX_HISTORY;
    }
  }

  // ── Tab Strip Rendering ─────────────────────────────────
  let currentTabs = [];

  api.onTabsUpdated((tabList) => {
    currentTabs = tabList;
    renderTabs(tabList);
    // Track URLs in history from tab title updates
    tabList.forEach(tab => {
      if (tab.url && tab.url !== 'about:blank') {
        addToHistory(tab.url, tab.title);
      }
    });
  });

  function renderTabs(tabList) {
    tabStrip.innerHTML = '';

    tabList.forEach(tab => {
      const el = document.createElement('button');
      el.className = 'browser-tab' + (tab.active ? ' active' : '');
      el.dataset.id = tab.id;

      // Truncated title
      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title';
      titleSpan.textContent = tab.title || 'New Tab';
      el.appendChild(titleSpan);

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.setAttribute('aria-label', 'Close tab');
      closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        api.closeTab(tab.id);
      });
      el.appendChild(closeBtn);

      // Click to switch
      el.addEventListener('click', () => {
        api.switchTab(tab.id);
      });

      tabStrip.appendChild(el);
    });
  }

  // ── New Tab ─────────────────────────────────────────────
  btnNewTab.addEventListener('click', () => {
    api.newTab();
  });

  // ── Address Bar + Autocomplete ──────────────────────────
  let activeSuggestionIdx = -1;

  addressBar.addEventListener('keydown', (e) => {
    const items = suggestions.querySelectorAll('.suggestion-item');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeSuggestionIdx = Math.min(activeSuggestionIdx + 1, items.length - 1);
      updateActiveSuggestion(items);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeSuggestionIdx = Math.max(activeSuggestionIdx - 1, -1);
      updateActiveSuggestion(items);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      // If a suggestion is highlighted, use it
      if (activeSuggestionIdx >= 0 && items[activeSuggestionIdx]) {
        const url = items[activeSuggestionIdx].dataset.url;
        if (url) {
          addressBar.value = url;
          api.navigateTab(url);
        }
      } else {
        const val = addressBar.value.trim();
        if (val) {
          api.navigateTab(val);
        }
      }
      hideSuggestions();
      addressBar.blur();
      return;
    }

    if (e.key === 'Escape') {
      hideSuggestions();
      addressBar.blur();
      return;
    }
  });

  addressBar.addEventListener('input', () => {
    const query = addressBar.value.trim().toLowerCase();
    if (query.length === 0) {
      hideSuggestions();
      return;
    }
    showSuggestions(query);
  });

  // Select all on focus, show recent history
  addressBar.addEventListener('focus', () => {
    setTimeout(() => {
      addressBar.select();
      const query = addressBar.value.trim().toLowerCase();
      if (query.length > 0) {
        showSuggestions(query);
      } else {
        // Show recent history when focused with empty bar
        showRecentHistory();
      }
    }, 0);
  });

  addressBar.addEventListener('blur', () => {
    // Small delay to allow clicking suggestions
    setTimeout(() => hideSuggestions(), 150);
  });

  function showSuggestions(query) {
    activeSuggestionIdx = -1;
    suggestions.innerHTML = '';

    // Search through history
    const seen = new Set();
    const matches = browsingHistory.filter(h => {
      if (seen.has(h.url)) return false;
      seen.add(h.url);
      const titleMatch = (h.title || '').toLowerCase().includes(query);
      const urlMatch = (h.url || '').toLowerCase().includes(query);
      return titleMatch || urlMatch;
    }).slice(0, 8);

    // Always add a Google search suggestion at the top
    const searchItem = createSuggestionEl({
      type: 'search',
      text: `Search Google for "${query}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    });
    suggestions.appendChild(searchItem);

    // Add history matches
    matches.forEach(h => {
      const item = createSuggestionEl({
        type: 'history',
        text: h.title || h.url,
        url: h.url,
      });
      suggestions.appendChild(item);
    });

    suggestions.classList.remove('hidden');
  }

  function showRecentHistory() {
    activeSuggestionIdx = -1;
    suggestions.innerHTML = '';

    const seen = new Set();
    const recent = browsingHistory.filter(h => {
      if (seen.has(h.url)) return false;
      seen.add(h.url);
      return true;
    }).slice(0, 8);

    if (recent.length === 0) {
      hideSuggestions();
      return;
    }

    recent.forEach(h => {
      const item = createSuggestionEl({
        type: 'history',
        text: h.title || h.url,
        url: h.url,
      });
      suggestions.appendChild(item);
    });

    suggestions.classList.remove('hidden');
  }

  function createSuggestionEl({ type, text, url }) {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.dataset.url = url;

    const icon = document.createElement('span');
    icon.className = 'suggestion-icon' + (type === 'search' ? ' search-icon' : '');
    if (type === 'search') {
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    } else {
      icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M8 4v5l3 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    }
    div.appendChild(icon);

    const textSpan = document.createElement('span');
    textSpan.className = 'suggestion-text';
    textSpan.textContent = text;
    div.appendChild(textSpan);

    if (type === 'history' && url) {
      const urlSpan = document.createElement('span');
      urlSpan.className = 'suggestion-url';
      try {
        urlSpan.textContent = new URL(url).hostname;
      } catch {
        urlSpan.textContent = url;
      }
      div.appendChild(urlSpan);
    }

    div.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent blur
      addressBar.value = url;
      api.navigateTab(url);
      hideSuggestions();
      addressBar.blur();
    });

    return div;
  }

  function updateActiveSuggestion(items) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === activeSuggestionIdx);
      if (i === activeSuggestionIdx) {
        addressBar.value = item.dataset.url || '';
      }
    });
  }

  function hideSuggestions() {
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    activeSuggestionIdx = -1;
  }

  // Update address bar when URL changes
  api.onUrlChanged((url) => {
    addressBar.value = url || '';
    updateStatusUrl(url);
    updateSecureIcon(url);
  });

  api.onTabActivated((_id) => {
    // Tab switch handled — tabs-updated will also fire
  });

  api.onLoadingState((loading) => {
    if (loading) {
      btnReload.style.opacity = '0.5';
    } else {
      btnReload.style.opacity = '1';
    }
  });

  api.onNavigationBlocked((url) => {
    console.warn('[Renderer] Navigation blocked (insecure):', url);
  });

  // ── Navigation Controls ─────────────────────────────────
  btnBack.addEventListener('click', () => api.goBack());
  btnForward.addEventListener('click', () => api.goForward());
  btnReload.addEventListener('click', () => api.reloadTab());

  // ── Secure Icon ─────────────────────────────────────────
  function updateSecureIcon(url) {
    if (url && url.startsWith('https://')) {
      secureIcon.style.display = 'flex';
    } else {
      secureIcon.style.display = 'none';
    }
  }

  // ── Status Bar URL ──────────────────────────────────────
  function updateStatusUrl(url) {
    if (statusUrl && url) {
      try {
        const parsed = new URL(url);
        statusUrl.textContent = parsed.hostname + parsed.pathname;
      } catch {
        statusUrl.textContent = url;
      }
    }
  }

  // ── Heartbeat Status UI ─────────────────────────────────
  api.onHeartbeatUpdate((status) => {
    heartbeatDot.className = '';
    if (status.status === 'ok') {
      heartbeatDot.classList.add('ok');
      heartbeatLabel.textContent = 'Active';
    } else if (status.status === 'error:403') {
      heartbeatDot.classList.add('waiting');
      heartbeatLabel.textContent = 'Login needed';
    } else if (status.status && status.status.startsWith('error')) {
      heartbeatDot.classList.add('error');
      heartbeatLabel.textContent = 'Error';
    } else {
      heartbeatLabel.textContent = status.status || 'Idle';
    }
  });

  // ── Session Age Timer ───────────────────────────────────
  function updateSessionAge() {
    const elapsed = Date.now() - sessionStart;
    const hrs  = Math.floor(elapsed / 3600000);
    const mins = Math.floor((elapsed % 3600000) / 60000);
    if (hrs > 0) {
      sessionAge.textContent = `${hrs}h ${mins}m`;
    } else {
      sessionAge.textContent = `${mins}m`;
    }
  }
  setInterval(updateSessionAge, 30000);
  updateSessionAge();

  // ── Window Control Buttons ──────────────────────────────
  btnMinimize.addEventListener('click', () => api.minimizeWindow());
  btnMaximize.addEventListener('click', () => api.maximizeWindow());
  btnClose.addEventListener('click', () => api.closeWindow());
  btnPomodoro.addEventListener('click', () => api.togglePomodoro());

  // ── Keyboard Shortcuts ──────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Ctrl+T → new tab
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      api.newTab();
    }
    // Ctrl+W → close active tab
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      const active = currentTabs.find(t => t.active);
      if (active) api.closeTab(active.id);
    }
    // Ctrl+L or F6 → focus address bar
    if ((e.ctrlKey && e.key === 'l') || e.key === 'F6') {
      e.preventDefault();
      addressBar.focus();
    }
    // Ctrl+R / F5 → reload
    if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
      e.preventDefault();
      api.reloadTab();
    }
  });

})();

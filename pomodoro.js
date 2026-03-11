// ─────────────────────────────────────────────────────────────
// Campus Workspace — Pomodoro Timer Logic (Configurable)
// State machine with user-adjustable durations and cycles.
// ─────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── Default Configuration ──────────────────────────────
  let config = {
    workDuration:     25 * 60,
    shortBreak:       5 * 60,
    longBreak:        15 * 60,
    sessionsBeforeLB: 4,
    autoStartBreak:   true,
    autoStartWork:    true,
  };

  const RING_CIRCUMFERENCE = 2 * Math.PI * 70;

  // ── State ───────────────────────────────────────────────
  let state             = 'IDLE';
  let secondsLeft       = config.workDuration;
  let totalSeconds      = config.workDuration;
  let tickInterval      = null;
  let sessionsCompleted = 0;

  // ── DOM — Timer View ────────────────────────────────────
  const minutesEl    = document.getElementById('timer-minutes');
  const secondsEl    = document.getElementById('timer-seconds');
  const timerSep     = document.getElementById('timer-sep');
  const ringProgress = document.getElementById('ring-progress');
  const phaseLabel   = document.getElementById('phase-label');
  const phaseDots    = document.getElementById('phase-dots');
  const sessionCount = document.getElementById('session-count');
  const btnStart     = document.getElementById('btn-start');
  const btnPause     = document.getElementById('btn-pause');
  const btnReset     = document.getElementById('btn-reset');
  const btnClose     = document.getElementById('pomo-close');

  // ── DOM — Settings ──────────────────────────────────────
  const btnSettingsToggle = document.getElementById('pomo-settings-toggle');
  const timerView         = document.getElementById('timer-view');
  const settingsView      = document.getElementById('settings-view');
  const setWork           = document.getElementById('set-work');
  const setWorkVal        = document.getElementById('set-work-val');
  const setShortBreak     = document.getElementById('set-short-break');
  const setShortBreakVal  = document.getElementById('set-short-break-val');
  const setLongBreak      = document.getElementById('set-long-break');
  const setLongBreakVal   = document.getElementById('set-long-break-val');
  const setCycles         = document.getElementById('set-cycles');
  const setCyclesVal      = document.getElementById('set-cycles-val');
  const setAutoBreak      = document.getElementById('set-auto-break');
  const setAutoWork       = document.getElementById('set-auto-work');
  const btnSaveSettings   = document.getElementById('btn-save-settings');
  const btnCancelSettings = document.getElementById('btn-cancel-settings');

  // ── Audio ───────────────────────────────────────────────
  let audioCtx = null;

  function playBeep(frequency = 880, durationMs = 200, count = 2) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < count; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const t = audioCtx.currentTime + (i * (durationMs + 100) / 1000);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + durationMs / 1000);
      osc.start(t);
      osc.stop(t + durationMs / 1000);
    }
  }

  // ── Phase Dots (dynamic count) ──────────────────────────
  function renderPhaseDots() {
    phaseDots.innerHTML = '';
    for (let i = 0; i < config.sessionsBeforeLB; i++) {
      const dot = document.createElement('span');
      dot.className = 'phase-dot';
      dot.dataset.index = i;
      phaseDots.appendChild(dot);
    }
  }

  // ── Display Helpers ─────────────────────────────────────
  function updateDisplay() {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    minutesEl.textContent = String(m).padStart(2, '0');
    secondsEl.textContent = String(s).padStart(2, '0');

    const fraction = 1 - (secondsLeft / totalSeconds);
    const offset = RING_CIRCUMFERENCE * (1 - fraction);
    ringProgress.style.strokeDashoffset = offset;
  }

  function updatePhaseUI() {
    phaseLabel.className = '';
    ringProgress.className = 'ring-fg';

    if (state === 'WORK') {
      phaseLabel.textContent = 'Focus';
      phaseLabel.classList.add('work');
    } else if (state === 'SHORT_BREAK') {
      phaseLabel.textContent = 'Short Break';
      phaseLabel.classList.add('break');
      ringProgress.classList.add('break');
    } else if (state === 'LONG_BREAK') {
      phaseLabel.textContent = 'Long Break';
      phaseLabel.classList.add('long');
      ringProgress.classList.add('long');
    } else {
      phaseLabel.textContent = 'Ready';
    }

    // Update dots
    const dots = phaseDots.querySelectorAll('.phase-dot');
    const currentInCycle = sessionsCompleted % config.sessionsBeforeLB;
    dots.forEach((dot, i) => {
      dot.className = 'phase-dot';
      if (i < currentInCycle) {
        dot.classList.add('completed');
      } else if (i === currentInCycle && state === 'WORK') {
        dot.classList.add('active');
      }
    });

    sessionCount.textContent = sessionsCompleted;
  }

  // ── Timer Core ──────────────────────────────────────────
  function tick() {
    if (secondsLeft <= 0) {
      clearInterval(tickInterval);
      tickInterval = null;
      onPhaseComplete();
      return;
    }
    secondsLeft--;
    updateDisplay();
  }

  function startTimer() {
    if (state === 'IDLE') {
      state = 'WORK';
      secondsLeft = config.workDuration;
      totalSeconds = config.workDuration;
      updatePhaseUI();
    }

    btnStart.style.display = 'none';
    btnPause.style.display = '';
    timerSep.style.animationPlayState = 'running';

    tickInterval = setInterval(tick, 1000);
  }

  function pauseTimer() {
    clearInterval(tickInterval);
    tickInterval = null;

    btnPause.style.display = 'none';
    btnStart.style.display = '';
    btnStart.textContent = 'Resume';
    timerSep.style.animationPlayState = 'paused';
  }

  function resetTimer() {
    clearInterval(tickInterval);
    tickInterval = null;

    state = 'IDLE';
    secondsLeft = config.workDuration;
    totalSeconds = config.workDuration;

    btnPause.style.display = 'none';
    btnStart.style.display = '';
    btnStart.textContent = 'Start';
    timerSep.style.animationPlayState = 'running';

    updateDisplay();
    updatePhaseUI();
  }

  function onPhaseComplete() {
    playBeep(state === 'WORK' ? 880 : 660, 200, state === 'WORK' ? 2 : 3);

    if (state === 'WORK') {
      sessionsCompleted++;
      if (sessionsCompleted % config.sessionsBeforeLB === 0) {
        state = 'LONG_BREAK';
        secondsLeft = config.longBreak;
        totalSeconds = config.longBreak;
      } else {
        state = 'SHORT_BREAK';
        secondsLeft = config.shortBreak;
        totalSeconds = config.shortBreak;
      }

      updatePhaseUI();
      updateDisplay();

      if (config.autoStartBreak) {
        btnStart.style.display = 'none';
        btnPause.style.display = '';
        tickInterval = setInterval(tick, 1000);
      } else {
        btnPause.style.display = 'none';
        btnStart.style.display = '';
        btnStart.textContent = 'Start Break';
      }
    } else {
      // Break is over → next work session
      state = 'WORK';
      secondsLeft = config.workDuration;
      totalSeconds = config.workDuration;

      updatePhaseUI();
      updateDisplay();

      if (config.autoStartWork) {
        btnStart.style.display = 'none';
        btnPause.style.display = '';
        tickInterval = setInterval(tick, 1000);
      } else {
        btnPause.style.display = 'none';
        btnStart.style.display = '';
        btnStart.textContent = 'Start Focus';
      }
    }
  }

  // ── Settings Panel ──────────────────────────────────────
  function openSettings() {
    // Populate sliders with current config
    setWork.value = config.workDuration / 60;
    setWorkVal.textContent = `${config.workDuration / 60} min`;
    setShortBreak.value = config.shortBreak / 60;
    setShortBreakVal.textContent = `${config.shortBreak / 60} min`;
    setLongBreak.value = config.longBreak / 60;
    setLongBreakVal.textContent = `${config.longBreak / 60} min`;
    setCycles.value = config.sessionsBeforeLB;
    setCyclesVal.textContent = config.sessionsBeforeLB;
    setAutoBreak.checked = config.autoStartBreak;
    setAutoWork.checked = config.autoStartWork;

    timerView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  }

  function closeSettings() {
    settingsView.classList.add('hidden');
    timerView.classList.remove('hidden');
  }

  function saveSettings() {
    config.workDuration     = parseInt(setWork.value) * 60;
    config.shortBreak       = parseInt(setShortBreak.value) * 60;
    config.longBreak        = parseInt(setLongBreak.value) * 60;
    config.sessionsBeforeLB = parseInt(setCycles.value);
    config.autoStartBreak   = setAutoBreak.checked;
    config.autoStartWork    = setAutoWork.checked;

    // Rebuild phase dots for new cycle count
    renderPhaseDots();

    // If idle, update display with new work duration
    if (state === 'IDLE') {
      secondsLeft = config.workDuration;
      totalSeconds = config.workDuration;
      updateDisplay();
      updatePhaseUI();
    }

    closeSettings();
  }

  // Live slider value display
  setWork.addEventListener('input', () => {
    setWorkVal.textContent = `${setWork.value} min`;
  });
  setShortBreak.addEventListener('input', () => {
    setShortBreakVal.textContent = `${setShortBreak.value} min`;
  });
  setLongBreak.addEventListener('input', () => {
    setLongBreakVal.textContent = `${setLongBreak.value} min`;
  });
  setCycles.addEventListener('input', () => {
    setCyclesVal.textContent = setCycles.value;
  });

  // ── Event Listeners ─────────────────────────────────────
  btnStart.addEventListener('click', startTimer);
  btnPause.addEventListener('click', pauseTimer);
  btnReset.addEventListener('click', resetTimer);
  btnClose.addEventListener('click', () => {
    if (window.pomodoroAPI) window.pomodoroAPI.closeWindow();
  });
  btnSettingsToggle.addEventListener('click', () => {
    if (settingsView.classList.contains('hidden')) {
      openSettings();
    } else {
      closeSettings();
    }
  });
  btnSaveSettings.addEventListener('click', saveSettings);
  btnCancelSettings.addEventListener('click', closeSettings);

  // ── Initial Render ──────────────────────────────────────
  renderPhaseDots();
  ringProgress.style.strokeDasharray = RING_CIRCUMFERENCE;
  ringProgress.style.strokeDashoffset = 0;
  updateDisplay();
  updatePhaseUI();

})();

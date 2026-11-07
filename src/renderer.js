// UI logic. Talks to the daemon only through window.hpc (see electron/preload.js).
// Opened directly in a browser there is no bridge, so the page stays a mockup.

const api = window.hpc;

const el = {
  pct: document.getElementById('pct'),
  fill: document.getElementById('fill'),
  track: document.getElementById('track'),
  batState: document.getElementById('bat-state'),
  modeNote: document.getElementById('mode-note'),
  batRate: document.getElementById('bat-rate'),
  svcWord: document.getElementById('svc-word'),
  svcExtra: document.getElementById('svc-extra'),
  svcNote: document.getElementById('svc-note'),
  svcToggle: document.getElementById('svc-toggle'),
  msg: document.getElementById('msg'),
  bypassToggle: document.getElementById('bypass-toggle'),
  msgKind: document.getElementById('msg-kind'),
  // pill: removed (no longer displayed)
  modes: Array.from(document.querySelectorAll('.seg-btn[data-mode]')),
};

let busy = false;

function say(text, kind) {
  el.msg.textContent = text;
  el.msgKind.textContent = kind === 'error' ? 'error' : (kind === 'elevated' ? '' : 'status');
  el.msgKind.classList.toggle('warn', kind !== 'error' && kind !== 'elevated');
  el.msgKind.style.color = kind === 'error' ? '#d98c8c' : (kind === 'elevated' ? '#2fd3a8' : '');
  el.msg.style.color = kind === 'elevated' ? '#e6edf3' : '';
}

function setMode(mode) {
  for (const b of el.modes) {
    const on = b.dataset.mode === mode;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function render(s) {
  if (!s || s.error) {
    el.pct.classList.add('is-stale');
    say(s && s.error ? s.error : 'daemon did not answer', 'error');
    return;
  }

  // battery
  if (typeof s.level === 'number') {
    el.pct.querySelector('.num').textContent = s.level;
    el.pct.classList.remove('is-stale');
    el.fill.style.width = s.level + '%';
    el.track.setAttribute('aria-label', 'Battery level ' + s.level + ' percent of 100');
  } else {
    el.pct.classList.add('is-stale');
  }
  el.batState.textContent = s.state || '';
  if (s.state) el.batState.title = 'AC ' + (s.ac || 'unknown');

  // manual mode
  if (s.firmware) {
    setMode(s.firmware);
    el.modeNote.textContent = '';
  } else {
    setMode(null);
    el.modeNote.textContent = s.firmwareNeedsAdmin
      ? 'Current mode unknown — reading it needs administrator rights.'
      : (s.firmwareRaw ? s.firmwareRaw : 'Current mode unknown.');
  }

  // service
  if (s.service === 'active') {
    el.svcWord.textContent = 'enabled';
    el.svcExtra.textContent = '· running';
    el.svcToggle.checked = true;
  } else if (s.service === 'inactive') {
    el.svcWord.textContent = 'disabled';
    el.svcExtra.textContent = '· stopped';
    el.svcToggle.checked = false;
  } else {
    el.svcWord.textContent = 'unknown';
    el.svcExtra.textContent = s.serviceRaw ? '· ' + s.serviceRaw : '';
  }

  // full charge bypass
  el.bypassToggle.checked = !!s.bypass;

  // charge rate (moved to the footer line below)
  el.batRate.textContent = '';

  say('battery ' + (s.level ?? '?') + '% · ' + (s.state || '—').toLowerCase()
    + ' · ac ' + (s.ac || '?')
    + (typeof s.power === 'number' ? ' · ' + s.power.toFixed(2) + ' W' : '')
    + ' · bypass ' + (s.bypass === null ? '?' : (s.bypass ? 'on' : 'off')));
}

async function refresh() {
  if (!api) return;
  try {
    render(await api.status());
  } catch (e) {
    say('status failed: ' + e.message, 'error');
  }
}

function has(label, word) { return label.toLowerCase().includes(word); }

async function act(label, fn) {
  if (busy) return;
  busy = true;
  document.body.style.cursor = 'progress';
  if (!has(label, 'service') && !has(label, 'firmware') && !has(label, 'bypass')) say(label + '…');
  let r;
  try {
    r = await fn();
    if (r && r.ok === false) {
      say(label + ' failed: ' + r.error, 'error');
    } else {
      if (has(label, 'service') && api) {
        try {
          const s = await api.status();
          if (s.service === 'active') { el.svcWord.textContent = 'enabled'; el.svcExtra.textContent = '· running'; el.svcToggle.checked = true; }
          else if (s.service === 'inactive') { el.svcWord.textContent = 'disabled'; el.svcExtra.textContent = '· stopped'; el.svcToggle.checked = false; }
          else { el.svcWord.textContent = 'unknown'; el.svcExtra.textContent = s.serviceRaw ? '· ' + s.serviceRaw : ''; }
          el.bypassToggle.checked = !!s.bypass;
        } catch (e) {}
      }
      if (has(label, 'firmware') && api) {
        const mode = label.match(/"([^"]+)"/)?.[1];
        if (mode) setMode(mode);
      }
      const elevated = r && r.elevated;
      const msg = elevated ? label + ' (elevated)' : label + ' — done';
      const bright = has(label, 'firmware') || has(label, 'bypass');
      say(msg, (elevated || bright) ? 'elevated' : undefined);
      setTimeout(() => refresh(), 3000);
    }
  } catch (e) {
    say(label + ' failed: ' + e.message, 'error');
  } finally {
    busy = false;
    document.body.style.cursor = '';
    if (has(label, 'service') || has(label, 'bypass')) setTimeout(() => refresh(), 3000);
    else if (!has(label, 'firmware')) await refresh();
  }
}

for (const b of el.modes) {
  b.addEventListener('click', () => {
    const mode = b.dataset.mode;
    act('setting firmware mode "' + mode + '"', () => api.setMode(mode));
  });
}

el.svcToggle.addEventListener('change', () => {
  const on = el.svcToggle.checked;
  // don't flip optimistically; revert now and let refresh() set final state
  el.svcToggle.checked = !on;
  act((on ? 'starting' : 'stopping') + ' service', () => api.service(on));
});

el.bypassToggle.addEventListener('change', () => {
  const on = el.bypassToggle.checked;
  act((on ? 'enabling' : 'disabling') + ' full charge bypass', () => api.bypass(on));
});

if (api) {
  refresh();
  setInterval(refresh, 20000);
} else {
  say('static preview — no daemon connection in a browser');
}
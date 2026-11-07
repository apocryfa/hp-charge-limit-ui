const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Optional: HPCL_SHOT=<path> renders the window to a PNG and quits (used for
// verifying the design without screenshotting the desktop).
const SHOT = process.env.HPCL_SHOT;

const EXE = (function () {
  const local = path.join(process.cwd(), 'hp-charge-limit-rs.exe');
  try { if (fs.existsSync(local)) return local; } catch (e) {}
  return 'hp-charge-limit-rs.exe'; // PATH
})();
const SERVICE = 'hp-charge-limit-rs';

async function runElevated(exe, args) {
  const ps = `Start-Process '${exe}' -ArgumentList ${args.map(a => `'${a}'`).join(',')} -Verb RunAs -Wait`;
  const r = await runCmd('powershell.exe', ['-NoProfile', '-Command', ps], 60000, false);
  const denied = /access is denied|impersonation failed|run as administrator/i.test(r.stdout + r.stderr);
  return { ok: r.ok && !denied, elevated: true, error: (r.ok && !denied) ? null : (r.stderr || r.stdout || 'needs administrator rights').trim() };
}

function runCmd(file, args, timeout = 20000, hide = true) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: hide }, (err, stdout, stderr) => {
      let errText = (stderr || (err ? String(err.message) : '')).trim();
      if (err && /ENOENT/i.test(err.message || '')) {
        errText = 'hp-charge-limit-rs.exe not in this folder';
      }
      resolve({
        ok: !err,
        stdout: stdout || '',
        stderr: errText,
      });
    });
  });
}

// Rows are aligned columns of text; parse tolerantly and leave anything
// unrecognised as null so the UI can say "unknown" instead of guessing.
function parseStatus(text) {
  const out = {
    ac: null, level: null, state: null, bypass: null,
    firmware: null, firmwareRaw: null, firmwareNeedsAdmin: false,
    service: null, serviceRaw: null, power: null, raw: text,
  };

  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    let m;

    if ((m = l.match(/^AC:\s*(\S+)/i))) {
      out.ac = m[1].toLowerCase();
    } else if ((m = l.match(/^battery:\s*(\d+)\s*%\s*(.*)$/i))) {
      out.level = Number(m[1]);
      // State can be one or two words: "Charging", "Not charging", "Full".
      const words = m[2].trim().split(/\s+/).filter(Boolean);
      const state = [];
      for (const w of words) {
        if (!/^[A-Za-z][A-Za-z-]*$/.test(w)) break;
        state.push(w);
      }
      out.state = state.length ? state.join(' ') : null;
    } else if ((m = l.match(/^bypass:\s*(.+)$/i))) {
      const v = m[1].toLowerCase();
      out.bypass = /^(enabled|on|true|yes)/.test(v) ? true
        : /^(disabled|off|false|no)/.test(v) ? false
        : null;
    } else if ((m = l.match(/^firmware:\s*(.+)$/i))) {
      out.firmwareRaw = m[1].trim();
      out.firmwareNeedsAdmin = /administrator|access denied|impersonation/i.test(m[1]);
      const first = m[1].trim().split(/[\s:]+/)[0].toLowerCase();
      out.firmware = ['auto', 'inhibit', 'hold'].includes(first) ? first : null;
    } else if ((m = l.match(/^service:\s*(.+)$/i))) {
      out.serviceRaw = m[1].trim();
      out.service = /active|running|started/i.test(m[1]) ? 'active'
        : /stopped|inactive|not installed|absent|missing/i.test(m[1]) ? 'inactive'
        : null;
    } else if ((m = l.match(/power:\s*([\d.]+)\s*W/i))) {
      out.power = Number(m[1]);
    }
  }

  return out;
}

ipcMain.handle('hpc:status', async () => {
  const r = await runCmd(EXE, ['status']);
  if (!r.stdout.trim()) {
    return { error: r.stderr || 'status returned nothing' };
  }
  const s = parseStatus(r.stdout);
  if (!r.ok && r.stderr) s.error = r.stderr;
  return s;
});

ipcMain.handle('hpc:set-mode', async (_e, mode) => {
  if (!['auto', 'inhibit', 'hold'].includes(mode)) {
    return { ok: false, error: 'bad mode: ' + mode };
  }
  const r = await runCmd(EXE, ['set', mode]);
  const accessDenied = /access is denied|impersonation failed|run as administrator/i.test(r.stdout + r.stderr);
  if (accessDenied) return runElevated(EXE, ['set', mode]);
  return { ok: r.ok, elevated: false, error: r.ok ? null : (r.stderr || r.stdout).trim() };
});

ipcMain.handle('hpc:bypass', async (_e, enabled) => {
  const r = await runCmd(EXE, ['bypass', enabled ? 'on' : 'off']);
  const accessDenied = /access is denied|impersonation failed|run as administrator/i.test(r.stdout + r.stderr);
  if (accessDenied) return runElevated(EXE, ['bypass', enabled ? 'on' : 'off']);
  return { ok: r.ok, elevated: false, error: r.ok ? null : (r.stderr || r.stdout).trim() };
});
ipcMain.handle('hpc:service', async (_e, enabled) => {
  const verb = enabled ? 'start' : 'stop';
  const r = await runCmd('sc.exe', [verb, SERVICE]);
  const benign = /1056|1062/.test(r.stdout + r.stderr);
  const accessDenied = /access is denied|error 5\b/i.test(r.stdout + r.stderr);
  if (accessDenied) {
    const res = await runElevated('sc.exe', [verb, SERVICE]);
    return { ok: res.ok, elevated: true, error: res.error };
  }
  return {
    ok: r.ok || benign,
    elevated: false,
    error: (r.ok || benign) ? null : (r.stderr || r.stdout).trim(),
  };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 420,
    useContentSize: true,
    minWidth: 960,
    minHeight: 180,
    backgroundColor: '#0e1116',
    title: 'HP Charge Limit',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#11171f',
      symbolColor: '#93a0af',
      height: 44,
    },
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();

    // Fit the window to the content and keep it fitted while the first data
    // load lands (notes appear, bypass state changes, etc.). Re-measuring on a
    // timer avoids the "too much empty space at the bottom" band.
    const fit = () => {
      win.webContents
        .executeJavaScript('Math.ceil(document.querySelector(".window").getBoundingClientRect().height)')
        .then((h) => {
          if (Number.isFinite(h) && h > 0) win.setContentSize(960, Math.max(h, 180));
        })
        .catch(() => {});
    };
    fit();
    setInterval(fit, 2000);

    if (SHOT) {
      setTimeout(async () => {
        try {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(SHOT, img.toPNG());
          console.log('shot written: ' + SHOT);
        } catch (e) {
          console.error('shot failed: ' + e.message);
        }
        app.quit();
      }, 900);
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

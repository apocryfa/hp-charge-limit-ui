# hp-charge-limit-ui

Desktop UI for **hp-charge-limit-rs**, the HP battery charge-limit daemon
(daemon source: https://github.com/kralonur/hp-charge-limit-rs).

## Status: wired to the daemon

`src/index.html` + `src/renderer.js` now read live data and drive the daemon
through `window.hpc` (see `electron/preload.js`). Opened in a browser there is
no bridge, so the page falls back to a static mockup (badge reads `mockup`).

## Run it

    npm start                              # Electron window
    start "" src/index.html                # same page in a browser (no app chrome)

Design check without screenshotting the desktop:

    HPCL_SHOT=C:/path/shot.png npm start   # writes a PNG of the window, then quits

## Layout

Three sections, as specified:

| Section | Contents |
|---|---|
| **Manual** | three modes — `Auto`, `Inhibit`, `Hold`; `Inhibit` shown selected; battery meter (level, state, charge rate) below the buttons |
| **Service** | daemon enabled/disabled toggle; full-charge bypass toggle (until reboot) |
| **(Battery)** | now lives inside the Manual card: 0–100 % scale + current level + charge rate |

Element ids, ready for wiring later: `#mode-auto`, `#mode-inhibit`, `#mode-hold`,
`#svc-toggle`.

Window chrome: frameless with `titleBarOverlay` (native min/max/close drawn in
the top-right, `padding-right:150px` reserved for them), titlebar is a drag
region. The `.is-electron` rules in `index.html` drop the outer margin, radius
and shadow so the page fills the window; the browser view keeps them.

## Install note (already done)

`npm install` pulls Electron, but npm 12 blocks Electron's postinstall script,
so the binary is not unpacked automatically: the 115 MB zip lands in
`%LOCALAPPDATA%\electron\Cache` and `install.js` exits 0 having extracted only
one file. Fixed by unpacking that cached zip with .NET `ZipFile` into
`node_modules/electron/dist` and writing `path.txt` (`electron.exe`).
Re-do that only if `node_modules` is wiped.

## What is verified vs. assumed

Verified from `daemon.log` + the Windows event log:
- mode vocabulary is `auto` / `inhibit` / `hold` (log lines: `-> auto`, `-> inhibit`, `-> hold`)
- daemon config in the log: `stop=50% start=40% poll=30s run=inhibit off=hold`
- the 2026-11-05 hibernate was real S4 (`Kernel-Power 42 TargetState=5`), 23:41:47 → 09:34:43

## Control interface (found — no longer a question)

Windows service `hp-charge-limit-rs`, running
`"C:\Program Files\hp-charge-limit-rs\hp-charge-limit-rs.exe" daemon --stop=50 --start=40 --interval=30 --run-mode=inhibit --off-mode=hold --off-min=40 --stop-mode=auto`

| UI section | what it calls |
|---|---|
| **Battery** | `hp-charge-limit-rs.exe status` — aligned text, parsed in `electron/main.js` |
| **Manual** | `hp-charge-limit-rs.exe set auto\|inhibit\|hold` |
| **Service** | `sc.exe start\|stop hp-charge-limit-rs` |
| **Full charge bypass** | `hp-charge-limit-rs.exe bypass on\|off` (until reboot) |

Other subcommands: `bypass on\|off`, `service install\|uninstall`, `diagnose`, `completions`.
`set` semantics, from its own help: `auto` clears WACL/SBIS/SBTC/WPBS · `inhibit` = SBIS, EC clears it at
shutdown · `hold` = SBTC, survives shutdown.

Parsing is tolerant: anything unrecognised becomes `null` and the UI shows
"unknown" rather than inventing a value.

### Elevation

The HP WMI firmware interface denies impersonation to a non-elevated process:

    firmware: unreadable: ... (run as administrator): Impersonation failed - Access denied (0x80041003)

So unelevated the current mode reads as unknown and `set` / service start-stop
fail. Launch elevated for full function:

    npm run start:admin      # one UAC prompt, then everything works

The read side (battery %, state, AC, bypass, service state) works unelevated.

## Files

    src/index.html      UI (standalone, no dependencies, no JS)
    electron/main.js    window shell (frameless, overlay controls)
    electron/preload.js adds .is-electron only — no IPC yet
    package.json        electron 33.4.11
# hp-charge-limit-ui

Desktop UI for [hp-charge-limit-rs](https://github.com/kralonur/hp-charge-limit-rs)
(HP battery charge-limit daemon), a program which brings battery saving tech to the HP Victus.   It is currently built in Electron.

## Run

Unzip the files to wherever hp-charge-limit-rs is.  hp-charge-limit-ui can make use of being run as Administrator but will prompt with UAC requests if not.


## What it does

It is a UI wrapper for hp-charge-limit-rs that shows battery level, state and charge rate.
hp-charge-limit-rs has:
- Manual modes: `auto` / `inhibit` / `hold`.
- Daemon service toggle.
- Full-charge bypass (until reboot).

## Elevated vs. non-elevated

Firmware access needs admin. Non-elevated: mode reads show "unknown"; writes
trigger a UAC prompt. Launch elevated for full function. Read-only data
(battery %, state, AC, bypass, service state) works unelevated.

## Build

```
npm install
npm start            # electron (non-elevated)
npm run start:admin  # elevated (one UAC prompt; full function)
```

## Download

https://github.com/apocryfa/hp-charge-limit-ui/releases/download/v0.2.0/hp-charge-limit-ui-full.zip

## License

PolyForm Noncommercial 1.0.0

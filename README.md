# Switch Strike Bowling

A single-switch accessible 3D bowling game, built for classroom use. One student
can play an entire game using one switch, one key, or one tap anywhere on the
screen. A teacher can run a whole class through a tournament and export the
scores.

## Playing

The game asks for one thing at a time, and the switch confirms it:

| Stage | What the switch does |
| --- | --- |
| **Spin** | Locks how much the ball will hook left or right |
| **Aim** | Locks the direction |
| **Power** | Locks how hard the ball is thrown |

**1-Touch Mode** collapses this to a single decision: aim only, with spin and
power set automatically. Good for a first session, or for a student for whom
three sequential presses is too much.

The switch is **Spacebar, Enter, Numpad Enter, or a click/tap anywhere**. Any
key can be accepted instead, for switch interfaces mapped to something unusual.

Number keys `1`–`9` change the radio station, `0` turns it off, `Esc` pauses.

## Accessibility settings

All under **Accessibility & Controls**, on the main menu, the setup screen, and
the pause menu.

- **Hold to activate** — the switch must be held 0.3–1.0s before it counts,
  filtering out brief accidental contact from tremor or a resting hand.
- **Ignore repeats** — blocks a second activation right after the first. Raise
  this if one physical press is registering twice, which happens with switch
  interfaces that send both a keypress and a mouse click.
- **Auto-Assist** — takes the shot automatically after 5, 10, or 20 seconds
  without a press, so a turn never stalls out.
- **Sweep speed** — how fast the meters move, from Slow to Fast.
- **Bumpers** — blocks the gutters so every ball reaches the pins.
- **Reduce motion** — stops the scrolling background, floating shapes, pulsing
  pin glows and scrolling text. Defaults to on if the operating system asks for
  reduced motion.
- **Switch test** — press the switch and confirm one press registers exactly
  once, before handing the game to a student.

The current prompt, player, frame, and result are announced to screen readers.

## For teachers

- **Class Mode** takes up to 32 players. Names can be typed one at a time or
  pasted in as a list.
- **Saved class lists** persist in the browser on that computer, so a roster
  doesn't need retyping every period.
- **Per-student settings** — each player can override control mode, sweep speed,
  bumpers, and Auto-Assist. Anything left on "Class default" follows the
  class-wide setting, so one game can mix students with very different needs.
- **Frame count** is adjustable from 1 to 10 to fit the time available.
- **Undo last roll** is in the pause menu and on the end-of-turn screen.
- **Export CSV** produces a ranked scorecard in standard bowling notation.

Settings are stored in the browser's local storage on that device. Nothing is
sent anywhere, and there is no account or login.

## Running it

**Prerequisites:** Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open the URL it prints, usually <http://localhost:3000>.

To build a static copy for hosting:

```bash
npm run build
```

Output lands in `dist/`. The build uses a relative base path, so it works from a
subdirectory such as GitHub Pages. Pushing to `main` deploys via the workflow in
`.github/workflows/deploy.yml`.

Type checking:

```bash
npm run lint
```

## Notes

Background music streams from [SomaFM](https://somafm.com). If a school network
blocks it, the game is unaffected — all sound effects are generated locally with
the Web Audio API.

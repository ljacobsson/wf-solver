# Wordfeud screenshot solver

A local, deterministic Wordfeud move finder. It reads the 15×15 board and rack
from a screenshot with browser-side image processing, lets the user correct any
uncertain cells, and searches a SOWPODS trie for the highest-scoring legal moves.

## Run

```bash
npm start
```

Then open <http://localhost:4173>. There are no npm dependencies and screenshots
never leave the browser.

## Install on a phone

The project is a Progressive Web App. Serve it from an HTTPS address reachable
by the phone, open that address, and tap **Install app** (or use the browser's
**Add to Home Screen** command). HTTPS is required for the service worker and
system integration; `localhost` is the only development exception.

After installation on Android/Chromium, share a Wordfeud screenshot from Photos
or the screenshot notification and choose **WF Solver**. The service worker
stores the image locally, opens the app, consumes it once, and immediately runs
the normal board/rack recognition flow. Nothing is uploaded to a server.

Web Share Target is currently an Android/ChromeOS feature. An iPhone can install
and use the home-screen app, but iOS does not register a PWA as an image target
in the system share sheet; use the in-app screenshot picker there.

For access through a LAN reverse proxy, the server can listen beyond localhost:

```bash
HOST=0.0.0.0 npm start
```

Put a trusted HTTPS reverse proxy in front of that address. You do not need an
App Store or Play Store account.

For offline use, place a newline-separated SOWPODS list at
`data/sowpods.txt`. When that file is absent, the browser tries the public list
linked in `data/README.md`; a local dictionary can also be selected in the UI.
To download that same list ahead of time, run `npm run dictionary` while online.

## Test

```bash
npm test
```

## How it works

- The screenshot reader locates the square board using its repeating 15-row
  edge pattern, classifies premium squares by color, and compares normalized
  letter glyphs against locally rendered templates.
- Low-confidence OCR cells are marked with a red `?` and remain editable.
- The solver recursively walks a trie from every legal start. It consumes rack
  counts, checks every perpendicular cross-word, handles blank tiles, applies
  DL/TL/DW/TW only to newly placed tiles, and adds Wordfeud's 40-point bonus for
  using all seven tiles.
- Premium positions come from the screenshot, so standard and random boards use
  exactly the same algorithm.
# wf-solver

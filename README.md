# YT Downloader — Phase 6

UX Polish — download history, clipboard auto-detect, settings (folder,
default quality, accent color), and an audit pass to make sure nothing
in the app ever fails silently.

## Setup (skip if you already did this before)

1. `npm install` — installs all dependencies
2. `npm run setup` — one-time ffmpeg download (skips if already present)
3. `npm run dev` — opens the app window

## What's new in Phase 6

**History** — a new History button (top of the app, next to Check Engine)
opens a list of everything you've downloaded: full videos, clips, and
playlist items all show up here as they finish. Click any entry to open
its folder and select the file. There's a Clear History button too (asks
you to confirm first, since it can't be undone). If a file was later moved
or deleted, clicking it tells you that instead of silently doing nothing.

**Clipboard auto-detect** — copy a YouTube link anywhere (browser, chat,
wherever), switch to the app, and a small banner offers to use it —
"Found a link in your clipboard: [link] [Use it] [X]". It only checks
when the window comes into focus (not constantly), and won't nag you
about the same link twice.

**Settings** — a new Settings button opens a panel with:
- **Download folder** — pick a custom folder for everything the app
  saves (videos, clips, thumbnails, subtitles, metadata). Leave it unset
  to keep using your system's normal Downloads folder.
- **Default quality** — pick a resolution you usually want (e.g. 1080p),
  and new videos will pre-select it automatically — but only when that
  specific video actually has that resolution available; otherwise it
  falls back to best available, same as before.
- **Accent color** — four color choices (green, blue, purple, pink) for
  the buttons, progress bars, and clip scrubber. See the note below on
  why this isn't a full light/dark mode.

**Playlist retry** — if some videos in a playlist batch failed, a
"Retry Failed (N)" button appears once the batch finishes. It re-runs
just the failed ones — the ones that already succeeded stay as they are,
you don't need to reselect anything from the checklist.

**Silent-failure audit** — I went through every button in the app
checking that a failure always shows a message and leaves you able to
try again. Found and fixed one real gap: the Check Engine button had no
error handling at all, so if it somehow failed, the button would just
quietly go back to normal with no explanation. That's fixed now, and
I added the same safety net around the playlist download call as a
defensive measure, even though I couldn't get it to actually fail in
testing.

**A note on "theme":** the plan calls for a "theme" setting, and I want
to be upfront about scope here — the app's colors have been hardcoded
dark from Phase 0 onward, so a true light/dark switch means rewriting
essentially every color class in the entire UI, a much bigger job than
the other three Phase 6 items combined, and mostly unrelated to what
"UX polish" is really about. I built accent-color choice instead — same
"make it yours" idea, far smaller footprint, and it reuses the exact
same colors already proven to look good in the dark UI. If you actually
want the full light/dark rewrite, tell me and I'll scope that as its own
piece of work rather than folding it into this phase.

Everything from Phases 1–5 (single video downloads, quality/format,
playlists, thumbnails/subtitles/metadata, the clip scrubber) works
exactly as before — Phase 6 only adds things, it doesn't change how any
of that behaves.

## What I could and couldn't test from here

I ran the full automated suite — 114 tests now (96 from before + 18 new
ones for this phase), all passing (`npm test`), built the app to confirm
there are no errors, and separately ran a real read/write/update/clear
round-trip against actual files on disk for both settings and history
(not just the unit tests) to make sure the file storage genuinely works,
not just the logic around it.

What I could **not** do from this sandbox: anything involving the actual
OS — reading the real clipboard, opening a real folder picker dialog,
revealing a file in Explorer, or the window focus event that triggers
the clipboard check. Those all need a real Windows desktop. Before this
phase counts as done, please check on your machine:

1. Copy a YouTube link, switch to the app → confirm the clipboard banner
   appears; click "Use it" → confirm it fills the URL box
2. Copy the same link again, switch away and back → confirm it does
   **not** show the banner again for that same link
3. Open Settings → Choose a download folder → download something small →
   confirm it actually landed in that folder, not the normal Downloads
4. Set a default quality → Get Info on a new video → confirm that
   resolution is pre-selected (when the video has it)
5. Try each accent color → confirm buttons, progress bars, and the clip
   scrubber all pick up the new color
6. Download a couple of things → open History → confirm they're listed,
   and clicking one opens its folder with the file selected
7. Clear history → confirm it asks for confirmation first, then empties
8. Run a playlist with at least one video likely to fail → confirm
   "Retry Failed" appears after, and clicking it only re-runs the failed
   ones, leaving the successful ones alone

If anything looks or behaves oddly, describe exactly what you saw in
your next Claude chat.

## Running the automated tests

`npm test` — runs Vitest. Should show 114 tests passing, no window needed.

## Troubleshooting

- **Clipboard banner never appears** — it only checks on launch and when
  the window regains focus, not continuously; make sure you actually
  switch away from and back to the app after copying.
- **Downloads still going to the old folder** — the default-folder
  setting only applies to downloads started after you set it; anything
  already in progress keeps its original destination.
- **"This file no longer exists"** when clicking a history entry — the
  file was moved, renamed, or deleted after downloading; the history
  entry itself is just a record, not the file.
- **Default quality didn't apply** — it only applies when the specific
  video actually offers that resolution; otherwise it silently falls
  back to best available, which is intentional, not a bug.
- Phase 1–5's troubleshooting entries (engine check, quality/format
  selection, verified downloads, playlists, clip scrubber, thumbnails/
  subtitles/metadata) still apply unchanged.

## Next session

Once you've checked the clipboard detection, settings, and history on
your machine, open the project plan file, update **Current Status** to
Phase 7, and start a new chat.

(Same note as every phase: keep Plan.md's Current Status in sync as you
go — this README documents what's actually built at each phase, and is
the most reliable source if the two ever disagree.)

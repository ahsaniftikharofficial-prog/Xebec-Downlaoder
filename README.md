# YT Downloader — Phase 4

Playlist support — paste a playlist link and get a checklist of every
video in it instead of a single video card. Pick which ones you want,
hit one button, and they download one at a time with their own progress
bar each. If one video in the batch is broken (private, deleted,
region-locked, whatever), it's marked failed and the rest of the
playlist keeps going.

## Setup (skip if you already did this for Phase 1/2/3)

1. `npm install` — installs all dependencies
2. `npm run setup` — one-time ffmpeg download (skips if already present)
3. `npm run dev` — opens the app window

## What's new in Phase 4

Paste a playlist URL (a `youtube.com/playlist?list=...` link, or a
`watch?v=...&list=...` link) and click **Get Info** like always. Instead
of the single-video card, you'll see:

- **A checklist** — every video in the playlist, with its length, and a
  **Select all** checkbox at the top. Everything is checked by default;
  uncheck the ones you don't want.
- **Download Selected** — starts downloading the checked videos, one at a
  time, at best available quality (MP4). There's no per-video quality/
  format picker for playlists yet — that's a possible follow-up, not part
  of this phase.
- **A progress section** — one overall bar (X of Y processed), and a row
  per video showing "Waiting…", a live percentage while it's downloading,
  a green check when done, or a red X with the actual error message if
  that one failed. A failed video never stops the others — it's marked
  and the queue moves straight to the next one.

Regular single-video links work exactly as before — nothing about
Phases 1–3 changed. The one small behavior change: if the URL you've
pasted is a playlist link, the old single-video **Download Best Quality**
button and the section-download prototype are hidden, since running
those against a whole playlist wouldn't produce one sensible file to
verify. They come back the moment you clear the URL or paste a normal
video link.

Under the hood, each playlist video is downloaded through the exact same
verified-download + resume logic Phase 1 built for single videos — a
playlist item is just a video, downloaded the same way, one after
another (not all at once — gentler on YouTube and simpler to reason
about).

## What I could and couldn't test from here

I ran the full automated suite — 85 tests now (73 from before + 12 new
ones for this phase), all passing (`npm test`). The new tests cover the
logic that matters most for this phase: recognizing a playlist URL,
turning yt-dlp's playlist listing into a clean checklist (including
dropping entries with no usable id, like a deleted video), and — the
important one — the queue running every item even when one of them
fails, confirmed with a fake failing download so it doesn't depend on a
real playlist.

What I could **not** do from this sandbox: fetch a real playlist listing
from YouTube (this environment's network only reaches package
registries, not youtube.com) or actually download any videos. Before
this phase counts as done, please test on your machine:

1. Paste a playlist link → Get Info → confirm the checklist shows every
   video with a sensible title and length, and Select all/individual
   checkboxes work
2. Uncheck a couple of videos → Download Selected → confirm only the
   checked ones download, one at a time, with a live percentage per row
3. Confirm the overall progress bar and the "X succeeded, Y failed" line
   update correctly as the batch runs
4. If you know a playlist with a private or deleted video in it, include
   it in your selection — confirm it shows a red X with a message
   instead of stopping the rest of the batch
5. Paste a plain single-video link (no playlist) right after — confirm
   the normal Phase 1–3 flow still looks and works exactly the same

If anything errors, paste the exact message into your next Claude chat.

## Running the automated tests

`npm test` — runs Vitest. Should show 85 tests passing, no window needed.

## Troubleshooting

- **Checklist is empty or missing videos** — some playlists mix in
  private/deleted videos; those are dropped automatically since they'd
  never download successfully anyway. If a video you know is public is
  missing, paste the playlist URL into your next Claude chat.
- **A video in the queue always fails** — private, deleted,
  region-locked, and age-restricted videos will fail here the same way
  they'd fail a direct download; that's expected, not a bug in the queue
  itself.
- **Download Best Quality button disappeared** — that's expected once
  the URL box contains a playlist link (see "What's new" above); it's
  not gone, just hidden for playlist URLs.
- Phase 1/2/3's troubleshooting entries (engine check, section download,
  quality/format selection, verified downloads, thumbnails/subtitles/
  metadata) still apply unchanged.

## Next session

Once you've confirmed the checklist, queue, and failure isolation all
work correctly on your machine, open the project plan file, update
**Current Status** to Phase 5, and start a new chat.

(Same note as last phase: keep Plan.md's Current Status in sync as you
go — this README documents what's actually built at each phase, and is
the most reliable source if the two ever disagree.)

# YT Downloader — Phase 1

Core download + a rough prototype of section (clip) downloading — the
project's core feature, proven early on purpose.

## First-time setup (Windows)

Run these one at a time, in order, from inside this folder:

1. `npm install` — installs all dependencies
2. `npm run setup` — one-time download of ffmpeg (~150MB). Not bundled directly
   because it's too large to hand over as a chat file. yt-dlp.exe is already
   included in `resources/bin`, since it's small.
3. `npm run dev` — opens the app window

## What's new in Phase 1

- **Get Info** — paste a URL, click it, see the real title and length
- **Download Best Quality** — downloads the full video, best available
  quality, video+audio auto-merged into one mp4, with a live progress bar
- **Download Section (prototype)** — plain "start seconds" / "end seconds"
  boxes that download just that time range. Ugly on purpose — this proves
  the underlying mechanic works before Phase 5 builds the real
  drag-to-select scrubber on top of it
- Every download is **verified** after it finishes (ffprobe checks the file's
  actual duration against what was expected) before it's shown as done
- Downloads land in your normal **Downloads** folder

## What I could and couldn't test from here

I confirmed the exact yt-dlp flags and output formats against the real
yt-dlp source code, and unit-tested all the parsing/logic that doesn't
require a network connection — 27 automated tests, all passing (`npm test`).

What I could **not** do from this build environment: actually run a download
against a real YouTube URL — this sandbox has no route to youtube.com. So
the live path (paste a real URL → Get Info → Download) needs to be
confirmed by you, on your machine, before this phase counts as done. If
something errors, paste the exact message into your next Claude chat.

Also worth deliberately testing: start a download, close the app partway
through, reopen it, and start the *same* download again — it should pick up
roughly where it left off rather than restarting from zero (this relies on
yt-dlp's own default resume behavior).

## Running the automated tests

`npm test` — runs Vitest. Should show all tests passing, no window needed.

## Troubleshooting

- **"Could not run .../yt-dlp.exe"** — make sure `resources/bin/yt-dlp.exe`
  exists (it should, straight out of this zip).
- **ffmpeg shows an error on Check Engine** — run `npm run setup` again; it
  skips the download if `ffmpeg.exe` is already present, so delete
  `resources/bin/ffmpeg.exe` first if you want to force a re-download.
- **"Download finished but could not be verified"** — the file downloaded
  but ffprobe couldn't read its duration; often means ffmpeg/ffprobe aren't
  both present in `resources/bin` (`npm run setup` installs both together).
- **Section download errors immediately** — double check Start/End are
  plain numbers in seconds (e.g. 30 and 90), not timestamps.
- **Nothing opens at all** — check the terminal for a red error message and
  paste it into your next Claude chat along with this file.

## Next session

Once you've confirmed a real download and a real section download both work
and verify successfully, open `youtube-downloader-project-plan.md`, update
**Current Status** to Phase 2, and start a new chat.

# YT Downloader — Phase 2

Quality, format, and audio-only download options — pulled from each
video's own real list of available resolutions, not a generic guess.

## Setup (skip if you already did this for Phase 1)

1. `npm install` — installs all dependencies
2. `npm run setup` — one-time ffmpeg download (skips if already present)
3. `npm run dev` — opens the app window

## What's new in Phase 2

- After **Get Info**, a new box appears with:
  - An **Audio only** checkbox
  - When unchecked: a **resolution dropdown** — only lists resolutions
    this specific video actually has (a video that tops out at 720p will
    never show a fake 1080p option), plus a **format dropdown**
    (MP4 / MKV / WEBM) for the container the file downloads as
  - When checked: an **audio format dropdown** (MP3 / M4A / WAV) instead —
    the video downloads audio-only, converted via ffmpeg
- The **Download** button label now reflects your choice, e.g.
  "Download 720p" or "Download Audio (MP3)"
- Section (clip) downloads use the same quality/format/audio-only choices
  as a full download

## What I could and couldn't test from here

I confirmed the exact yt-dlp flags against yt-dlp's documented behavior
(`--merge-output-format`, `--remux-video`, `-x` / `--audio-format`), and
unit-tested all the parsing/logic that doesn't require a network
connection — 35 automated tests, all passing (`npm test`).

What I could **not** do from this build environment: run a real download
with a chosen resolution/format/audio-only setting against a real YouTube
URL. Before this phase counts as done, please test on your machine:

1. Paste a URL → Get Info → check the resolution dropdown lists options
   that make sense for that video (compare against YouTube's own quality
   menu for the same video)
2. Pick a lower resolution (e.g. 480p) and download — confirm the file
   that lands is actually that resolution, not full quality
3. Pick MKV or WEBM as the format and download — confirm the file plays
   and has that extension
4. Turn on **Audio only**, pick MP3, and download — confirm you get an
   audio file with no video track
5. Try Audio only with M4A and WAV too, just once each, to confirm the
   ffmpeg conversion works for all three

If anything errors, paste the exact message into your next Claude chat.

## Running the automated tests

`npm test` — runs Vitest. Should show 35 tests passing, no window needed.

## Troubleshooting

- **Resolution dropdown looks short** — some videos only expose a couple
  of qualities; that's expected, not a bug — compare against YouTube's
  own quality settings for that same video.
- **Downloaded file isn't the resolution I picked** — paste the exact
  resolution you picked and the video URL into your next Claude chat so
  it can be checked against that video's real formats.
- **Audio-only download fails or errors** — make sure
  `resources/bin/ffmpeg.exe` and `ffprobe.exe` are both present (same fix
  as Phase 1: delete them and run `npm run setup` again).
- Phase 1's troubleshooting entries (engine check, section download,
  verification) still apply unchanged.

## Next session

Once you've confirmed resolution, format, and audio-only downloads all
work and verify successfully, open the project plan file, update
**Current Status** to Phase 3, and start a new chat.

# YT Downloader — Phase 3

Thumbnails, subtitles, and metadata — three independent one-click saves
that sit alongside the video download, each verified on its own so a
failure in one can never take another down with it.

## Setup (skip if you already did this for Phase 1/2)

1. `npm install` — installs all dependencies
2. `npm run setup` — one-time ffmpeg download (skips if already present)
3. `npm run dev` — opens the app window

## What's new in Phase 3

After **Get Info**, three new boxes appear below the video download
controls:

- **Thumbnail** — a preview image, a dropdown listing every resolution
  this specific video's thumbnail actually comes in (largest marked
  "Best"), and a JPG/PNG format choice. **Save Thumbnail** fetches the
  chosen image and always runs it through ffmpeg to guarantee the file
  that lands on disk really is the format you picked — the same
  belt-and-suspenders approach Phase 2 uses for video containers.
- **Subtitles** — every subtitle track this video has, manual and
  auto-generated, with auto-generated ones labeled as such (if a language
  has both, only the higher-quality manual one is shown). Check as many
  as you want, pick SRT or VTT, and **Save Subtitles** saves all of them
  in one pass. Because yt-dlp doesn't treat a missing language as an
  error, the result is checked language-by-language against what actually
  landed in the downloads folder, and any that weren't available are
  called out — not silently dropped.
- **Metadata** — channel, upload date, and description are shown right in
  the box; **Save Metadata** writes them (plus title, duration, and the
  video URL) to a JSON or TXT file.

All three save to the same downloads folder as the video, named
`<title> [<id>] - thumbnail.<ext>` / `- metadata.<ext>`, and none of them
touch the main **Download** button's flow — you can save a thumbnail
without ever downloading the video itself.

## What I could and couldn't test from here

I ran the full automated suite — 73 tests, all passing (`npm test`) — and
additionally, since this sandbox happens to have ffmpeg installed, I
generated a synthetic test image and ran it through the actual conversion
+ verification code path (not a mock): ffmpeg converted a
1280×720 WEBP to JPG, and the verification step correctly read back
`{ width: 1280, height: 720 }` via ffprobe. So the thumbnail pipeline's
conversion and verification logic is confirmed working, not just unit
tested in isolation.

What I could **not** do from this build environment: fetch a real
thumbnail from YouTube's CDN (this sandbox's network is locked to package
registries only) or run yt-dlp against a real video for subtitles. Before
this phase counts as done, please test on your machine:

1. Paste a URL → Get Info → confirm the Thumbnail box shows a preview and
   the resolution dropdown lists sizes that make sense for that video
2. Save Thumbnail as JPG, then again as PNG — confirm both files open and
   are genuinely that format (not just renamed)
3. Pick a couple of subtitle languages (include an auto-generated one if
   the video has one) → Save Subtitles → confirm the right number of
   `.srt` or `.vtt` files land in your downloads folder and open correctly
4. Try a video you know has **no** subtitles at all — confirm the box
   says so instead of showing an empty, clickable list
5. Save Metadata as JSON, then TXT — confirm both open and the channel /
   date / duration / description look right compared to the video's real
   YouTube page

If anything errors, paste the exact message into your next Claude chat.

## Running the automated tests

`npm test` — runs Vitest. Should show 73 tests passing, no window needed.

## Troubleshooting

- **Thumbnail dropdown only shows one size** — some videos only expose
  one thumbnail; that's expected, not a bug.
- **Save Thumbnail fails** — make sure `resources/bin/ffmpeg.exe` and
  `ffprobe.exe` are both present (same fix as Phase 1/2: delete them and
  run `npm run setup` again). If it still fails, paste the exact error
  and the video URL into your next Claude chat.
- **A subtitle language I expected is missing after saving** — YouTube
  doesn't have every language for every video; check the video's own
  "cc" menu on youtube.com to confirm it's really there before assuming
  it's a bug. If it *is* there but didn't save, paste the language code
  and video URL into your next Claude chat.
- **Metadata description looks truncated or missing** — some videos have
  no description at all; the saved file will say so rather than being
  blank/broken.
- Phase 1/2's troubleshooting entries (engine check, section download,
  quality/format selection, verification) still apply unchanged.

## Next session

Once you've confirmed thumbnail, subtitles, and metadata all save and
verify correctly on your machine, open the project plan file, update
**Current Status** to Phase 4, and start a new chat.

(Note: the Plan.md you're tracking status in was still showing "Phase 0 —
Not started" when this phase was written — this README and the code are
the source of truth for what's actually built. Worth updating Plan.md's
Current Status to match reality once you confirm this phase.)

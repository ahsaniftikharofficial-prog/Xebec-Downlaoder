# YT Downloader — Phase 5

Clip Selector Polish — the Phase 1 "type start/end in seconds" prototype
is now a real draggable scrubber, with typed timestamps as a fallback and
the clip length shown before you commit to downloading.

## Setup (skip if you already did this before)

1. `npm install` — installs all dependencies
2. `npm run setup` — one-time ffmpeg download (skips if already present)
3. `npm run dev` — opens the app window

## What's new in Phase 5

Click **Get Info** on a single video (not a playlist), and below the
quality/format selector you'll now see a real clip tool instead of the old
"Start (sec)" / "End (sec)" boxes:

- **A draggable bar** under the video — two round handles, one for the
  clip's start and one for its end. Drag either one with your mouse.
- **Typed times as a fallback** — two boxes below the bar showing the
  current start/end as `M:SS` (like `1:23`). Type a new time and click
  away (or tab out) to jump the handle there. You can type plain seconds
  too (`83`), not just `1:23` — both work.
- **Clip length, shown live** — updates as you drag or type, so you know
  exactly how long the clip will be before you download it.
- The **Download Clip** button uses the exact same download-and-verify
  code Phase 1 built — dragging a shinier UI on top didn't change what
  actually happens when you click download.

One behavior change worth knowing: the clip tool now only appears **after**
you click Get Info, because it needs the video's length to draw the bar
(Phase 1's version let you type seconds blind, before fetching info). For
the rare live/unknown-length video, the clip tool is hidden with a short
note instead of showing a broken bar.

Nothing else changed — full-video downloads, quality/format, playlists,
thumbnails, subtitles, and metadata all work exactly as they did in
Phases 1–4.

## What I could and couldn't test from here

I ran the full automated suite — 96 tests now (85 from before + 11 new
ones for this phase), all passing (`npm test`), and built the app to
confirm there are no errors in the new files. The new tests cover the
part of this feature that's actual logic rather than visuals: parsing a
typed timestamp (`"1:23"`, `"1:02:03"`, or plain seconds, rejecting
garbage input), formatting seconds back to `M:SS`, and the clamping rules
that stop a handle from crossing the other one or going past the video's
length.

What I could **not** do from this sandbox: this sandbox has no display,
so I can't actually click and drag anything — the dragging itself needs
your eyes and a mouse. Before this phase counts as done, please check on
your machine:

1. Get Info on a video → confirm a draggable bar appears under the
   quality selector, matching the video's length
2. Drag the left handle right, then the right handle left → confirm the
   clip length updates live and the bar's highlighted section matches
3. Try dragging the start handle past the end handle (and vice versa) →
   confirm it stops just short instead of crossing over or breaking
4. Type a time like `1:23` into the Start box and click away → confirm
   the handle jumps there and the bar updates
5. Type something invalid (like `abc`) into a time box and click away →
   confirm it just reverts to the last valid time instead of erroring
6. Click **Download Clip** → confirm it downloads just that range, same
   as Phase 1's section download did

If anything looks or behaves oddly, describe exactly what you saw in
your next Claude chat.

## Running the automated tests

`npm test` — runs Vitest. Should show 96 tests passing, no window needed.

## Troubleshooting

- **No clip bar appears** — you have to click **Get Info** first now (see
  "What's new" above); it can't draw a bar without knowing the video's
  length.
- **"Clip selection isn't available for this video"** — that video has no
  fixed length (likely a live stream), so there's nothing to drag a range
  across; expected, not a bug.
- **Typed time didn't take effect** — you need to click away from the box
  (or press Tab) for a typed time to apply; it doesn't update on every
  keystroke on purpose, so it doesn't fight you while you're still typing.
- Phase 1–4's troubleshooting entries (engine check, quality/format
  selection, verified downloads, playlists, thumbnails/subtitles/
  metadata) still apply unchanged.

## Next session

Once you've dragged the handles around on your machine and confirmed the
clip download still works, open the project plan file, update
**Current Status** to Phase 6, and start a new chat.

(Same note as every phase: keep Plan.md's Current Status in sync as you
go — this README documents what's actually built at each phase, and is
the most reliable source if the two ever disagree.)

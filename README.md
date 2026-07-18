# YT Downloader — Phase 7

Self-Healing Engine — on every launch, the app checks yt-dlp and ffmpeg
against their latest releases and updates them in place if there's
something newer, without ever blocking the app from opening. Old
versions are kept on disk so a bad update can be rolled back.

## Setup (skip if you already did this before)

1. `npm install` — installs all dependencies
2. `npm run setup` — one-time ffmpeg download (skips if already present)
3. `npm run dev` — opens the app window

## An architecture change this phase needed

Self-healing has to be able to **write** updated binaries somewhere, but a
packaged Windows app's own install folder is often under `Program Files`,
which isn't reliably writable without admin rights. So from this phase on,
the binaries the app actually runs live in a writable copy under Electron's
per-user data folder (`%APPDATA%/yt-downloader/engine/bin`), not inside the
app's own resources folder.

The first time each binary is needed on a machine, it's seeded (copied)
from the original bundled one — after that, self-healing owns the writable
copy entirely, and the bundled original is never touched again. This
touched every place in the app that runs yt-dlp or ffmpeg (video info,
downloads, thumbnails, subtitles, playlists, Check Engine) — all of Phases
1–6's *behavior* is unchanged, only *which file path* they run from.

## What's new in Phase 7

**On-launch check** — a few seconds after the app opens, it quietly checks
yt-dlp's and ffmpeg's latest GitHub releases in the background. If nothing
needs updating (the common case), you'll never see anything — no popup,
no delay. If no internet is available or GitHub is unreachable, the check
just fails quietly and the app carries on with whatever's already
installed; it never blocks startup.

**yt-dlp updates** — compared by real version number (yt-dlp tags releases
like `2025.06.09`). A newer build is downloaded, verified — it has to
actually run and report the expected version before anything happens — and
only then swapped in. A bad or truncated download can never overwrite a
working install.

**ffmpeg updates** — ffmpeg's Windows builds don't carry a clean version
number the same way (the build that's "latest" keeps changing under the
same rolling release), so instead the app tracks a marker for the build
it has installed and re-downloads only when that marker changes. The very
first check on a machine just records the marker as a baseline rather than
re-downloading the ~150MB build immediately — it only downloads once an
actual new build shows up after that.

**Rollback** — every update backs up the version it's replacing before
swapping anything in. If an update caused a problem, a small "Undo" on the
update notice restores the previous version — verified the same way an
update is, so a broken backup can't be swapped back in either. Up to 3
previous versions of each binary are kept on disk; older ones are pruned
automatically so this doesn't grow forever.

**Small, unobtrusive indicator** — if an update actually happened, a small
dismissible line appears near the top of the app: *"⬆️ yt-dlp updated
(2025.06.09 → 2025.07.01) [Undo] [✕]"*. Dismissing it just hides it —
nothing to configure, nothing in your way if you don't care.

## A gap worth flagging: the bot-check helper

The plan calls for self-healing to also cover the bot-check helper
(`bgutil-ytdlp-pot-provider` + `yt-dlp-ejs`) mentioned back in the original
tech stack. Going through the codebase for this phase, I found that helper
was never actually bundled or wired in during Phases 0–6 — only yt-dlp and
ffmpeg were. So there's nothing there yet for self-healing to check.

I built the self-healing system generically enough that adding a third
binary later (once the bot-check helper is actually integrated) is just a
new pair of `checkAndUpdateX` / `rollbackX` functions following the exact
same pattern already used for yt-dlp and ffmpeg — not a redesign. But
integrating that helper for the first time is a real, separate piece of
work (it needs a local Node/Deno process, not just a downloadable exe), and
I didn't want to fold "build it" into a phase whose job is "keep it
updated." If YouTube's bot-checks start actually blocking downloads for
you, that's worth scoping as its own small phase before Phase 8.

## What I could and couldn't test from here

I ran the full automated suite — **139 tests now (114 from before + 25
new)**, all passing (`npm test`), and built the app to confirm there are
no errors. Beyond the unit tests, I also ran real end-to-end dry runs
against actual files on disk (not just mocked logic):

- First-run bootstrap (copying a bundled binary into the writable folder)
  and confirmed it's idempotent on a second call
- A full simulated update cycle: version check → download → verify →
  backup → swap-in → confirmed the live binary actually changed
- Rollback afterward → confirmed the previous version came back, and
  neither file was ever deleted (both versions stayed on disk)
- Five updates in a row → confirmed only the 3 most recent backups survive
  pruning
- The "already up to date" path → confirmed it does **not** attempt a
  download at all
- ffmpeg's check on a non-Windows machine → confirmed it's a clean,
  silent no-op (same as `setup-ffmpeg.js` already does)

What I could **not** do from this sandbox: run the actual Windows
`yt-dlp.exe`/`ffmpeg.exe` binaries, a real `PowerShell Expand-Archive`
extraction, or a real download of a full ffmpeg build (I mocked the
network calls to test the logic around them instead — the real GitHub
API's response shape for releases is well-documented and stable, but I
couldn't get a live sample from here due to that API's rate limit on
shared connections). Before this phase counts as done, please check on
your machine:

1. Run the app once normally — confirm it opens immediately and you don't
   notice any delay or freeze while the engine check runs in the background
2. Turn off your internet, launch the app — confirm it still opens fine
   and everything still works with whatever's already installed
3. Open Check Engine — confirm the versions shown match what's actually
   installed (this now reads from `%APPDATA%/yt-downloader/engine/bin`,
   not the folder the app was installed into)
4. If a real update happens to be available when you test this (check by
   comparing your yt-dlp version against the latest on GitHub), confirm:
   - the small update banner appears with the correct old → new versions
   - "Undo" restores the previous version (Check Engine shows the old
     version again afterward)
   - dismissing (✕) makes the banner go away and it doesn't come back on
     the next launch
5. Look in `%APPDATA%/yt-downloader/engine/` — confirm `bin/` has the
   live binaries and `versions/` has any backups

If anything looks or behaves oddly, describe exactly what you saw in your
next Claude chat.

## Running the automated tests

`npm test` — runs Vitest. Should show 139 tests passing, no window needed.

## Troubleshooting

- **"yt-dlp.exe was not found"** on first launch — the bundled binary
  couldn't be found to seed the writable copy from; reinstall the app, or
  in dev, confirm `resources/bin/yt-dlp.exe` exists.
- **Update banner won't go away** — click the ✕, not just navigate away;
  dismissing is a deliberate action recorded so it won't reappear.
- **"There is no recent update to roll back"** — Undo only works right
  after an update that hasn't already been rolled back; there's nothing to
  undo if nothing's changed, or if you already rolled it back once.
- **Engine check shows an old version right after an update** — the
  writable copy under `%APPDATA%` is what's authoritative from this phase
  on; if Check Engine still looks stale, try it again after a fresh
  launch.
- Phase 1–6's troubleshooting entries (quality/format selection, verified
  downloads, playlists, clip scrubber, thumbnails/subtitles/metadata,
  clipboard detection, settings, history) still apply unchanged.

## Next session

Once you've checked the self-healing behavior on your machine, open the
project plan file, update **Current Status** to Phase 8, and start a new
chat.

(Same note as every phase: keep Plan.md's Current Status in sync as you
go — this README documents what's actually built at each phase, and is
the most reliable source if the two ever disagree.)

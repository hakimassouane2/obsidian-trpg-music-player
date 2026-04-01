---
title: 'Sequential Play Mode for Musique Channel'
slug: 'sequential-play-mode'
created: '2026-04-01'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Obsidian Plugin API', 'YouTube IFrame API']
files_to_modify: ['src/PlayerService.ts', 'src/MusicPlayerView.ts', 'src/LibraryView.ts', 'src/types.ts']
code_patterns: ['two-channel architecture', 'filter composition via TrackLibrary.getTracks()', 'YT.Player onStateChange for track end detection']
test_patterns: []
---

# Tech-Spec: Sequential Play Mode for Musique Channel

**Created:** 2026-04-01

## Overview

### Problem Statement

During TRPG sessions, the GM wants to play through multiple music tracks of a similar type (e.g., all "comique" tracks at "faible" intensity) without manually switching tracks each time one ends. Currently, tracks auto-loop individually on the musique channel, requiring manual intervention to change music.

### Solution

Add a "Sequential Mode" toggle to the musique channel that, when active, auto-advances to the next track in a shuffled queue built from the current filtered track list. Uses Fisher-Yates shuffle with anti-repeat logic (the last track of a completed queue cannot be the first track of the next shuffle). When the queue is exhausted, it re-shuffles and loops. The ambiance channel remains completely unaffected and continues to loop as usual.

The queue is built from the **current filter results** (humeur/lieu/intensité). Changing filters while sequential mode is active rebuilds the queue with the new filter results.

### Scope

**In Scope:**
- Sequential mode toggle (musique channel only)
- Shuffled queue built from current filter state (all three filter dimensions: humeur, lieu, intensité)
- Smart shuffle: Fisher-Yates with anti-repeat across loop boundaries (last played track won't be first in next shuffle)
- Auto-advance on track end (replaces auto-loop behavior for musique when sequential mode is active)
- Loop the full queue when exhausted (re-shuffle and continue)
- Changing filters rebuilds the queue
- Ambiance channel continues independently, unaffected

**Out of Scope:**
- Sequential mode for ambiance channel
- Manual track ordering / drag-and-drop playlists
- Crossfade between tracks
- Previous/skip controls
- Persist queue state across plugin reload

## Context for Development

### Codebase Patterns

- **Two-channel architecture:** Every audio operation is channel-specific (ambiance/musique). PlayerService maintains a `ChannelState` per channel.
- **Filter composition:** `TrackLibrary.getTracks(filters?)` chains filters for humeur, lieu, intensité. Returns filtered Track[].
- **Track end detection:** `PlayerService.createPlayer()` registers `onStateChange` callback — currently auto-loops on `YT.PlayerState.ENDED` (line ~150 in PlayerService.ts).
- **View refresh:** `Plugin.updateNowPlaying()` propagates playback state to all views.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/PlayerService.ts` | Audio engine — play/stop/pause, YT.Player lifecycle, onStateChange handler |
| `src/MusicPlayerView.ts` | Side panel UI — filter dropdowns, track list, now playing |
| `src/LibraryView.ts` | Full library UI — chip filters, track grid, playback controls |
| `src/TrackLibrary.ts` | Track data management — getTracks(filters) |
| `src/types.ts` | Type definitions — Track, Channel, TrackCategories, TrackFilters |
| `src/constants.ts` | UI strings and category constants |

### Technical Decisions

- Sequential mode is musique-only by design (ambiance stays looping for atmospheric consistency)
- Queue is filter-driven, not category-driven (leverages existing filter system)
- Smart shuffle prevents repetition feel without true randomness issues

## Implementation Plan

### Tasks

- [x] Task 1: Add `SequentialQueue` class in new file `src/SequentialQueue.ts`
  - File: `src/SequentialQueue.ts` (new)
  - Action: Create a class that manages a shuffled queue of `Track[]`:
    - `build(tracks: Track[])` — takes filtered tracks, Fisher-Yates shuffles them, stores as queue. If previous queue existed, ensures last played track is not first in new queue.
    - `next(): Track | null` — returns next track in queue. When exhausted, re-shuffles (with anti-repeat on boundary) and returns first track of new shuffle.
    - `current(): Track | null` — returns the currently playing track.
    - `clear()` — empties the queue and resets state.
    - `isActive(): boolean` — returns whether sequential mode is on.
    - `setActive(active: boolean)` — toggles sequential mode.
    - Private `lastPlayedTrack: Track | null` — used for anti-repeat across loop boundaries.
  - Notes: Keep this a pure data structure with no DOM or YT dependencies. The shuffle logic: Fisher-Yates on the array, then if `lastPlayedTrack` matches `queue[0]`, swap `queue[0]` with a random other position.

- [x] Task 2: Integrate `SequentialQueue` into `PlayerService`
  - File: `src/PlayerService.ts`
  - Action:
    - Import and instantiate `SequentialQueue` as a property.
    - Expose `sequentialQueue` getter so views can access it.
    - Modify `onStateChange` handler in `createPlayer()` (line ~146): when `channel === 'musique'` AND `sequentialQueue.isActive()`, call `sequentialQueue.next()` and play that track instead of re-looping. Call a new callback `onTrackAdvance` to notify the plugin of the new track name.
    - Keep ambiance channel behavior unchanged (always auto-loop).
    - Add `onTrackAdvance` callback property `(trackName: string) => void` so the plugin can update now-playing UI.
  - Notes: The `onStateChange` handler currently does `state.player.loadVideoById(state.currentVideoId)` for looping. The change is: if musique + sequential active → load next track from queue instead.

- [x] Task 3: Add sequential mode toggle to `MusicPlayerView` (side panel)
  - File: `src/MusicPlayerView.ts`
  - Action:
    - In `buildPlayerSection()`, add a toggle button (shuffle icon) next to the musique channel controls (after stop button, around line ~103).
    - Toggle button activates/deactivates `playerService.sequentialQueue.setActive()`.
    - When activated: build queue from current filtered musique tracks using `trackLibrary.getTracks()` with current filters + `channel: 'musique'`.
    - When deactivated: clear the queue.
    - Visual state: button highlighted when active (add `trpg-btn-active` class).
    - When filters change (`refreshTrackList()`): if sequential mode is active, rebuild the queue with new filtered results.
  - Notes: Use the existing `shuffle` icon from Lucide (available in Obsidian).

- [x] Task 4: Add sequential mode toggle to `LibraryView` (full library)
  - File: `src/LibraryView.ts`
  - Action:
    - In `buildMiniPlayer()`, add a toggle button (shuffle icon) in the musique channel section of the mini player bar.
    - Same behavior as Task 3: toggle activates/deactivates sequential queue, builds from current library filters + `channel: 'musique'`.
    - When filters change (`refreshGrid()`): if sequential mode is active, rebuild the queue.
    - Sync state: if sequential mode was toggled from MusicPlayerView, LibraryView should reflect the correct button state when refreshed.
  - Notes: Both views share the same `playerService` instance via `plugin.playerService`, so the queue state is shared.

- [x] Task 5: Add UI constants
  - File: `src/constants.ts`
  - Action: Add to `UI` object:
    - `SEQUENTIAL_MODE: 'Mode séquentiel'`
    - `SEQUENTIAL_ON: 'Mode séquentiel activé'`
    - `SEQUENTIAL_OFF: 'Mode séquentiel désactivé'`
  - Notes: Keep consistent with existing French UI strings.

- [x] Task 6: Wire up `onTrackAdvance` in plugin main
  - File: `src/main.ts`
  - Action:
    - After initializing `PlayerService`, set the `onTrackAdvance` callback to call `this.updateNowPlaying('musique', trackName)`.
    - This ensures both side panel and library views update their "now playing" display when a track auto-advances.
  - Notes: `updateNowPlaying()` already propagates to all views — no additional wiring needed.

### Acceptance Criteria

- [x] AC 1: Given sequential mode is OFF, when a musique track ends, then it loops (current behavior unchanged).
- [x] AC 2: Given sequential mode is ON with 3+ filtered musique tracks, when the current track ends, then the next shuffled track starts automatically.
- [x] AC 3: Given sequential mode is ON and the last track in the queue finishes, then the queue re-shuffles and the first track of the new shuffle plays (continuous loop).
- [x] AC 4: Given sequential mode is ON and the queue has 2+ tracks, when the queue loops, then the first track of the new shuffle is NOT the same as the last track of the previous shuffle.
- [x] AC 5: Given sequential mode is ON, when the user changes a filter (humeur/lieu/intensité), then the queue rebuilds with the new filtered track list.
- [x] AC 6: Given sequential mode is ON, when the user manually clicks a different track, then that track plays and sequential mode continues from that point (queue is not disrupted).
- [x] AC 7: Given sequential mode is ON for musique, when an ambiance track ends, then ambiance still loops normally (unaffected).
- [x] AC 8: Given sequential mode is toggled ON in the side panel, when the user opens the library view, then the shuffle button reflects the active state.
- [x] AC 9: Given only 1 track matches the current filters, when sequential mode is ON and that track ends, then it loops (same as having sequential OFF — no crash, no silence).
- [x] AC 10: Given sequential mode is ON, when the user clicks the toggle OFF, then the current track continues but will loop when it ends (reverts to default behavior).

## Additional Context

### Dependencies

- No new external dependencies required
- Relies on existing YouTube IFrame API `onStateChange` event for track end detection

### Testing Strategy

**Manual Testing Steps:**
1. Add 3+ musique tracks with the same humeur category (e.g., "Comique")
2. Filter to that category in the side panel
3. Toggle sequential mode ON — verify shuffle icon is highlighted
4. Play a track — verify it plays normally
5. Wait for track to end (or skip via YouTube) — verify next track auto-advances and "now playing" updates
6. Let all tracks play through — verify it re-shuffles and continues without the same track repeating at the boundary
7. Change filter while playing — verify queue rebuilds
8. Toggle sequential mode OFF — verify current track loops on end
9. Verify ambiance channel is completely unaffected throughout
10. Open library view — verify shuffle button state is synced

**Edge Cases to Verify:**
- Only 1 track in filter results: should loop that single track
- 0 tracks in filter results: sequential mode should gracefully handle (no crash)
- Toggle sequential mode with nothing playing: should work, queue ready for next play

### Notes

- The `crossfadeDuration` setting exists in the codebase but is unused — could be leveraged in a future enhancement but is out of scope here
- Future enhancement: skip/previous buttons could be added on top of the queue infrastructure built here
- Future enhancement: sequential mode for ambiance channel could reuse the same `SequentialQueue` class

## Review Notes
- Adversarial review completed
- Findings: 5 total, 4 fixed, 1 addressed by existing logic
- Resolution approach: auto-fix
- F1 (Critical): Added reentrant guard (`isAdvancing` flag) in `onStateChange` to prevent duplicate `ENDED` events from skipping tracks
- F2 (High): Stale track refs already handled by existing queue rebuild on filter change / track deletion
- F3 (High): Sequential mode now auto-deactivates when `next()` returns null, keeping button state in sync
- F4 (Medium): `lastPlayedTrack` preserved across toggle off/on cycles for anti-repeat continuity
- F5 (Low): `sequentialQueue` changed from public `readonly` to private field with getter

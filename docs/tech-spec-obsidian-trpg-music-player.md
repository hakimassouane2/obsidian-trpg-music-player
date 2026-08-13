---
title: 'Obsidian TRPG Music Player'
slug: 'obsidian-trpg-music-player'
created: '2026-03-20'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [TypeScript, Obsidian Plugin API, YouTube IFrame Player API, esbuild]
files_to_modify: [package.json, tsconfig.json, esbuild.config.mjs, manifest.json, src/main.ts, src/types.ts, src/constants.ts, src/PlayerService.ts, src/TrackLibrary.ts, src/MusicPlayerView.ts, src/SettingsTab.ts, src/PresetManager.ts, styles.css]
code_patterns: [modular src/ structure, ItemView for side panel, saveData/loadData for persistence, registerMarkdownCodeBlockProcessor for note integration]
test_patterns: [manual testing in Obsidian dev vault, no automated test framework]
---

# Tech-Spec: Obsidian TRPG Music Player

**Created:** 2026-03-20

## Overview

### Problem Statement

GMs need a way to play ambient and music tracks during TRPG sessions without leaving Obsidian, with quick switching for live improvisation. Currently, managing music means alt-tabbing to YouTube or another app, breaking the GM's flow and consuming precious cognitive bandwidth during sessions.

### Solution

An Obsidian plugin with a side panel providing 2-channel YouTube audio playback (ambient + music), a categorized track library, scene presets, crossfade transitions, and note-embedded play buttons. Full hardcoded French UI.

### Scope

**In Scope:**
- Side panel player with current track display, play/pause/stop controls
- 2 audio channels (Ambiance + Musique) via hidden YouTube iframes
- Master volume + per-channel volume sliders (default 80%)
- Track library: add tracks via YouTube URL, assign name and structured categories
- Structured categories: Humeur (tendu, calme, épique, mystérieux, triste, joyeux, combat), Lieu (taverne, donjon, forêt, ville, océan, temple), Intensité (faible, moyenne, élevée)
- Scene presets: named combos (optional ambient + optional music + volume levels)
- 6-second crossfade between tracks
- Filter/browse tracks by category for quick live switching
- Note integration via code block syntax (```trpg-play```)
- Hardcoded French UI labels and controls
- Settings tab for default volume, crossfade duration (future)

**Out of Scope:**
- SFX / soundboard (v2)
- Batch URL import (v2)
- Local files, Spotify, or other audio sources
- i18n / multi-language support
- Configurable crossfade timing (hardcoded 6s for now)
- User-editable categories
- Offline playback

## Context for Development

### Codebase Patterns

- Greenfield Obsidian plugin — confirmed clean slate, no legacy constraints
- Follow `obsidian-trpg-maps` sister plugin patterns (same author, same vault)
- Modular `src/` directory with TypeScript, compiled to single `main.js` via esbuild
- Plugin data stored via `plugin.saveData()` / `plugin.loadData()` in `data.json`
- Side panel implemented as Obsidian `ItemView`
- YouTube playback via hidden YouTube IFrame Player API embeds
- Data synced across devices via Syncthing (`data.json` is sync-friendly — small JSON, atomic writes)
- Target ES2018, ESNext modules, strict mode

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `../obsidian-trpg-maps/src/main.ts` | Reference: plugin entry point pattern |
| `../obsidian-trpg-maps/src/MapView.ts` | Reference: ItemView implementation |
| `../obsidian-trpg-maps/src/SettingsTab.ts` | Reference: settings tab pattern |
| `../obsidian-trpg-maps/package.json` | Reference: dependencies & build scripts |
| `../obsidian-trpg-maps/tsconfig.json` | Reference: TypeScript config |
| `../obsidian-trpg-maps/esbuild.config.mjs` | Reference: build config |

### Technical Decisions

- **Architecture**: Modular TypeScript files (main plugin, view, services, models) compiled to single main.js via esbuild
- **YouTube playback**: Hidden YouTube IFrame Player API — one iframe per channel, managed by a PlayerService
- **Data storage**: Single data.json via Obsidian's saveData/loadData — stores track library, presets, settings
- **Crossfade**: 6-second default, implemented by fading volume of outgoing track while fading in incoming track using requestAnimationFrame or setInterval
- **Note integration**: Obsidian markdown code block processor (`registerMarkdownCodeBlockProcessor`) for ```trpg-play``` blocks
- **UI language**: All UI strings hardcoded in French, no i18n framework
- **Side panel**: Obsidian `ItemView` registered as a right-side leaf

## Implementation Plan

### Tasks

- [x] Task 1: Project scaffolding
  - Files: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`
  - Action: Create build toolchain mirroring `obsidian-trpg-maps`. Install `obsidian` and `typescript` as devDependencies, `esbuild` for bundling. Add `dev` (watch) and `build` scripts. Verify `npm run build` produces `main.js`.

- [x] Task 2: Types and constants
  - Files: `src/types.ts`, `src/constants.ts`
  - Action: Define all TypeScript interfaces and French UI constants.
  - `types.ts`: `Track` (id, name, youtubeId, channel: 'ambiance'|'musique', categories: {humeur, lieu, intensite}), `Preset` (id, name, ambianceTrackId?, musiqueTrackId?, ambianceVolume?, musiqueVolume?), `PluginSettings` (masterVolume, ambianceVolume, musiqueVolume, crossfadeDuration), `PluginData` (tracks: Track[], presets: Preset[], settings: PluginSettings)
  - `constants.ts`: `CATEGORIES` object with `humeur: ['Tendu','Calme','Épique','Mystérieux','Triste','Joyeux','Combat']`, `lieu: ['Taverne','Donjon','Forêt','Ville','Océan','Temple']`, `intensite: ['Faible','Moyenne','Élevée']`. All French UI labels: button text, panel title, placeholders, error messages. `DEFAULT_SETTINGS` with volumes at 0.8 and crossfade at 6000ms. `VIEW_TYPE = 'trpg-music-player'`.

- [x] Task 3: Plugin entry point and manifest
  - Files: `src/main.ts`, `manifest.json`
  - Action: Create main plugin class extending `Plugin`. In `onload()`: load data, register the `MusicPlayerView`, register the `SettingsTab`, register the `trpg-play` code block processor, add ribbon icon to open the side panel. In `onunload()`: clean up player iframes. Update `manifest.json` with correct id, name, version, minAppVersion (1.4.0), description in French, `isDesktopOnly: false`.

- [x] Task 4: PlayerService — YouTube iframe management
  - File: `src/PlayerService.ts`
  - Action: Create a service managing 2 YouTube IFrame Player instances (ambiance + musique). Responsibilities:
    - `loadYouTubeAPI()`: Dynamically inject the YouTube IFrame API script tag if not already loaded. Return a Promise that resolves when `window.onYouTubeIframeAPIReady` fires.
    - `createPlayer(channel, containerId)`: Create a hidden YT.Player instance in a given container div. Set `playerVars: { autoplay: 0, controls: 0 }`. Size: 1x1 pixel (hidden).
    - `play(channel, youtubeId)`: Play a track on a given channel. If a track is already playing on that channel, trigger crossfade (fade out current over 6s while fading in new track).
    - `stop(channel)`: Stop playback on a channel with a quick fade out (500ms).
    - `setVolume(channel, volume)`: Set volume (0-100) on a channel. Multiply by master volume.
    - `setMasterVolume(volume)`: Update master volume and recalculate both channels.
    - `crossfade(channel, newYoutubeId)`: Fade out current track over 6000ms using `setInterval` (update every 50ms), simultaneously fade in new track. Clean up old player after fade completes.
    - `destroy()`: Destroy all iframe players on plugin unload.
  - Notes: Extract YouTube video ID from various URL formats (youtube.com/watch?v=, youtu.be/, youtube.com/embed/). Store current volume state per channel.

- [x] Task 5: TrackLibrary — data persistence and filtering
  - File: `src/TrackLibrary.ts`
  - Action: Create a class that wraps plugin data operations for tracks.
    - `addTrack(name, youtubeUrl, channel, categories)`: Parse YouTube URL to extract video ID, create Track object with generated UUID, save to data.
    - `removeTrack(id)`: Remove track by ID, save.
    - `getTracks(filters?)`: Return tracks optionally filtered by channel, humeur, lieu, intensite. Filters are combined with AND logic.
    - `getTrackById(id)`: Lookup single track.
  - Notes: All mutations call `plugin.saveData()` immediately after change.

- [x] Task 6: PresetManager — scene preset CRUD
  - File: `src/PresetManager.ts`
  - Action: Create a class for preset management.
    - `addPreset(name, ambianceTrackId?, musiqueTrackId?, ambianceVolume?, musiqueVolume?)`: Create preset with generated UUID. Default volumes to current channel volumes if not specified.
    - `removePreset(id)`: Remove preset by ID.
    - `getPresets()`: Return all presets.
    - `applyPreset(preset)`: Call PlayerService to play the specified tracks and set volumes. Trigger crossfade if tracks are already playing.
  - Notes: Volumes stored as 0-1 floats, default 0.8.

- [x] Task 7: MusicPlayerView — side panel UI
  - File: `src/MusicPlayerView.ts`
  - Action: Create an `ItemView` subclass for the side panel. All labels in French. Layout sections:
    - **Header**: "Lecteur Musical TRPG" title
    - **Lecteur** section: Two channel rows (Ambiance / Musique), each showing: current track name (or "Aucune piste"), Play/Pause and Stop buttons. Hidden div containers for YouTube iframes.
    - **Volume** section: Master volume slider ("Volume général"), Ambiance volume slider, Musique volume slider. All range inputs 0-100, default 80.
    - **Bibliothèque** section: Category filter dropdowns (Humeur, Lieu, Intensité) with "Tous" as default option. Filtered track list displayed as clickable items. Each item shows track name + assigned channel indicator. Click plays the track on its assigned channel.
    - **Préréglages** section: List of saved presets as clickable buttons. Click applies the preset. Delete button per preset.
    - **Ajouter une piste** section: Input field for YouTube URL, text input for track name, channel selector (Ambiance/Musique), category dropdowns for Humeur/Lieu/Intensité, "Ajouter" submit button.
    - **Ajouter un préréglage** section: Input for preset name, dropdowns to select ambiance track and musique track (from library), volume inputs, "Enregistrer" button.
  - Notes: Use Obsidian's native `setting` API for form elements where possible. Use `containerEl.createDiv/createEl` for custom layout. Refresh track list when filters change. Refresh view on data changes.

- [x] Task 8: SettingsTab — plugin settings
  - File: `src/SettingsTab.ts`
  - Action: Create `PluginSettingTab` subclass. Settings in French:
    - "Volume général par défaut" — slider 0-100, default 80
    - "Volume ambiance par défaut" — slider 0-100, default 80
    - "Volume musique par défaut" — slider 0-100, default 80
  - Notes: Keep minimal for v1. Crossfade duration hardcoded, not exposed in settings.

- [x] Task 9: Note integration — code block processor
  - File: `src/main.ts` (add to onload)
  - Action: Register a `registerMarkdownCodeBlockProcessor` for `trpg-play` blocks. Parse block content for `preset: <preset-name>`. Render a styled button showing the preset name with a play icon. On click, look up preset by name and call `PresetManager.applyPreset()`. If preset not found, render error text "Préréglage introuvable: <name>".
  - Example usage in notes:
    ```
    ```trpg-play
    preset: Taverne de nuit
    ```
    ```

- [x] Task 10: Styles
  - File: `styles.css`
  - Action: Style the side panel layout:
    - Compact sections with collapsible headers
    - Volume sliders styled to fit narrow side panel
    - Track list items with hover highlight and click affordance
    - Preset buttons with distinct visual style
    - Code block play buttons with play icon and preset name
    - Channel indicators (color-coded: blue for ambiance, orange for musique)
    - Responsive to Obsidian light/dark themes (use CSS variables: `--background-primary`, `--text-normal`, etc.)
    - Hidden YouTube iframe containers (`width: 1px; height: 1px; opacity: 0; position: absolute;`)

- [x] Task 11: Build, test, and wire everything together
  - Files: `src/main.ts` (final wiring)
  - Action: Ensure all services are instantiated in `onload()`, passed to the view. Verify: `npm run build` succeeds, plugin loads in Obsidian without errors, side panel opens from ribbon icon, all sections render. Test full flow: add track → filter → play → crossfade → preset → note block.

### Acceptance Criteria

- [ ] AC 1: Given the plugin is installed, when the user clicks the ribbon icon, then the side panel opens on the right side with all sections visible in French.
- [ ] AC 2: Given the side panel is open, when the user pastes a YouTube URL, enters a name, selects a channel and categories, and clicks "Ajouter", then the track appears in the library and persists after plugin reload.
- [ ] AC 3: Given tracks exist in the library, when the user selects category filters, then only matching tracks are displayed (AND logic across filters).
- [ ] AC 4: Given a track is in the library, when the user clicks it, then it plays audio on the assigned channel via hidden YouTube iframe.
- [ ] AC 5: Given a track is playing on a channel, when the user plays a different track on the same channel, then the old track fades out and the new track fades in over 6 seconds simultaneously.
- [ ] AC 6: Given both channels have tracks playing, when the user adjusts the master volume slider, then both channels' effective volume updates proportionally.
- [ ] AC 7: Given tracks are playing, when the user adjusts a per-channel volume slider, then only that channel's volume changes, respecting the master volume multiplier.
- [ ] AC 8: Given the user creates a preset with an ambiance track and a musique track at specific volumes, when the user clicks that preset, then both tracks play and volumes are set accordingly with crossfade from any currently playing tracks.
- [ ] AC 9: Given a note contains a `trpg-play` code block with `preset: Taverne de nuit`, when the note is rendered, then a clickable play button is displayed with the preset name.
- [ ] AC 10: Given the play button in a note is clicked, when the preset exists, then the preset is applied (tracks play, volumes set). When the preset does not exist, then an error message "Préréglage introuvable" is shown.
- [ ] AC 11: Given the plugin data is saved, when the vault is synced via Syncthing to another device, then the track library and presets are available on the other device after plugin reload.
- [ ] AC 12: Given a YouTube video has been removed, when the plugin tries to play it, then an error state is shown in the UI ("Vidéo indisponible") instead of crashing.
- [ ] AC 13: Given the plugin is loaded, when no internet is available, then the plugin loads without error but shows "Connexion requise" when playback is attempted.

## Additional Context

### Dependencies

- **obsidian** (npm, devDependency) — Plugin API
- **typescript** (npm, devDependency) — Language
- **esbuild** (npm, devDependency) — Bundler
- **YouTube IFrame Player API** (CDN, loaded at runtime) — `https://www.youtube.com/iframe_api`
- No production npm dependencies required

### Testing Strategy

- **Manual testing in Obsidian dev vault:**
  - Open plugin, verify side panel renders correctly
  - Add 3-5 test tracks across different categories
  - Test category filtering (single filter, combined filters, "Tous" reset)
  - Play tracks on both channels simultaneously, verify audio from both
  - Trigger crossfade by switching tracks on same channel, verify smooth 6s transition
  - Create preset, apply it, verify correct tracks + volumes
  - Add `trpg-play` code block in a note, verify button renders and works
  - Reload plugin, verify all data persists
  - Test with invalid YouTube URL (should show error)
  - Test with removed YouTube video (should show "Vidéo indisponible")
  - Test volume sliders: master affects both, per-channel independent
- **Cross-device testing:**
  - Sync vault via Syncthing, verify data.json transfers correctly
  - Open plugin on second device, verify library and presets intact

### Notes

- **Risk — YouTube IFrame API in Obsidian**: The IFrame API loads external scripts. Obsidian's Electron environment should support this, but CSP or sandboxing could be an issue. Mitigation: test early in Task 4, pivot to `<webview>` tag if iframe blocked.
- **Risk — YouTube URL parsing**: Users may paste various URL formats. Support at minimum: `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`, `music.youtube.com/watch?v=ID`.
- **Limitation**: YouTube IFrame API does not support audio-only mode. The hidden iframe loads the full video player, consuming some extra memory. Acceptable for 2 concurrent channels.
- **Future considerations**: SFX soundboard (v2), batch import (v2), configurable crossfade, user-editable categories.

## Review Notes

- Adversarial review completed
- Findings: 18 total, 17 fixed (real), 1 skipped (noise — F12: CSS already handled)
- Resolution approach: auto-fix
- Key fixes: crossfade error handling (F1), API load timeout (F3), view close no longer destroys service (F4), volume unit normalization (F2), stale preset cleanup (F10), DEFAULT_DATA deep copy (F11), code block error display (F9), async error handling (F17)

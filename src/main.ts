import { Plugin, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import type { PluginData, Channel } from './types';
import { VIEW_TYPE, VIEW_TYPE_LIBRARY, DEFAULT_DATA, LOG_PREFIX, UI } from './constants';
import { PlayerService } from './PlayerService';
import { TrackLibrary } from './TrackLibrary';
import { PresetManager } from './PresetManager';
import { MusicPlayerView } from './MusicPlayerView';
import { LibraryView } from './LibraryView';
import { TRPGMusicSettingsTab } from './SettingsTab';

export default class TRPGMusicPlugin extends Plugin {
  // F11: Deep-copy arrays to avoid mutating shared DEFAULT_DATA
  data: PluginData = { tracks: [], presets: [], settings: { ...DEFAULT_DATA.settings } };
  playerService: PlayerService = new PlayerService();
  trackLibrary!: TrackLibrary;
  presetManager!: PresetManager;
  nowPlayingNames: Record<Channel, string> = { ambiance: '', musique: '' };
  private hiddenPlayerContainer: HTMLElement | null = null;
  private codeBlockButtons: Array<{
    btn: HTMLElement;
    iconSpan: HTMLElement;
    labelSpan: HTMLElement;
    trackName: string;
    presetName: string;
  }> = [];

  async onload(): Promise<void> {
    console.log(LOG_PREFIX, 'Loading plugin...');

    // Load saved data
    await this.loadPluginData();

    // Initialize services
    this.trackLibrary = new TrackLibrary(this.data, () => this.savePluginData());
    this.presetManager = new PresetManager(this.data, () => this.savePluginData(), this.playerService, this.trackLibrary);

    // Set volumes from saved settings
    this.playerService.setVolume('ambiance', this.data.settings.ambianceVolume * 100);
    this.playerService.setVolume('musique', this.data.settings.musiqueVolume * 100);

    // Show notice on player errors
    this.playerService.onError((_channel, message) => {
      new Notice(message, 5000);
    });

    // Register views
    this.registerView(VIEW_TYPE, (leaf) => new MusicPlayerView(leaf, this));
    this.registerView(VIEW_TYPE_LIBRARY, (leaf) => new LibraryView(leaf, this));

    // Settings tab
    this.addSettingTab(new TRPGMusicSettingsTab(this.app, this));

    // Ribbon icon — side panel player
    this.addRibbonIcon('music', UI.PLUGIN_NAME, () => {
      this.activateView();
    });

    // Ribbon icon — full library
    this.addRibbonIcon('list-music', UI.LIBRARY_TITLE, () => {
      this.activateLibrary();
    });

    // Commands
    this.addCommand({
      id: 'open-music-player',
      name: 'Ouvrir le lecteur musical',
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'open-music-library',
      name: 'Ouvrir la bibliothèque musicale',
      callback: () => {
        this.activateLibrary();
      },
    });

    this.addCommand({
      id: 'open-music-library-window',
      name: 'Ouvrir la bibliothèque musicale dans une nouvelle fenêtre',
      callback: () => {
        this.activateLibrary('window');
      },
    });

    // Code block processor for trpg-play
    this.registerMarkdownCodeBlockProcessor('trpg-play', (source, el) => {
      const lines = source.trim().split('\n');
      let presetName = '';
      let trackName = '';
      let customName = '';

      for (const line of lines) {
        const presetMatch = line.match(/^preset:\s*(.+)$/i);
        if (presetMatch) {
          presetName = presetMatch[1].trim();
        }
        const trackMatch = line.match(/^track:\s*(.+)$/i);
        if (trackMatch) {
          trackName = trackMatch[1].trim();
        }
        const nameMatch = line.match(/^name:\s*(.+)$/i);
        if (nameMatch) {
          customName = nameMatch[1].trim();
        }
      }

      if (!presetName && !trackName) {
        el.createDiv({ cls: 'trpg-codeblock-error', text: UI.MISSING_FIELDS });
        return;
      }

      const label = customName || presetName || trackName;
      const btn = el.createEl('button', { cls: 'trpg-codeblock-btn' });
      const iconSpan = btn.createSpan({ cls: 'trpg-codeblock-icon' });
      setIcon(iconSpan, 'play');
      const labelSpan = btn.createSpan({ text: label });

      // Register this button for state updates
      const entry = { btn, iconSpan, labelSpan, trackName, presetName };
      this.codeBlockButtons.push(entry);

      // Sync initial state
      this.syncCodeBlockButton(entry);

      btn.addEventListener('click', async () => {
        try {
          await this.ensurePlayersReady();
          if (presetName) {
            const preset = this.presetManager.getPresetByName(presetName);
            if (!preset) {
              btn.empty();
              btn.createSpan({ text: `${UI.PRESET_NOT_FOUND}: ${presetName}` });
              btn.addClass('trpg-codeblock-error');
              return;
            }
            const played = await this.presetManager.applyPreset(preset);
            if (played.ambiance) this.updateNowPlaying('ambiance', played.ambiance);
            if (played.musique) this.updateNowPlaying('musique', played.musique);
          } else {
            const track = this.trackLibrary.getTracks()
              .find((t) => t.name.toLowerCase() === trackName.toLowerCase());
            if (!track) {
              btn.empty();
              btn.createSpan({ text: `Piste introuvable : ${trackName}` });
              btn.addClass('trpg-codeblock-error');
              return;
            }
            // Toggle: if this track is already playing, stop it
            const state = this.playerService.getChannelState(track.channel);
            if (state.isPlaying && state.videoId === track.youtubeId) {
              this.playerService.stop(track.channel);
              this.updateNowPlaying(track.channel, '');
            } else {
              await this.playerService.play(track.channel, track.youtubeId);
              this.updateNowPlaying(track.channel, track.name);
            }
          }
          this.refreshCodeBlockButtons();
        } catch (e) {
          console.error(LOG_PREFIX, 'Error applying from note:', e);
        }
      });
    });

    console.log(LOG_PREFIX, 'Plugin loaded');
  }

  onunload(): void {
    console.log(LOG_PREFIX, 'Unloading plugin...');
    this.playerService.destroy();
    this.hiddenPlayerContainer?.remove();
    this.hiddenPlayerContainer = null;
  }

  async loadPluginData(): Promise<void> {
    const saved = await this.loadData();
    if (saved) {
      this.data = {
        tracks: saved.tracks || [],
        presets: saved.presets || [],
        settings: { ...DEFAULT_DATA.settings, ...saved.settings },
      };
    }
  }

  async savePluginData(): Promise<void> {
    await this.saveData(this.data);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(true);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async activateLibrary(mode: 'tab' | 'window' = 'tab'): Promise<void> {
    const { workspace } = this.app;

    if (mode === 'window') {
      const leaf = workspace.getLeaf('window');
      await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true });
      workspace.revealLeaf(leaf);
      return;
    }

    const leaves = workspace.getLeavesOfType(VIEW_TYPE_LIBRARY);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
    } else {
      const leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  refreshSidePanel(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as MusicPlayerView;
      if (view.refreshTrackList) {
        view.refreshTrackList();
        view.refreshPresetSection();
      }
    }
  }

  refreshLibrary(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY);
    for (const leaf of leaves) {
      const view = leaf.view as LibraryView;
      if (view.refreshGrid) view.refreshGrid();
      if (view.refreshMiniPlayer) view.refreshMiniPlayer();
    }
  }

  /** Update the "now playing" track name in the side panel and library mini player */
  updateNowPlaying(channel: Channel, trackName: string): void {
    this.nowPlayingNames[channel] = trackName;
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as MusicPlayerView;
      if (view.setNowPlaying) view.setNowPlaying(channel, trackName);
      if (view.refreshVolumeSliders) view.refreshVolumeSliders();
    }
    const libLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY);
    for (const leaf of libLeaves) {
      const view = leaf.view as LibraryView;
      if (view.setMiniPlayerNowPlaying) view.setMiniPlayerNowPlaying(channel, trackName);
      if (view.refreshVolumeSliders) view.refreshVolumeSliders();
    }
    this.refreshLibrary();
    this.refreshCodeBlockButtons();
  }

  /** Ensure YouTube players are initialized, creating a hidden container if no view is open */
  async ensurePlayersReady(): Promise<void> {
    const ambianceReady = this.playerService.isPlayerInitialized('ambiance');
    const musiqueReady = this.playerService.isPlayerInitialized('musique');
    if (ambianceReady && musiqueReady) return;

    if (!this.hiddenPlayerContainer) {
      this.hiddenPlayerContainer = document.body.createDiv({ cls: 'trpg-youtube-containers' });
      this.hiddenPlayerContainer.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
    }

    if (!ambianceReady) {
      const c = this.hiddenPlayerContainer.createDiv({ cls: 'trpg-youtube-container' });
      await this.playerService.createPlayer('ambiance', c);
    }
    if (!musiqueReady) {
      const c = this.hiddenPlayerContainer.createDiv({ cls: 'trpg-youtube-container' });
      await this.playerService.createPlayer('musique', c);
    }
  }

  private syncCodeBlockButton(entry: (typeof this.codeBlockButtons)[number]): void {
    if (entry.presetName) return; // Presets don't toggle
    if (!entry.trackName) return;

    const track = this.trackLibrary.getTracks()
      .find((t) => t.name.toLowerCase() === entry.trackName.toLowerCase());
    if (!track) return;

    const state = this.playerService.getChannelState(track.channel);
    const isPlaying = state.isPlaying && state.videoId === track.youtubeId;

    entry.iconSpan.empty();
    setIcon(entry.iconSpan, isPlaying ? 'square' : 'play');
    entry.btn.toggleClass('trpg-codeblock-playing', isPlaying);
  }

  private refreshCodeBlockButtons(): void {
    // Remove entries whose DOM elements are no longer attached
    this.codeBlockButtons = this.codeBlockButtons.filter((e) => e.btn.isConnected);
    for (const entry of this.codeBlockButtons) {
      this.syncCodeBlockButton(entry);
    }
  }
}

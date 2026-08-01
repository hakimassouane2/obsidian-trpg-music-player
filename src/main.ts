import { Plugin, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import type { PluginData, Channel, OneShotEntry } from './types';
import { VIEW_TYPE, VIEW_TYPE_LIBRARY, DEFAULT_DATA, LOG_PREFIX, UI } from './constants';
import { PlayerService, extractYoutubeId } from './PlayerService';
import { generateId, fetchYoutubeTitle, isPersistentYoutubeError, canonicalYoutubeUrl } from './utils';
import { TrackLibrary } from './TrackLibrary';
import { PresetManager } from './PresetManager';
import { MusicPlayerView } from './MusicPlayerView';
import { LibraryView } from './LibraryView';
import { TRPGMusicSettingsTab } from './SettingsTab';

/** Vérifications menées de front lors d'un scan complet de la bibliothèque. */
const SCAN_WORKERS = 3;

export default class TRPGMusicPlugin extends Plugin {
  // F11: Deep-copy arrays to avoid mutating shared DEFAULT_DATA
  data: PluginData = { tracks: [], presets: [], settings: { ...DEFAULT_DATA.settings } };
  playerService: PlayerService = new PlayerService();
  trackLibrary!: TrackLibrary;
  presetManager!: PresetManager;
  nowPlayingNames: Record<Channel, string> = { ambiance: '', musique: '' };
  // Historique des one-shots de la session courante (non persisté)
  oneShotHistory: OneShotEntry[] = [];
  private scanInProgress = false;
  private scanCancelled = false;
  private hiddenPlayerContainer: HTMLElement | null = null;
  private codeBlockButtons: Array<{
    btn: HTMLElement;
    iconSpan: HTMLElement;
    labelSpan: HTMLElement;
    trackName: string;
    presetName: string;
    youtubeId?: string;
    channel?: Channel;
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

    // Une piste illisible ne doit plus interrompre une session : elle est signalée,
    // marquée si le refus est définitif, et la playlist enchaîne toute seule.
    this.playerService.onPlaybackFailure((channel, videoId, code, reason, skipped) => {
      const track = videoId ? this.trackLibrary.findByYoutubeId(videoId) : undefined;
      const label = track?.name ?? this.nowPlayingNames[channel] ?? '';

      if (track && isPersistentYoutubeError(code)) {
        this.trackLibrary.markUnavailable(videoId, code, reason);
      }

      const prefix = label ? `« ${label} » : ` : '';
      new Notice(`${prefix}${reason}${skipped ? ` — ${UI.SKIPPING_TO_NEXT}` : ''}`, 7000);

      if (!skipped && this.nowPlayingNames[channel]) {
        this.updateNowPlaying(channel, '');
      }
      this.refreshLibrary();
    });

    // Sequential mode: update now-playing when track auto-advances
    this.playerService.onTrackAdvance = (trackName: string) => {
      this.updateNowPlaying('musique', trackName);
    };

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

    this.addCommand({
      id: 'scan-library-playability',
      name: UI.SCAN_LIBRARY,
      callback: () => {
        void this.scanLibrary();
      },
    });

    // Code block processor for trpg-play
    this.registerMarkdownCodeBlockProcessor('trpg-play', (source, el) => {
      const lines = source.trim().split('\n');
      let presetName = '';
      let trackName = '';
      let customName = '';
      let urlValue = '';
      let channelValue: Channel = 'musique';
      let volumeValue = -1;

      for (const line of lines) {
        const presetMatch = line.match(/^preset:\s*(.+)$/i);
        if (presetMatch) presetName = presetMatch[1].trim();
        const trackMatch = line.match(/^track:\s*(.+)$/i);
        if (trackMatch) trackName = trackMatch[1].trim();
        const nameMatch = line.match(/^name:\s*(.+)$/i);
        if (nameMatch) customName = nameMatch[1].trim();
        const urlMatch = line.match(/^url:\s*(.+)$/i);
        if (urlMatch) urlValue = urlMatch[1].trim();
        const channelMatch = line.match(/^channel:\s*(.+)$/i);
        if (channelMatch) {
          const ch = channelMatch[1].trim().toLowerCase();
          if (ch === 'ambiance' || ch === 'musique') channelValue = ch;
        }
        const volumeMatch = line.match(/^volume:\s*(\d+)$/i);
        if (volumeMatch) volumeValue = Math.min(100, Math.max(0, parseInt(volumeMatch[1])));
      }

      // Validate: need at least one of preset, track, or url
      const youtubeId = urlValue ? extractYoutubeId(urlValue) : null;
      if (!presetName && !trackName && !youtubeId) {
        if (urlValue) {
          el.createDiv({ cls: 'trpg-codeblock-error', text: UI.INVALID_URL });
        } else {
          el.createDiv({ cls: 'trpg-codeblock-error', text: UI.MISSING_FIELDS });
        }
        return;
      }

      const label = customName || presetName || trackName || 'YouTube';
      const btn = el.createEl('button', { cls: 'trpg-codeblock-btn' });
      const iconSpan = btn.createSpan({ cls: 'trpg-codeblock-icon' });
      setIcon(iconSpan, 'play');
      const labelSpan = btn.createSpan({ text: label });

      // Register this button for state updates
      const entry = { btn, iconSpan, labelSpan, trackName, presetName, youtubeId: youtubeId || undefined, channel: youtubeId ? channelValue : undefined };
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
          } else if (youtubeId) {
            // Direct YouTube URL playback (not in library)
            const ch = channelValue;
            const state = this.playerService.getChannelState(ch);
            if (state.isPlaying && state.videoId === youtubeId) {
              this.playerService.stop(ch);
              this.updateNowPlaying(ch, '');
            } else {
              if (volumeValue >= 0) {
                this.playerService.setVolume(ch, volumeValue);
              }
              await this.playerService.play(ch, youtubeId);
              this.updateNowPlaying(ch, label);
            }
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
      if (view.refreshPlaylist) view.refreshPlaylist();
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

  /**
   * Joue immédiatement une URL YouTube sur le canal choisi, sans la sauvegarder.
   * Ajoute une entrée à l'historique de session et récupère le titre en arrière-plan.
   * Retourne un message d'erreur si l'URL est invalide, sinon null. `info` signale
   * sans bloquer que la vidéo est déjà en bibliothèque.
   */
  async playOneShot(url: string, channel: Channel): Promise<{ error: string | null; info?: string }> {
    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) return { error: UI.INVALID_URL };

    // Un one-shot n'écrit rien : le doublon est une information, pas un blocage
    const existing = this.trackLibrary.findByYoutubeId(youtubeId);
    const info = existing
      ? `${UI.ONESHOT_ALREADY_IN_LIBRARY} : « ${existing.name} »`
      : undefined;

    await this.ensurePlayersReady();
    await this.playerService.play(channel, youtubeId);

    // Évite les doublons : on remonte l'entrée existante en tête plutôt que de dupliquer
    this.oneShotHistory = this.oneShotHistory.filter(
      (e) => !(e.youtubeId === youtubeId && e.channel === channel)
    );
    const entry: OneShotEntry = { id: generateId(), youtubeId, channel, name: UI.ONESHOT_LOADING };
    this.oneShotHistory.unshift(entry);

    this.updateNowPlaying(channel, entry.name);
    this.refreshOneShot();

    // Récupère le vrai titre en arrière-plan et le renseigne une fois disponible.
    // On interroge l'URL canonique : une URL de radio ferait remonter un autre titre.
    fetchYoutubeTitle(canonicalYoutubeUrl(youtubeId)).then((title) => {
      entry.name = title || `YouTube (${youtubeId})`;
      const state = this.playerService.getChannelState(channel);
      if (state.videoId === youtubeId) {
        this.updateNowPlaying(channel, entry.name);
      }
      this.refreshOneShot();
    });

    return { error: null, info };
  }

  /**
   * Teste chaque piste de la bibliothèque dans un lecteur caché et met à jour les
   * marquages « illisible ». Les pistes déjà marquées sont retestées : YouTube
   * lève parfois ses restrictions.
   */
  async scanLibrary(onProgress?: (done: number, total: number) => void): Promise<{ checked: number; broken: number; fixed: number }> {
    if (this.scanInProgress) {
      new Notice(`${UI.SCAN_RUNNING}…`, 3000);
      return { checked: 0, broken: 0, fixed: 0 };
    }

    const tracks = this.trackLibrary.getTracks();
    this.scanInProgress = true;
    this.scanCancelled = false;

    let done = 0;
    let broken = 0;
    let fixed = 0;
    const notice = new Notice(`${UI.SCAN_RUNNING} : 0/${tracks.length}`, 0);

    try {
      await this.ensurePlayersReady();

      // File consommée par un petit nombre de workers : une annulation prend
      // effet immédiatement, au lieu d'attendre une file de 300 tests déjà lancés.
      const pending = [...tracks];
      const workers = Array.from({ length: SCAN_WORKERS }, async () => {
        while (!this.scanCancelled) {
          const track = pending.shift();
          if (!track) return;

          const result = await this.playerService.probeEmbeddable(track.youtubeId);
          if (this.scanCancelled) return;

          if (result.status === 'error' && result.code !== undefined && isPersistentYoutubeError(result.code)) {
            if (!track.unavailable) broken++;
            this.trackLibrary.markUnavailable(track.youtubeId, result.code, result.reason ?? UI.VIDEO_UNAVAILABLE);
          } else if (result.status === 'ok' && track.unavailable) {
            this.trackLibrary.clearUnavailable(track.id);
            fixed++;
          }

          done++;
          notice.setMessage(`${UI.SCAN_RUNNING} : ${done}/${tracks.length}`);
          onProgress?.(done, tracks.length);
        }
      });
      await Promise.all(workers);
    } finally {
      this.scanInProgress = false;
      notice.hide();
      this.refreshLibrary();
    }

    const total = this.trackLibrary.getUnavailableTracks().length;
    new Notice(
      `${UI.SCAN_DONE} : ${done}/${tracks.length} vérifiées, ${broken} nouvelle(s) illisible(s), ${fixed} réhabilitée(s), ${total} illisible(s) au total`,
      8000
    );

    return { checked: done, broken, fixed };
  }

  /** Interrompt un scan en cours. */
  cancelScan(): void {
    this.scanCancelled = true;
  }

  isScanning(): boolean {
    return this.scanInProgress;
  }

  /** Relance un one-shot déjà présent dans l'historique et le remonte en tête. */
  async replayOneShot(entry: OneShotEntry): Promise<void> {
    await this.ensurePlayersReady();
    await this.playerService.play(entry.channel, entry.youtubeId);
    this.updateNowPlaying(entry.channel, entry.name);
    this.oneShotHistory = [entry, ...this.oneShotHistory.filter((e) => e.id !== entry.id)];
    this.refreshOneShot();
  }

  /** Retire un one-shot de l'historique de session. */
  removeOneShot(id: string): void {
    this.oneShotHistory = this.oneShotHistory.filter((e) => e.id !== id);
    this.refreshOneShot();
  }

  /** Re-render l'historique one-shot dans toutes les vues ouvertes. */
  refreshOneShot(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view as MusicPlayerView;
      view.refreshOneShotHistory?.();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)) {
      const view = leaf.view as LibraryView;
      view.refreshOneShotHistory?.();
    }
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

    let isPlaying = false;

    if (entry.youtubeId && entry.channel) {
      // Direct URL mode
      const state = this.playerService.getChannelState(entry.channel);
      isPlaying = state.isPlaying && state.videoId === entry.youtubeId;
    } else if (entry.trackName) {
      // Library track mode
      const track = this.trackLibrary.getTracks()
        .find((t) => t.name.toLowerCase() === entry.trackName.toLowerCase());
      if (!track) return;
      const state = this.playerService.getChannelState(track.channel);
      isPlaying = state.isPlaying && state.videoId === track.youtubeId;
    } else {
      return;
    }

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

import { ItemView, WorkspaceLeaf, setIcon, Menu } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Channel, Track, Preset } from './types';
import { VIEW_TYPE_LIBRARY, CATEGORIES, UI } from './constants';
import { EditTrackModal } from './EditTrackModal';
import { EditPresetModal } from './EditPresetModal';
import { AddTrackModal } from './AddTrackModal';
import { AddPresetModal } from './AddPresetModal';

type LibraryTab = 'tracks' | 'presets';

export class LibraryView extends ItemView {
  private plugin: TRPGMusicPlugin;
  private activeTab: LibraryTab = 'tracks';
  private searchQuery = '';
  private filterChannel: Channel | '' = '';
  private filterHumeur = '';
  private filterLieu = '';
  private filterIntensite = '';
  private gridEl: HTMLElement | null = null;
  private presetsEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private tracksTabEl: HTMLElement | null = null;
  private presetsTabEl: HTMLElement | null = null;
  private addBtn: HTMLElement | null = null;
  private filtersRowEl: HTMLElement | null = null;
  private searchRowEl: HTMLElement | null = null;
  private presetSearchRowEl: HTMLElement | null = null;
  private presetSearchQuery = '';
  private resetBtn: HTMLElement | null = null;

  // Mini player refs
  private miniAmbianceNameEl: HTMLElement | null = null;
  private miniMusiqueNameEl: HTMLElement | null = null;
  private miniThumbEls: Record<Channel, HTMLImageElement | null> = { ambiance: null, musique: null };
  private miniPlayPauseBtns: Record<Channel, HTMLElement | null> = { ambiance: null, musique: null };
  private miniVolSliders: Record<Channel, HTMLInputElement | null> = { ambiance: null, musique: null };
  private miniVolValues: Record<Channel, HTMLElement | null> = { ambiance: null, musique: null };

  constructor(leaf: WorkspaceLeaf, plugin: TRPGMusicPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_LIBRARY;
  }

  getDisplayText(): string {
    return UI.LIBRARY_TITLE;
  }

  getIcon(): string {
    return 'list-music';
  }

  onPaneMenu(menu: Menu): void {
    menu.addItem((item) => {
      item
        .setTitle('Ouvrir dans une nouvelle fenêtre')
        .setIcon('arrow-up-right')
        .onClick(() => {
          this.plugin.activateLibrary('window');
        });
    });
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('trpg-library-view');

    // Ensure YouTube players are initialized (they may not exist if side panel was never opened)
    if (!this.plugin.playerService.isPlayerInitialized('ambiance') || !this.plugin.playerService.isPlayerInitialized('musique')) {
      const iframeContainer = contentEl.createDiv({ cls: 'trpg-youtube-containers' });
      if (!this.plugin.playerService.isPlayerInitialized('ambiance')) {
        const ambianceContainer = iframeContainer.createDiv({ cls: 'trpg-youtube-container' });
        await this.plugin.playerService.createPlayer('ambiance', ambianceContainer);
      }
      if (!this.plugin.playerService.isPlayerInitialized('musique')) {
        const musiqueContainer = iframeContainer.createDiv({ cls: 'trpg-youtube-container' });
        await this.plugin.playerService.createPlayer('musique', musiqueContainer);
      }
    }

    const header = contentEl.createDiv({ cls: 'trpg-lib-header' });

    const titleRow = header.createDiv({ cls: 'trpg-lib-title-row' });
    const titleIcon = titleRow.createSpan({ cls: 'trpg-lib-title-icon' });
    setIcon(titleIcon, 'list-music');
    titleRow.createEl('h2', { cls: 'trpg-lib-title', text: UI.LIBRARY_TITLE });
    this.countEl = titleRow.createSpan({ cls: 'trpg-lib-count' });

    // Tab bar with add button on the right
    const tabBar = header.createDiv({ cls: 'trpg-lib-tabs' });
    const tabGroup = tabBar.createDiv({ cls: 'trpg-lib-tab-group' });
    this.tracksTabEl = tabGroup.createEl('button', { cls: 'trpg-lib-tab trpg-lib-tab-active', text: 'Pistes' });
    this.presetsTabEl = tabGroup.createEl('button', { cls: 'trpg-lib-tab', text: 'Presets' });

    this.tracksTabEl.addEventListener('click', () => this.switchTab('tracks'));
    this.presetsTabEl.addEventListener('click', () => this.switchTab('presets'));

    this.addBtn = tabBar.createEl('button', { cls: 'trpg-lib-add-btn' });
    const addIcon = this.addBtn.createSpan();
    setIcon(addIcon, 'plus');
    this.addBtn.createSpan({ text: 'Ajouter une piste' });
    this.addBtn.addEventListener('click', () => this.openAddModal());

    // Search (tracks only)
    this.searchRowEl = header.createDiv({ cls: 'trpg-lib-search-row' });
    const searchInput = this.searchRowEl.createEl('input', {
      cls: 'trpg-lib-search',
      attr: { type: 'text', placeholder: UI.SEARCH_PLACEHOLDER },
    });
    const searchIcon = this.searchRowEl.createSpan({ cls: 'trpg-lib-search-icon' });
    setIcon(searchIcon, 'search');

    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.refreshGrid();
    });

    // Filters (tracks only)
    this.filtersRowEl = header.createDiv({ cls: 'trpg-lib-filters' });

    this.createFilterChip(this.filtersRowEl, UI.ALL_CHANNELS, [UI.CHANNEL_AMBIANCE, UI.CHANNEL_MUSIQUE], (val) => {
      this.filterChannel = val === UI.CHANNEL_AMBIANCE ? 'ambiance' : val === UI.CHANNEL_MUSIQUE ? 'musique' : '';
      this.refreshGrid();
    });
    this.createFilterChip(this.filtersRowEl, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[], (val) => {
      this.filterHumeur = val;
      this.refreshGrid();
    });
    this.createFilterChip(this.filtersRowEl, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[], (val) => {
      this.filterLieu = val;
      this.refreshGrid();
    });
    this.createFilterChip(this.filtersRowEl, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[], (val) => {
      this.filterIntensite = val;
      this.refreshGrid();
    });

    // Reset filters button (hidden by default, shown when filters are active)
    this.resetBtn = this.filtersRowEl.createEl('button', { cls: 'trpg-lib-reset-btn trpg-lib-hidden', text: 'Réinitialiser' });
    this.resetBtn.addEventListener('click', () => {
      this.searchQuery = '';
      this.filterChannel = '';
      this.filterHumeur = '';
      this.filterLieu = '';
      this.filterIntensite = '';
      searchInput.value = '';
      this.filtersRowEl?.querySelectorAll('select').forEach((s) => { (s as HTMLSelectElement).value = ''; });
      this.refreshGrid();
    });

    // Preset search (hidden on tracks tab)
    this.presetSearchRowEl = header.createDiv({ cls: 'trpg-lib-search-row trpg-lib-hidden' });
    const presetSearchInput = this.presetSearchRowEl.createEl('input', {
      cls: 'trpg-lib-search',
      attr: { type: 'text', placeholder: 'Rechercher un preset...' },
    });
    const presetSearchIcon = this.presetSearchRowEl.createSpan({ cls: 'trpg-lib-search-icon' });
    setIcon(presetSearchIcon, 'search');
    presetSearchInput.addEventListener('input', () => {
      this.presetSearchQuery = presetSearchInput.value.trim().toLowerCase();
      this.refreshPresets();
    });

    // Content areas
    this.gridEl = contentEl.createDiv({ cls: 'trpg-lib-grid' });
    this.presetsEl = contentEl.createDiv({ cls: 'trpg-lib-presets-panel trpg-lib-hidden' });

    // Mini player bar (sticky bottom)
    this.buildMiniPlayer(contentEl);

    // Restore now-playing state from plugin
    for (const channel of ['ambiance', 'musique'] as Channel[]) {
      const name = this.plugin.nowPlayingNames[channel];
      if (name) this.setMiniPlayerNowPlaying(channel, name);
    }

    this.refreshGrid();
    this.refreshPresets();
  }

  async onClose(): Promise<void> {}

  private switchTab(tab: LibraryTab): void {
    this.activeTab = tab;
    const isPresets = tab === 'presets';

    this.tracksTabEl?.toggleClass('trpg-lib-tab-active', !isPresets);
    this.presetsTabEl?.toggleClass('trpg-lib-tab-active', isPresets);

    this.searchRowEl?.toggleClass('trpg-lib-hidden', isPresets);
    this.filtersRowEl?.toggleClass('trpg-lib-hidden', isPresets);
    this.presetSearchRowEl?.toggleClass('trpg-lib-hidden', !isPresets);
    this.gridEl?.toggleClass('trpg-lib-hidden', isPresets);
    this.presetsEl?.toggleClass('trpg-lib-hidden', !isPresets);

    // Update add button label
    if (this.addBtn) {
      const labelSpan = this.addBtn.querySelectorAll('span')[1];
      if (labelSpan) labelSpan.textContent = isPresets ? 'Ajouter un preset' : 'Ajouter une piste';
    }

    if (isPresets) this.refreshPresets();
  }

  private openAddModal(): void {
    if (this.activeTab === 'tracks') {
      new AddTrackModal(this.app, this.plugin, () => {
        this.refreshGrid();
        this.plugin.refreshSidePanel();
      }).open();
    } else {
      new AddPresetModal(this.app, this.plugin, () => {
        this.refreshPresets();
        this.plugin.refreshSidePanel();
      }).open();
    }
  }

  // --- Mini player ---

  private buildMiniPlayer(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: 'trpg-lib-mini-player' });

    for (const channel of ['ambiance', 'musique'] as Channel[]) {
      if (channel === 'musique') {
        bar.createDiv({ cls: 'trpg-lib-mini-sep' });
      }

      const col = bar.createDiv({ cls: `trpg-lib-mini-channel trpg-lib-mini-${channel}` });

      const thumb = col.createEl('img', { cls: 'trpg-lib-mini-thumb' });
      thumb.style.display = 'none';
      this.miniThumbEls[channel] = thumb;

      const trackName = col.createSpan({ cls: 'trpg-lib-mini-track-name', text: UI.NO_TRACK });
      if (channel === 'ambiance') this.miniAmbianceNameEl = trackName;
      else this.miniMusiqueNameEl = trackName;

      const playBtn = col.createEl('button', { cls: 'trpg-btn', attr: { 'aria-label': UI.PLAY } });
      setIcon(playBtn, 'play');
      this.miniPlayPauseBtns[channel] = playBtn;
      playBtn.addEventListener('click', () => {
        this.plugin.playerService.togglePause(channel);
        this.refreshMiniPlayer();
        this.refreshGrid();
      });

      const stopBtn = col.createEl('button', { cls: 'trpg-btn', attr: { 'aria-label': UI.STOP } });
      setIcon(stopBtn, 'square');
      stopBtn.addEventListener('click', () => {
        this.plugin.playerService.stop(channel);
        this.plugin.updateNowPlaying(channel, UI.NO_TRACK);
      });

      const volIcon = col.createSpan({ cls: 'trpg-vol-icon' });
      setIcon(volIcon, 'volume-1');

      const initVol = channel === 'ambiance'
        ? this.plugin.data.settings.ambianceVolume * 100
        : this.plugin.data.settings.musiqueVolume * 100;

      const volSlider = col.createEl('input', {
        cls: 'trpg-lib-mini-slider',
        attr: { type: 'range', min: '0', max: '100', value: String(Math.round(initVol)) },
      });
      const volVal = col.createSpan({ cls: 'trpg-lib-mini-vol-val', text: String(Math.round(initVol)) });
      this.miniVolSliders[channel] = volSlider;
      this.miniVolValues[channel] = volVal;

      volSlider.addEventListener('input', () => {
        const val = parseInt(volSlider.value);
        volVal.textContent = String(val);
        if (channel === 'ambiance') {
          this.plugin.data.settings.ambianceVolume = val / 100;
          this.plugin.playerService.setVolume('ambiance', val);
        } else {
          this.plugin.data.settings.musiqueVolume = val / 100;
          this.plugin.playerService.setVolume('musique', val);
        }
        this.plugin.savePluginData();
      });
    }

  }

  refreshMiniPlayer(): void {
    for (const channel of ['ambiance', 'musique'] as Channel[]) {
      const btn = this.miniPlayPauseBtns[channel];
      if (btn) {
        const state = this.plugin.playerService.getChannelState(channel);
        btn.empty();
        setIcon(btn, state.isPlaying ? 'pause' : 'play');
      }
    }
  }

  refreshVolumeSliders(): void {
    for (const channel of ['ambiance', 'musique'] as Channel[]) {
      const vol = this.plugin.playerService.getChannelState(channel).volume;
      const slider = this.miniVolSliders[channel];
      const valEl = this.miniVolValues[channel];
      if (slider) slider.value = String(vol);
      if (valEl) valEl.textContent = String(vol);
    }
  }

  setMiniPlayerNowPlaying(channel: Channel, trackName: string): void {
    const nameEl = channel === 'ambiance' ? this.miniAmbianceNameEl : this.miniMusiqueNameEl;
    if (nameEl) nameEl.textContent = trackName;

    const thumb = this.miniThumbEls[channel];
    if (thumb) {
      const videoId = this.plugin.playerService.getChannelState(channel).videoId;
      if (videoId && trackName !== UI.NO_TRACK) {
        thumb.src = `https://img.youtube.com/vi/${videoId}/default.jpg`;
        thumb.style.display = '';
      } else {
        thumb.style.display = 'none';
      }
    }

    this.refreshMiniPlayer();
  }

  // --- Filter chip ---

  private createFilterChip(parent: HTMLElement, label: string, options: string[], onChange: (val: string) => void): void {
    const wrapper = parent.createDiv({ cls: 'trpg-lib-filter-chip' });
    const select = wrapper.createEl('select', { cls: 'trpg-lib-filter-select' });
    select.createEl('option', { text: label, attr: { value: '' } });
    for (const opt of options) {
      select.createEl('option', { text: opt, attr: { value: opt } });
    }
    select.addEventListener('change', () => onChange(select.value));
  }

  // --- Track grid ---

  refreshGrid(): void {
    if (!this.gridEl) return;
    this.gridEl.empty();

    const filters: { channel?: Channel; humeur?: string; lieu?: string; intensite?: string } = {};
    if (this.filterChannel) filters.channel = this.filterChannel;
    if (this.filterHumeur) filters.humeur = this.filterHumeur;
    if (this.filterLieu) filters.lieu = this.filterLieu;
    if (this.filterIntensite) filters.intensite = this.filterIntensite;

    let tracks = this.plugin.trackLibrary.getTracks(Object.keys(filters).length > 0 ? filters : undefined);

    if (this.searchQuery) {
      tracks = tracks.filter((t) => t.name.toLowerCase().includes(this.searchQuery));
    }

    if (this.countEl) {
      this.countEl.textContent = `${tracks.length} ${UI.TRACK_COUNT}`;
    }

    const hasActiveFilters = !!(this.searchQuery || this.filterChannel || this.filterHumeur || this.filterLieu || this.filterIntensite);
    this.resetBtn?.toggleClass('trpg-lib-hidden', !hasActiveFilters);

    if (tracks.length === 0) {
      const empty = this.gridEl.createDiv({ cls: 'trpg-lib-empty' });
      empty.createDiv({ cls: 'trpg-lib-empty-icon' });
      setIcon(empty.querySelector('.trpg-lib-empty-icon')!, 'music');
      empty.createDiv({ text: UI.NO_TRACK, cls: 'trpg-lib-empty-text' });
      return;
    }

    for (const track of tracks) {
      this.createTrackCard(this.gridEl, track);
    }
  }

  // --- Preset grid ---

  refreshPresets(): void {
    if (!this.presetsEl) return;
    this.presetsEl.empty();

    let presets = this.plugin.presetManager.getPresets();

    if (this.presetSearchQuery) {
      presets = presets.filter((p) => p.name.toLowerCase().includes(this.presetSearchQuery));
    }

    if (presets.length === 0) {
      const empty = this.presetsEl.createDiv({ cls: 'trpg-lib-empty' });
      const iconEl = empty.createDiv({ cls: 'trpg-lib-empty-icon' });
      setIcon(iconEl, 'bookmark');
      empty.createDiv({ text: 'Aucun preset', cls: 'trpg-lib-empty-text' });
      return;
    }

    for (const preset of presets) {
      this.createPresetCard(this.presetsEl, preset);
    }
  }

  private createPresetCard(parent: HTMLElement, preset: Preset): void {
    const ambianceTrack = preset.ambianceTrackId
      ? this.plugin.trackLibrary.getTrackById(preset.ambianceTrackId)
      : null;
    const musiqueTrack = preset.musiqueTrackId
      ? this.plugin.trackLibrary.getTrackById(preset.musiqueTrackId)
      : null;

    const card = parent.createDiv({ cls: 'trpg-lib-preset-grid-card' });

    // Cover area with play overlay
    const cover = card.createDiv({ cls: 'trpg-lib-preset-cover' });
    const iconEl = cover.createDiv({ cls: 'trpg-lib-preset-cover-icon' });
    setIcon(iconEl, 'list-music');

    const overlay = cover.createDiv({ cls: 'trpg-lib-play-overlay' });
    const playIcon = overlay.createSpan();
    setIcon(playIcon, 'play');

    // Card body
    const body = card.createDiv({ cls: 'trpg-lib-card-body' });
    body.createDiv({ cls: 'trpg-lib-card-name', text: preset.name, attr: { title: preset.name } });

    const tracksEl = body.createDiv({ cls: 'trpg-lib-preset-tracks' });
    if (ambianceTrack) {
      const row = tracksEl.createDiv({ cls: 'trpg-lib-preset-track-row' });
      row.createSpan({ cls: 'trpg-preset-channel-dot trpg-preset-dot-ambiance' });
      row.createSpan({ cls: 'trpg-lib-preset-track-name', text: ambianceTrack.name });
    }
    if (musiqueTrack) {
      const row = tracksEl.createDiv({ cls: 'trpg-lib-preset-track-row' });
      row.createSpan({ cls: 'trpg-preset-channel-dot trpg-preset-dot-musique' });
      row.createSpan({ cls: 'trpg-lib-preset-track-name', text: musiqueTrack.name });
    }
    if (!ambianceTrack && !musiqueTrack) {
      tracksEl.createSpan({ cls: 'trpg-lib-preset-empty', text: UI.NONE });
    }

    // Click to launch
    card.addEventListener('click', async () => {
      await this.plugin.presetManager.applyPreset(preset);
      if (ambianceTrack) this.plugin.updateNowPlaying('ambiance', ambianceTrack.name);
      if (musiqueTrack) this.plugin.updateNowPlaying('musique', musiqueTrack.name);
    });

    // Right-click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem((item) => {
        item.setTitle('Modifier').setIcon('pencil').onClick(() => {
          new EditPresetModal(this.app, this.plugin, preset, () => {
            this.refreshPresets();
            this.plugin.refreshSidePanel();
          }).open();
        });
      });
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle('Copier le bloc trpg-play')
          .setIcon('code')
          .onClick(() => {
            navigator.clipboard.writeText(`\`\`\`trpg-play\npreset: ${preset.name}\n\`\`\``);
          });
      });
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle(UI.DELETE_BUTTON).setIcon('trash-2').onClick(() => {
          if (confirm(`Supprimer le preset "${preset.name}" ?`)) {
            this.plugin.presetManager.removePreset(preset.id);
            this.refreshPresets();
            this.plugin.refreshSidePanel();
          }
        });
      });
      menu.showAtMouseEvent(e as MouseEvent);
    });
  }

  // --- Track card ---

  private createTrackCard(parent: HTMLElement, track: Track): void {
    const card = parent.createDiv({ cls: 'trpg-lib-card' });

    const channelState = this.plugin.playerService.getChannelState(track.channel);
    const isThisTrack = channelState.videoId === track.youtubeId;
    const isPlaying = isThisTrack && channelState.isPlaying;
    const isPaused = isThisTrack && channelState.isPaused;

    if (isPlaying) card.addClass('trpg-lib-card-playing');
    if (isPaused) card.addClass('trpg-lib-card-paused');

    const thumbWrap = card.createDiv({ cls: 'trpg-lib-thumb-wrap' });
    const thumb = thumbWrap.createEl('img', {
      cls: 'trpg-lib-thumb',
      attr: {
        src: `https://img.youtube.com/vi/${track.youtubeId}/mqdefault.jpg`,
        alt: track.name,
        loading: 'lazy',
      },
    });
    thumb.onerror = () => {
      thumb.style.display = 'none';
      thumbWrap.addClass('trpg-lib-thumb-error');
    };

    const overlay = thumbWrap.createDiv({ cls: 'trpg-lib-play-overlay' });
    const playIcon = overlay.createSpan();
    setIcon(playIcon, isPlaying ? 'pause' : 'play');

    if (isPlaying) {
      const playingIndicator = thumbWrap.createDiv({ cls: 'trpg-lib-now-playing' });
      const bars = playingIndicator.createDiv({ cls: 'trpg-lib-eq-bars' });
      bars.createSpan({ cls: 'trpg-lib-eq-bar' });
      bars.createSpan({ cls: 'trpg-lib-eq-bar' });
      bars.createSpan({ cls: 'trpg-lib-eq-bar' });
    }

    thumbWrap.createDiv({
      cls: `trpg-lib-badge trpg-lib-badge-${track.channel}`,
      text: track.channel === 'ambiance' ? UI.CHANNEL_AMBIANCE : UI.CHANNEL_MUSIQUE,
    });

    const body = card.createDiv({ cls: 'trpg-lib-card-body' });
    const titleRow = body.createDiv({ cls: 'trpg-lib-card-title-row' });
    titleRow.createDiv({ cls: 'trpg-lib-card-name', text: track.name, attr: { title: track.name } });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showTrackMenu(e as MouseEvent, track);
    });

    const allCats = [...track.categories.humeur, ...track.categories.lieu, ...track.categories.intensite];
    if (allCats.length > 0) {
      const tags = body.createDiv({ cls: 'trpg-lib-tags' });
      for (const cat of allCats) {
        tags.createSpan({ cls: 'trpg-lib-tag', text: cat });
      }
    }

    card.addEventListener('click', async () => {
      if (isPlaying || isPaused) {
        this.plugin.playerService.togglePause(track.channel);
      } else {
        await this.plugin.playerService.play(track.channel, track.youtubeId);
        this.plugin.updateNowPlaying(track.channel, track.name);
      }
      this.refreshGrid();
    });
  }

  private showTrackMenu(e: MouseEvent, track: Track): void {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle(UI.EDIT_BUTTON)
        .setIcon('pencil')
        .onClick(() => {
          new EditTrackModal(this.app, this.plugin, track).open();
        });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle('Copier le nom')
        .setIcon('copy')
        .onClick(() => {
          navigator.clipboard.writeText(track.name);
        });
    });
    menu.addItem((item) => {
      item.setTitle('Copier l\'URL YouTube')
        .setIcon('link')
        .onClick(() => {
          navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${track.youtubeId}`);
        });
    });
    menu.addItem((item) => {
      item.setTitle('Copier le bloc trpg-play')
        .setIcon('code')
        .onClick(() => {
          navigator.clipboard.writeText(`\`\`\`trpg-play\ntrack: ${track.name}\n\`\`\``);
        });
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle(UI.DELETE_BUTTON)
        .setIcon('trash-2')
        .onClick(() => {
          if (confirm(`${UI.DELETE_CONFIRM} "${track.name}" ?`)) {
            this.plugin.trackLibrary.removeTrack(track.id);
            this.refreshGrid();
            this.plugin.refreshSidePanel();
          }
        });
    });
    menu.showAtMouseEvent(e);
  }
}

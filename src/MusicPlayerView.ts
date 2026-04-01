import { ItemView, WorkspaceLeaf, setIcon, requestUrl, Menu } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Channel, Track } from './types';
import { VIEW_TYPE, CATEGORIES, UI } from './constants';
import { EditTrackModal } from './EditTrackModal';

export class MusicPlayerView extends ItemView {
  private plugin: TRPGMusicPlugin;
  private filters: { humeur: string; lieu: string; intensite: string } = {
    humeur: '',
    lieu: '',
    intensite: '',
  };
  private trackListEl: HTMLElement | null = null;
  private ambianceTrackNameEl: HTMLElement | null = null;
  private musiqueTrackNameEl: HTMLElement | null = null;
  private presetListEl: HTMLElement | null = null;
  private playPauseBtns: Record<Channel, HTMLElement | null> = { ambiance: null, musique: null };
  private volSliders: Record<Channel, HTMLInputElement | null> = { ambiance: null, musique: null };
  private volValues: Record<Channel, HTMLElement | null> = { ambiance: null, musique: null };

  constructor(leaf: WorkspaceLeaf, plugin: TRPGMusicPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return UI.PANEL_TITLE;
  }

  getIcon(): string {
    return 'music';
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('trpg-music-player');

    this.buildPlayerSection(contentEl);
    this.buildLibrarySection(contentEl);
    this.buildAddTrackSection(contentEl);
    this.buildPresetsSection(contentEl);
    this.buildAddPresetSection(contentEl);

    // YouTube iframe containers (hidden) — only create if not already initialized
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
  }

  async onClose(): Promise<void> {
    this.plugin.playerService.stopPlayback();
  }

  // --- Player Section ---

  private buildPlayerSection(parent: HTMLElement): void {
    const section = this.createSection(parent, UI.SECTION_PLAYER, 'headphones');

    for (const channel of ['ambiance', 'musique'] as Channel[]) {
      const row = section.createDiv({ cls: `trpg-channel-row trpg-channel-${channel}` });
      const label = channel === 'ambiance' ? UI.CHANNEL_AMBIANCE : UI.CHANNEL_MUSIQUE;

      // Top row: label, track name, controls
      const topRow = row.createDiv({ cls: 'trpg-channel-top' });
      topRow.createDiv({ cls: 'trpg-channel-label', text: label });

      const trackName = topRow.createDiv({ cls: 'trpg-track-name', text: UI.NO_TRACK });
      if (channel === 'ambiance') this.ambianceTrackNameEl = trackName;
      else this.musiqueTrackNameEl = trackName;

      const controls = topRow.createDiv({ cls: 'trpg-channel-controls' });

      const playPauseBtn = controls.createEl('button', { cls: 'trpg-btn', attr: { 'aria-label': UI.PLAY } });
      setIcon(playPauseBtn, 'play');
      this.playPauseBtns[channel] = playPauseBtn;
      playPauseBtn.addEventListener('click', () => {
        this.plugin.playerService.togglePause(channel);
        this.updatePlayPauseIcon(channel);
        this.plugin.refreshLibrary();
      });

      const stopBtn = controls.createEl('button', { cls: 'trpg-btn', attr: { 'aria-label': UI.STOP } });
      setIcon(stopBtn, 'square');
      stopBtn.addEventListener('click', () => {
        this.plugin.playerService.stop(channel);
        const nameEl = channel === 'ambiance' ? this.ambianceTrackNameEl : this.musiqueTrackNameEl;
        if (nameEl) nameEl.textContent = UI.NO_TRACK;
        this.updatePlayPauseIcon(channel);
        this.plugin.refreshLibrary();
      });

      // Inline volume row
      const volRow = row.createDiv({ cls: 'trpg-channel-vol' });
      const volIcon = volRow.createSpan({ cls: 'trpg-vol-icon' });
      setIcon(volIcon, 'volume-1');

      const initVol = channel === 'ambiance'
        ? this.plugin.data.settings.ambianceVolume * 100
        : this.plugin.data.settings.musiqueVolume * 100;

      const slider = volRow.createEl('input', {
        cls: 'trpg-volume-slider',
        attr: { type: 'range', min: '0', max: '100', value: String(Math.round(initVol)) },
      });
      const valDisplay = volRow.createSpan({ cls: 'trpg-volume-value', text: String(Math.round(initVol)) });
      this.volSliders[channel] = slider;
      this.volValues[channel] = valDisplay;

      slider.addEventListener('input', () => {
        const val = parseInt(slider.value);
        valDisplay.textContent = String(val);
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

  private updatePlayPauseIcon(channel: Channel): void {
    const btn = this.playPauseBtns[channel];
    if (!btn) return;
    const state = this.plugin.playerService.getChannelState(channel);
    btn.empty();
    setIcon(btn, state.isPlaying ? 'pause' : 'play');
  }

  // --- Library Section ---

  private buildLibrarySection(parent: HTMLElement): void {
    const section = this.createSection(parent, UI.SECTION_LIBRARY, 'library');

    const filtersRow = section.createDiv({ cls: 'trpg-filters' });

    this.createFilterDropdown(filtersRow, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[], (val) => {
      this.filters.humeur = val;
      this.refreshTrackList();
    });
    this.createFilterDropdown(filtersRow, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[], (val) => {
      this.filters.lieu = val;
      this.refreshTrackList();
    });
    this.createFilterDropdown(filtersRow, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[], (val) => {
      this.filters.intensite = val;
      this.refreshTrackList();
    });

    this.trackListEl = section.createDiv({ cls: 'trpg-track-list' });
    this.refreshTrackList();
  }

  private createFilterDropdown(
    parent: HTMLElement,
    label: string,
    options: string[],
    onChange: (val: string) => void
  ): void {
    const wrapper = parent.createDiv({ cls: 'trpg-filter' });
    wrapper.createDiv({ cls: 'trpg-filter-label', text: label });
    const select = wrapper.createEl('select', { cls: 'trpg-filter-select' });
    select.createEl('option', { text: UI.FILTER_ALL, attr: { value: '' } });
    for (const opt of options) {
      select.createEl('option', { text: opt, attr: { value: opt } });
    }
    select.addEventListener('change', () => onChange(select.value));
  }

  refreshTrackList(): void {
    if (!this.trackListEl) return;
    this.trackListEl.empty();

    const filters: { humeur?: string; lieu?: string; intensite?: string } = {};
    if (this.filters.humeur) filters.humeur = this.filters.humeur;
    if (this.filters.lieu) filters.lieu = this.filters.lieu;
    if (this.filters.intensite) filters.intensite = this.filters.intensite;

    const tracks = this.plugin.trackLibrary.getTracks(Object.keys(filters).length > 0 ? filters : undefined);

    if (tracks.length === 0) {
      this.trackListEl.createDiv({ cls: 'trpg-empty', text: UI.NO_TRACK });
      return;
    }

    for (const track of tracks) {
      const item = this.trackListEl.createDiv({ cls: 'trpg-track-item' });

      const channelIndicator = item.createSpan({ cls: `trpg-channel-indicator trpg-indicator-${track.channel}` });
      channelIndicator.textContent = track.channel === 'ambiance' ? 'A' : 'M';

      item.createSpan({ cls: 'trpg-track-item-name', text: track.name });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const menu = new Menu();
        menu.addItem((menuItem) => {
          menuItem.setTitle(UI.EDIT_BUTTON)
            .setIcon('pencil')
            .onClick(() => {
              new EditTrackModal(this.app, this.plugin, track).open();
            });
        });
        menu.addSeparator();
        menu.addItem((menuItem) => {
          menuItem.setTitle('Copier le nom')
            .setIcon('copy')
            .onClick(() => {
              navigator.clipboard.writeText(track.name);
            });
        });
        menu.addItem((menuItem) => {
          menuItem.setTitle('Copier l\'URL YouTube')
            .setIcon('link')
            .onClick(() => {
              navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${track.youtubeId}`);
            });
        });
        menu.addItem((menuItem) => {
          menuItem.setTitle('Copier le bloc trpg-play')
            .setIcon('code')
            .onClick(() => {
              navigator.clipboard.writeText(`\`\`\`trpg-play\ntrack: ${track.name}\n\`\`\``);
            });
        });
        menu.addSeparator();
        menu.addItem((menuItem) => {
          menuItem.setTitle(UI.DELETE_BUTTON)
            .setIcon('trash-2')
            .onClick(() => {
              if (confirm(`${UI.DELETE_CONFIRM} "${track.name}" ?`)) {
                this.plugin.trackLibrary.removeTrack(track.id);
                this.refreshTrackList();
                this.refreshPresetSection();
                this.plugin.refreshLibrary();
              }
            });
        });
        menu.showAtMouseEvent(e as MouseEvent);
      });

      item.addEventListener('click', () => {
        this.playTrack(track);
      });
    }
  }

  private async playTrack(track: Track): Promise<void> {
    await this.plugin.playerService.play(track.channel, track.youtubeId);
    this.setNowPlaying(track.channel, track.name);
    this.plugin.refreshLibrary();
  }

  setNowPlaying(channel: Channel, trackName: string): void {
    const nameEl = channel === 'ambiance' ? this.ambianceTrackNameEl : this.musiqueTrackNameEl;
    if (nameEl) nameEl.textContent = trackName;
    this.updatePlayPauseIcon(channel);
  }

  refreshVolumeSliders(): void {
    for (const channel of ['ambiance', 'musique'] as Channel[]) {
      const vol = this.plugin.playerService.getChannelState(channel).volume;
      const slider = this.volSliders[channel];
      const valEl = this.volValues[channel];
      if (slider) slider.value = String(vol);
      if (valEl) valEl.textContent = String(vol);
    }
  }

  // --- Presets Section ---

  private buildPresetsSection(parent: HTMLElement): void {
    const section = this.createSection(parent, UI.SECTION_PRESETS, 'list');
    this.presetListEl = section.createDiv({ cls: 'trpg-preset-list' });
    this.refreshPresetSection();
  }

  refreshPresetSection(): void {
    if (!this.presetListEl) return;
    this.presetListEl.empty();

    const presets = this.plugin.presetManager.getPresets();

    if (presets.length === 0) {
      this.presetListEl.createDiv({ cls: 'trpg-empty', text: UI.NONE });
      return;
    }

    for (const preset of presets) {
      const row = this.presetListEl.createDiv({ cls: 'trpg-preset-item' });

      const btn = row.createEl('button', { cls: 'trpg-preset-btn', text: preset.name });
      btn.addEventListener('click', async () => {
        await this.plugin.presetManager.applyPreset(preset);
        if (preset.ambianceTrackId) {
          const t = this.plugin.trackLibrary.getTrackById(preset.ambianceTrackId);
          if (t && this.ambianceTrackNameEl) this.ambianceTrackNameEl.textContent = t.name;
        }
        if (preset.musiqueTrackId) {
          const t = this.plugin.trackLibrary.getTrackById(preset.musiqueTrackId);
          if (t && this.musiqueTrackNameEl) this.musiqueTrackNameEl.textContent = t.name;
        }
      });

      const deleteBtn = row.createEl('button', { cls: 'trpg-btn-small trpg-btn-delete', attr: { 'aria-label': UI.DELETE_BUTTON } });
      setIcon(deleteBtn, 'trash-2');
      deleteBtn.addEventListener('click', () => {
        this.plugin.presetManager.removePreset(preset.id);
        this.refreshPresetSection();
      });
    }
  }

  // --- Add Track Section ---

  private buildAddTrackSection(parent: HTMLElement): void {
    const section = this.createSection(parent, UI.SECTION_ADD_TRACK, 'plus-circle');

    const form = section.createDiv({ cls: 'trpg-form' });

    const urlInput = form.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder: UI.YOUTUBE_URL_PLACEHOLDER },
    });

    const nameInput = form.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder: UI.TRACK_NAME_PLACEHOLDER },
    });

    urlInput.addEventListener('change', () => this.fetchYoutubeTitle(urlInput.value.trim(), nameInput));
    urlInput.addEventListener('paste', () => {
      setTimeout(() => this.fetchYoutubeTitle(urlInput.value.trim(), nameInput), 50);
    });

    const channelSelect = form.createEl('select', { cls: 'trpg-input trpg-select' });
    channelSelect.createEl('option', { text: UI.CHANNEL_AMBIANCE, attr: { value: 'ambiance' } });
    channelSelect.createEl('option', { text: UI.CHANNEL_MUSIQUE, attr: { value: 'musique' } });

    const catContainer = form.createDiv({ cls: 'trpg-category-selects' });

    const humeurSelect = this.createMultiCategorySelect(catContainer, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[]);
    const lieuSelect = this.createMultiCategorySelect(catContainer, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[]);
    const intensiteSelect = this.createMultiCategorySelect(catContainer, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[]);

    const errorEl = form.createDiv({ cls: 'trpg-error' });

    const addBtn = form.createEl('button', { cls: 'trpg-btn trpg-btn-primary', text: UI.ADD_BUTTON });
    addBtn.addEventListener('click', () => {
      errorEl.textContent = '';
      const url = urlInput.value.trim();
      const name = nameInput.value.trim();

      if (!url || !name) {
        errorEl.textContent = UI.MISSING_FIELDS;
        return;
      }

      const channel = channelSelect.value as Channel;
      const categories = {
        humeur: this.getSelectedOptions(humeurSelect),
        lieu: this.getSelectedOptions(lieuSelect),
        intensite: this.getSelectedOptions(intensiteSelect),
      };

      const result = this.plugin.trackLibrary.addTrack(name, url, channel, categories);
      if (typeof result === 'string') {
        errorEl.textContent = result;
        return;
      }

      urlInput.value = '';
      nameInput.value = '';
      this.clearMultiSelect(humeurSelect);
      this.clearMultiSelect(lieuSelect);
      this.clearMultiSelect(intensiteSelect);
      this.refreshTrackList();
    });
  }

  private createMultiCategorySelect(parent: HTMLElement, label: string, options: string[]): HTMLSelectElement {
    const wrapper = parent.createDiv({ cls: 'trpg-category-select' });
    wrapper.createDiv({ cls: 'trpg-filter-label', text: label });
    const select = wrapper.createEl('select', { cls: 'trpg-input', attr: { multiple: 'true' } });
    for (const opt of options) {
      select.createEl('option', { text: opt, attr: { value: opt } });
    }
    return select;
  }

  private getSelectedOptions(select: HTMLSelectElement): string[] {
    const result: string[] = [];
    for (const option of Array.from(select.options)) {
      if (option.selected) result.push(option.value);
    }
    return result;
  }

  private clearMultiSelect(select: HTMLSelectElement): void {
    for (const option of Array.from(select.options)) {
      option.selected = false;
    }
  }

  // --- Add Preset Section ---

  private buildAddPresetSection(parent: HTMLElement): void {
    const section = this.createSection(parent, UI.SECTION_ADD_PRESET, 'save');

    const form = section.createDiv({ cls: 'trpg-form' });

    const nameInput = form.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder: UI.PRESET_NAME_PLACEHOLDER },
    });

    const ambianceWrapper = form.createDiv({ cls: 'trpg-preset-field' });
    ambianceWrapper.createDiv({ cls: 'trpg-filter-label', text: UI.CHANNEL_AMBIANCE });
    const ambianceSelect = ambianceWrapper.createEl('select', { cls: 'trpg-input trpg-select' });

    const musiqueWrapper = form.createDiv({ cls: 'trpg-preset-field' });
    musiqueWrapper.createDiv({ cls: 'trpg-filter-label', text: UI.CHANNEL_MUSIQUE });
    const musiqueSelect = musiqueWrapper.createEl('select', { cls: 'trpg-input trpg-select' });

    const populateTrackSelects = () => {
      ambianceSelect.empty();
      musiqueSelect.empty();
      ambianceSelect.createEl('option', { text: UI.NONE, attr: { value: '' } });
      musiqueSelect.createEl('option', { text: UI.NONE, attr: { value: '' } });

      const tracks = this.plugin.trackLibrary.getTracks();
      for (const track of tracks) {
        if (track.channel === 'ambiance') {
          ambianceSelect.createEl('option', { text: track.name, attr: { value: track.id } });
        } else {
          musiqueSelect.createEl('option', { text: track.name, attr: { value: track.id } });
        }
      }
    };
    populateTrackSelects();

    const errorEl = form.createDiv({ cls: 'trpg-error' });

    const saveBtn = form.createEl('button', { cls: 'trpg-btn trpg-btn-primary', text: UI.SAVE_BUTTON });
    saveBtn.addEventListener('click', () => {
      errorEl.textContent = '';
      const name = nameInput.value.trim();
      if (!name) {
        errorEl.textContent = UI.MISSING_FIELDS;
        return;
      }

      this.plugin.presetManager.addPreset(
        name,
        ambianceSelect.value || undefined,
        musiqueSelect.value || undefined
      );

      nameInput.value = '';
      ambianceSelect.value = '';
      musiqueSelect.value = '';
      this.refreshPresetSection();
    });

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        populateTrackSelects();
      })
    );
  }

  // --- YouTube title fetch ---

  private async fetchYoutubeTitle(url: string, nameInput: HTMLInputElement): Promise<void> {
    if (!url || nameInput.value.trim()) return;
    try {
      const resp = await requestUrl({
        url: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      });
      if (resp.status === 200 && resp.json?.title) {
        nameInput.value = resp.json.title;
      }
    } catch {
      // Silently fail
    }
  }

  // --- Helpers ---

  private createSection(parent: HTMLElement, title: string, icon: string): HTMLElement {
    const section = parent.createDiv({ cls: 'trpg-section' });
    const header = section.createDiv({ cls: 'trpg-section-header' });

    const iconEl = header.createSpan({ cls: 'trpg-section-icon' });
    setIcon(iconEl, icon);
    header.createSpan({ cls: 'trpg-section-title', text: title });

    const chevron = header.createSpan({ cls: 'trpg-section-chevron' });
    setIcon(chevron, 'chevron-down');

    const content = section.createDiv({ cls: 'trpg-section-content' });

    header.addEventListener('click', () => {
      section.toggleClass('trpg-collapsed', !section.hasClass('trpg-collapsed'));
    });

    return content;
  }
}

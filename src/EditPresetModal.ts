import { Modal, App } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Preset, Track } from './types';
import { UI } from './constants';
import { parseSearchTerms, filterTracksBySearch } from './utils';

export class EditPresetModal extends Modal {
  private plugin: TRPGMusicPlugin;
  private preset: Preset;
  private onSaved: () => void;

  constructor(app: App, plugin: TRPGMusicPlugin, preset: Preset, onSaved: () => void) {
    super(app);
    this.plugin = plugin;
    this.preset = preset;
    this.onSaved = onSaved;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('trpg-add-modal');
    this.setTitle('Modifier le preset');

    const form = contentEl.createDiv({ cls: 'trpg-form' });

    const nameInput = form.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder: UI.PRESET_NAME_PLACEHOLDER, value: this.preset.name },
    });

    const defaultAmbVol = Math.round((this.preset.ambianceVolume ?? this.plugin.data.settings.ambianceVolume) * 100);
    const defaultMusVol = Math.round((this.preset.musiqueVolume ?? this.plugin.data.settings.musiqueVolume) * 100);

    const ambianceTracks = this.plugin.trackLibrary.getTracks().filter((t) => t.channel === 'ambiance');
    const musiqueTracks = this.plugin.trackLibrary.getTracks().filter((t) => t.channel === 'musique');

    const currentAmbianceTrack = this.preset.ambianceTrackId
      ? this.plugin.trackLibrary.getTrackById(this.preset.ambianceTrackId)
      : null;
    const currentMusiqueTrack = this.preset.musiqueTrackId
      ? this.plugin.trackLibrary.getTrackById(this.preset.musiqueTrackId)
      : null;

    const ambianceCard = form.createDiv({ cls: 'trpg-preset-card' });
    ambianceCard.createDiv({ cls: 'trpg-preset-card-label', text: UI.CHANNEL_AMBIANCE });
    const ambianceInput = this.createAutocompleteInput(
      ambianceCard, ambianceTracks, 'Rechercher une ambiance...',
      currentAmbianceTrack?.id || '', currentAmbianceTrack?.name || ''
    );
    const { slider: ambianceSlider } = this.createVolumeRow(ambianceCard, defaultAmbVol);

    const musiqueCard = form.createDiv({ cls: 'trpg-preset-card' });
    musiqueCard.createDiv({ cls: 'trpg-preset-card-label', text: UI.CHANNEL_MUSIQUE });
    const musiqueInput = this.createAutocompleteInput(
      musiqueCard, musiqueTracks, 'Rechercher une musique...',
      currentMusiqueTrack?.id || '', currentMusiqueTrack?.name || ''
    );
    const { slider: musiqueSlider } = this.createVolumeRow(musiqueCard, defaultMusVol);

    const errorEl = form.createDiv({ cls: 'trpg-error' });

    const saveBtn = form.createEl('button', { cls: 'trpg-btn trpg-btn-primary', text: 'Enregistrer' });
    saveBtn.addEventListener('click', () => {
      errorEl.textContent = '';
      const name = nameInput.value.trim();
      if (!name) {
        errorEl.textContent = UI.MISSING_FIELDS;
        return;
      }

      this.preset.name = name;
      this.preset.ambianceTrackId = ambianceInput.selectedId || undefined;
      this.preset.musiqueTrackId = musiqueInput.selectedId || undefined;
      this.preset.ambianceVolume = parseInt(ambianceSlider.value) / 100;
      this.preset.musiqueVolume = parseInt(musiqueSlider.value) / 100;
      this.plugin.savePluginData();

      this.onSaved();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private createAutocompleteInput(parent: HTMLElement, tracks: Track[], placeholder: string, initialId: string, initialName: string): { selectedId: string } {
    const state = { selectedId: initialId };
    const wrapper = parent.createDiv({ cls: 'trpg-autocomplete' });

    const input = wrapper.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder, value: initialName },
    });

    const dropdown = wrapper.createDiv({ cls: 'trpg-autocomplete-dropdown' });

    const renderOptions = (query: string) => {
      dropdown.empty();
      const filtered = filterTracksBySearch(tracks, parseSearchTerms(query));

      const noneRow = dropdown.createDiv({ cls: 'trpg-autocomplete-option' });
      noneRow.textContent = UI.NONE;
      noneRow.addEventListener('click', () => {
        state.selectedId = '';
        input.value = '';
        wrapper.removeClass('trpg-autocomplete-open');
      });

      for (const track of filtered.slice(0, 20)) {
        const row = dropdown.createDiv({ cls: 'trpg-autocomplete-option' });
        row.textContent = track.name;
        row.addEventListener('click', () => {
          state.selectedId = track.id;
          input.value = track.name;
          wrapper.removeClass('trpg-autocomplete-open');
        });
      }

      if (filtered.length > 20) {
        dropdown.createDiv({ cls: 'trpg-autocomplete-hint', text: `${filtered.length - 20} autres résultats...` });
      }
    };

    input.addEventListener('focus', () => {
      renderOptions(input.value);
      wrapper.addClass('trpg-autocomplete-open');
    });

    input.addEventListener('input', () => {
      state.selectedId = '';
      renderOptions(input.value);
      if (!wrapper.hasClass('trpg-autocomplete-open')) {
        wrapper.addClass('trpg-autocomplete-open');
      }
    });

    const closeHandler = (e: MouseEvent) => {
      if (!wrapper.contains(e.target as Node)) {
        wrapper.removeClass('trpg-autocomplete-open');
      }
    };
    document.addEventListener('click', closeHandler);
    const origClose = this.onClose.bind(this);
    this.onClose = () => {
      document.removeEventListener('click', closeHandler);
      origClose();
    };

    return state;
  }

  private createVolumeRow(parent: HTMLElement, initVal: number): { slider: HTMLInputElement } {
    const row = parent.createDiv({ cls: 'trpg-preset-vol-row' });
    row.createSpan({ cls: 'trpg-preset-vol-label', text: 'Volume' });
    const slider = row.createEl('input', {
      cls: 'trpg-volume-slider',
      attr: { type: 'range', min: '0', max: '100', value: String(initVal) },
    });
    const value = row.createSpan({ cls: 'trpg-volume-value', text: String(initVal) });
    slider.addEventListener('input', () => { value.textContent = slider.value; });
    return { slider };
  }
}

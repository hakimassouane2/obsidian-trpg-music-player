import { Modal, App } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Track } from './types';
import { UI } from './constants';

export class AddPresetModal extends Modal {
  private plugin: TRPGMusicPlugin;
  private onAdded: () => void;

  constructor(app: App, plugin: TRPGMusicPlugin, onAdded: () => void) {
    super(app);
    this.plugin = plugin;
    this.onAdded = onAdded;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('trpg-add-modal');
    this.setTitle(UI.SECTION_ADD_PRESET);

    const form = contentEl.createDiv({ cls: 'trpg-form' });

    const nameInput = form.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder: UI.PRESET_NAME_PLACEHOLDER },
    });

    const defaultVol = Math.round(this.plugin.data.settings.ambianceVolume * 100);

    const ambianceTracks = this.plugin.trackLibrary.getTracks().filter((t) => t.channel === 'ambiance');
    const musiqueTracks = this.plugin.trackLibrary.getTracks().filter((t) => t.channel === 'musique');

    const ambianceCard = form.createDiv({ cls: 'trpg-preset-card' });
    ambianceCard.createDiv({ cls: 'trpg-preset-card-label', text: UI.CHANNEL_AMBIANCE });
    const ambianceInput = this.createAutocompleteInput(ambianceCard, ambianceTracks, 'Rechercher une ambiance...');
    const { slider: ambianceSlider } = this.createVolumeRow(ambianceCard, defaultVol);

    const musiqueCard = form.createDiv({ cls: 'trpg-preset-card' });
    musiqueCard.createDiv({ cls: 'trpg-preset-card-label', text: UI.CHANNEL_MUSIQUE });
    const musiqueInput = this.createAutocompleteInput(musiqueCard, musiqueTracks, 'Rechercher une musique...');
    const { slider: musiqueSlider } = this.createVolumeRow(musiqueCard, Math.round(this.plugin.data.settings.musiqueVolume * 100));

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
        ambianceInput.selectedId || undefined,
        musiqueInput.selectedId || undefined,
        parseInt(ambianceSlider.value) / 100,
        parseInt(musiqueSlider.value) / 100,
      );
      this.onAdded();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private createAutocompleteInput(parent: HTMLElement, tracks: Track[], placeholder: string): { selectedId: string } {
    const state = { selectedId: '' };
    const wrapper = parent.createDiv({ cls: 'trpg-autocomplete' });

    const input = wrapper.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder },
    });

    const dropdown = wrapper.createDiv({ cls: 'trpg-autocomplete-dropdown' });

    const renderOptions = (query: string) => {
      dropdown.empty();
      const q = query.toLowerCase();
      const filtered = q ? tracks.filter((t) => t.name.toLowerCase().includes(q)) : tracks;

      // "Aucune" option
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

  private createVolumeRow(parent: HTMLElement, initVal: number): { slider: HTMLInputElement; value: HTMLElement } {
    const row = parent.createDiv({ cls: 'trpg-preset-vol-row' });
    row.createSpan({ cls: 'trpg-preset-vol-label', text: 'Volume' });
    const slider = row.createEl('input', {
      cls: 'trpg-volume-slider',
      attr: { type: 'range', min: '0', max: '100', value: String(initVal) },
    });
    const value = row.createSpan({ cls: 'trpg-volume-value', text: String(initVal) });
    slider.addEventListener('input', () => { value.textContent = slider.value; });
    return { slider, value };
  }
}

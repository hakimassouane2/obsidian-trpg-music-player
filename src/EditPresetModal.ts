import { Modal, App } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Preset } from './types';
import { UI } from './constants';

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

    const ambianceWrapper = form.createDiv({ cls: 'trpg-preset-field' });
    ambianceWrapper.createDiv({ cls: 'trpg-filter-label', text: UI.CHANNEL_AMBIANCE });
    const ambianceSelect = ambianceWrapper.createEl('select', { cls: 'trpg-input trpg-select' });
    ambianceSelect.createEl('option', { text: UI.NONE, attr: { value: '' } });
    const { slider: ambianceSlider } = this.createVolumeRow(ambianceWrapper, defaultAmbVol);

    const musiqueWrapper = form.createDiv({ cls: 'trpg-preset-field' });
    musiqueWrapper.createDiv({ cls: 'trpg-filter-label', text: UI.CHANNEL_MUSIQUE });
    const musiqueSelect = musiqueWrapper.createEl('select', { cls: 'trpg-input trpg-select' });
    musiqueSelect.createEl('option', { text: UI.NONE, attr: { value: '' } });
    const { slider: musiqueSlider } = this.createVolumeRow(musiqueWrapper, defaultMusVol);

    for (const track of this.plugin.trackLibrary.getTracks()) {
      if (track.channel === 'ambiance') {
        const opt = ambianceSelect.createEl('option', { text: track.name, attr: { value: track.id } });
        if (track.id === this.preset.ambianceTrackId) opt.selected = true;
      } else {
        const opt = musiqueSelect.createEl('option', { text: track.name, attr: { value: track.id } });
        if (track.id === this.preset.musiqueTrackId) opt.selected = true;
      }
    }

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
      this.preset.ambianceTrackId = ambianceSelect.value || undefined;
      this.preset.musiqueTrackId = musiqueSelect.value || undefined;
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

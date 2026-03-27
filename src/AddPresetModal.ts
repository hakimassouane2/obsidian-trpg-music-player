import { Modal, App } from 'obsidian';
import type TRPGMusicPlugin from './main';
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
    contentEl.createEl('h3', { text: UI.SECTION_ADD_PRESET });

    const form = contentEl.createDiv({ cls: 'trpg-form' });

    const nameInput = form.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder: UI.PRESET_NAME_PLACEHOLDER },
    });

    const defaultVol = Math.round(this.plugin.data.settings.ambianceVolume * 100);

    const ambianceWrapper = form.createDiv({ cls: 'trpg-preset-field' });
    ambianceWrapper.createDiv({ cls: 'trpg-filter-label', text: UI.CHANNEL_AMBIANCE });
    const ambianceSelect = ambianceWrapper.createEl('select', { cls: 'trpg-input trpg-select' });
    ambianceSelect.createEl('option', { text: UI.NONE, attr: { value: '' } });
    const { slider: ambianceSlider, value: ambianceVolVal } = this.createVolumeRow(ambianceWrapper, defaultVol);

    const musiqueWrapper = form.createDiv({ cls: 'trpg-preset-field' });
    musiqueWrapper.createDiv({ cls: 'trpg-filter-label', text: UI.CHANNEL_MUSIQUE });
    const musiqueSelect = musiqueWrapper.createEl('select', { cls: 'trpg-input trpg-select' });
    musiqueSelect.createEl('option', { text: UI.NONE, attr: { value: '' } });
    const { slider: musiqueSlider, value: musiqueVolVal } = this.createVolumeRow(musiqueWrapper, Math.round(this.plugin.data.settings.musiqueVolume * 100));

    for (const track of this.plugin.trackLibrary.getTracks()) {
      if (track.channel === 'ambiance') {
        ambianceSelect.createEl('option', { text: track.name, attr: { value: track.id } });
      } else {
        musiqueSelect.createEl('option', { text: track.name, attr: { value: track.id } });
      }
    }

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
        musiqueSelect.value || undefined,
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

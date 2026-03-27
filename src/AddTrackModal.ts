import { Modal, App, requestUrl } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Channel } from './types';
import { CATEGORIES, UI } from './constants';

export class AddTrackModal extends Modal {
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
    contentEl.createEl('h3', { text: UI.SECTION_ADD_TRACK });

    const form = contentEl.createDiv({ cls: 'trpg-form' });

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
    const humeurSelect = this.createMultiSelect(catContainer, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[]);
    const lieuSelect = this.createMultiSelect(catContainer, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[]);
    const intensiteSelect = this.createMultiSelect(catContainer, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[]);

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

      const result = this.plugin.trackLibrary.addTrack(name, url, channelSelect.value as Channel, {
        humeur: this.getSelected(humeurSelect),
        lieu: this.getSelected(lieuSelect),
        intensite: this.getSelected(intensiteSelect),
      });

      if (typeof result === 'string') {
        errorEl.textContent = result;
        return;
      }

      this.onAdded();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private createMultiSelect(parent: HTMLElement, label: string, options: string[]): HTMLSelectElement {
    const wrapper = parent.createDiv({ cls: 'trpg-category-select' });
    wrapper.createDiv({ cls: 'trpg-filter-label', text: label });
    const select = wrapper.createEl('select', { cls: 'trpg-input', attr: { multiple: 'true' } });
    for (const opt of options) {
      select.createEl('option', { text: opt, attr: { value: opt } });
    }
    return select;
  }

  private getSelected(select: HTMLSelectElement): string[] {
    return Array.from(select.options).filter((o) => o.selected).map((o) => o.value);
  }

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
}

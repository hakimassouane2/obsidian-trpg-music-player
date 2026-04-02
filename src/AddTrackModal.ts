import { Modal, App, requestUrl, setIcon } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Channel } from './types';
import { CATEGORIES, UI } from './constants';

export class AddTrackModal extends Modal {
  private plugin: TRPGMusicPlugin;
  private onAdded: () => void;
  private selectedCategories: { humeur: string[]; lieu: string[]; intensite: string[] } = {
    humeur: [],
    lieu: [],
    intensite: [],
  };

  constructor(app: App, plugin: TRPGMusicPlugin, onAdded: () => void) {
    super(app);
    this.plugin = plugin;
    this.onAdded = onAdded;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('trpg-add-modal');
    this.setTitle(UI.SECTION_ADD_TRACK);

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

    const catContainer = form.createDiv({ cls: 'trpg-category-selects' });

    const channelWrapper = catContainer.createDiv({ cls: 'trpg-multiselect' });
    channelWrapper.setAttr('style', 'flex: 1');
    const channelSelect = channelWrapper.createEl('select', { cls: 'trpg-multiselect-trigger', attr: { style: 'width: 100%' } });
    channelSelect.createEl('option', { text: UI.CHANNEL_AMBIANCE, attr: { value: 'ambiance' } });
    channelSelect.createEl('option', { text: UI.CHANNEL_MUSIQUE, attr: { value: 'musique' } });

    this.createMultiSelectDropdown(catContainer, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[], this.selectedCategories.humeur);
    this.createMultiSelectDropdown(catContainer, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[], this.selectedCategories.lieu);
    this.createMultiSelectDropdown(catContainer, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[], this.selectedCategories.intensite);

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
        humeur: [...this.selectedCategories.humeur],
        lieu: [...this.selectedCategories.lieu],
        intensite: [...this.selectedCategories.intensite],
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

  private createMultiSelectDropdown(parent: HTMLElement, label: string, options: string[], selected: string[]): void {
    const wrapper = parent.createDiv({ cls: 'trpg-multiselect' });

    const trigger = wrapper.createEl('button', { cls: 'trpg-multiselect-trigger' });
    const triggerText = trigger.createSpan({ cls: 'trpg-multiselect-text' });
    const chevron = trigger.createSpan({ cls: 'trpg-multiselect-chevron' });
    setIcon(chevron, 'chevron-down');

    const dropdown = wrapper.createDiv({ cls: 'trpg-multiselect-dropdown' });

    const updateTrigger = () => {
      if (selected.length === 0) {
        triggerText.textContent = label;
        trigger.removeClass('trpg-multiselect-active');
      } else {
        triggerText.textContent = `${label} (${selected.length})`;
        trigger.addClass('trpg-multiselect-active');
      }
    };

    for (const opt of options) {
      const row = dropdown.createDiv({ cls: 'trpg-multiselect-option' });
      const checkbox = row.createEl('input', { attr: { type: 'checkbox' } });
      checkbox.checked = selected.includes(opt);
      row.createSpan({ text: opt });

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selected.includes(opt)) {
          selected.splice(selected.indexOf(opt), 1);
          checkbox.checked = false;
        } else {
          selected.push(opt);
          checkbox.checked = true;
        }
        updateTrigger();
      });
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrapper.hasClass('trpg-multiselect-open');
      parent.querySelectorAll('.trpg-multiselect-open')
        .forEach((el) => el.removeClass('trpg-multiselect-open'));
      if (!isOpen) wrapper.addClass('trpg-multiselect-open');
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    const closeHandler = (e: MouseEvent) => {
      if (!wrapper.contains(e.target as Node)) {
        wrapper.removeClass('trpg-multiselect-open');
      }
    };
    document.addEventListener('click', closeHandler);
    // Clean up on modal close
    const origClose = this.onClose.bind(this);
    this.onClose = () => {
      document.removeEventListener('click', closeHandler);
      origClose();
    };

    updateTrigger();
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

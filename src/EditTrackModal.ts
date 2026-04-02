import { App, Modal, setIcon } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Track, Channel } from './types';
import { CATEGORIES, UI } from './constants';

export class EditTrackModal extends Modal {
  private plugin: TRPGMusicPlugin;
  private track: Track;
  private closeHandlers: (() => void)[] = [];

  constructor(app: App, plugin: TRPGMusicPlugin, track: Track) {
    super(app);
    this.plugin = plugin;
    this.track = track;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('trpg-edit-modal');
    this.setTitle(UI.EDIT_BUTTON);

    const form = contentEl.createDiv({ cls: 'trpg-form' });

    // Name input (full width)
    const nameInput = form.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', value: this.track.name },
    });
    nameInput.addEventListener('input', () => {
      this.track.name = nameInput.value;
    });

    // Row: Canal + Humeur + Lieu + Intensité
    const catContainer = form.createDiv({ cls: 'trpg-category-selects' });

    const channelWrapper = catContainer.createDiv({ cls: 'trpg-multiselect' });
    channelWrapper.setAttr('style', 'flex: 1');
    const channelSelect = channelWrapper.createEl('select', { cls: 'trpg-multiselect-trigger', attr: { style: 'width: 100%' } });
    channelSelect.createEl('option', { text: UI.CHANNEL_AMBIANCE, attr: { value: 'ambiance' } });
    channelSelect.createEl('option', { text: UI.CHANNEL_MUSIQUE, attr: { value: 'musique' } });
    channelSelect.value = this.track.channel;
    channelSelect.addEventListener('change', () => {
      this.track.channel = channelSelect.value as Channel;
    });

    this.createMultiSelectDropdown(catContainer, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[], this.track.categories.humeur, (val) => {
      this.track.categories.humeur = val;
    });
    this.createMultiSelectDropdown(catContainer, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[], this.track.categories.lieu, (val) => {
      this.track.categories.lieu = val;
    });
    this.createMultiSelectDropdown(catContainer, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[], this.track.categories.intensite, (val) => {
      this.track.categories.intensite = val;
    });

    // Save button
    const saveBtn = form.createEl('button', { cls: 'trpg-btn trpg-btn-primary', text: UI.SAVE_BUTTON });
    saveBtn.addEventListener('click', () => {
      this.plugin.savePluginData();
      this.plugin.refreshSidePanel();
      this.plugin.refreshLibrary();
      this.close();
    });
  }

  private createMultiSelectDropdown(parent: HTMLElement, label: string, options: string[], selected: string[], onChange: (val: string[]) => void): void {
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
        onChange(selected);
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
    this.closeHandlers.push(() => document.removeEventListener('click', closeHandler));

    updateTrigger();
  }

  onClose(): void {
    for (const handler of this.closeHandlers) handler();
    this.closeHandlers = [];
    this.contentEl.empty();
  }
}

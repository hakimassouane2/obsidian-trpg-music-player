import { Modal, App, requestUrl, setIcon } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Channel } from './types';
import { CATEGORIES, UI } from './constants';
import { extractYoutubeId } from './PlayerService';

interface QueuedTrack {
  url: string;
  youtubeId: string;
  name: string;
  overrides: {
    humeur: string[] | null;
    lieu: string[] | null;
    intensite: string[] | null;
  };
  expanded: boolean;
}

export class BatchAddTrackModal extends Modal {
  private plugin: TRPGMusicPlugin;
  private onAdded: () => void;
  private queue: QueuedTrack[] = [];
  private selectedChannel: Channel = 'musique';
  private sharedCategories = { humeur: [] as string[], lieu: [] as string[], intensite: [] as string[] };
  private queueListEl!: HTMLElement;
  private counterEl!: HTMLElement;
  private addAllBtn!: HTMLButtonElement;
  private errorEl!: HTMLElement;
  private closeHandlers: Array<(e: MouseEvent) => void> = [];

  constructor(app: App, plugin: TRPGMusicPlugin, onAdded: () => void) {
    super(app);
    this.plugin = plugin;
    this.onAdded = onAdded;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('trpg-batch-modal');
    this.setTitle(UI.SECTION_BATCH_ADD);

    const form = contentEl.createDiv({ cls: 'trpg-form' });

    // --- Shared settings section ---
    const catContainer = form.createDiv({ cls: 'trpg-category-selects' });

    const channelWrapper = catContainer.createDiv({ cls: 'trpg-multiselect' });
    channelWrapper.setAttr('style', 'flex: 1');
    const channelSelect = channelWrapper.createEl('select', {
      cls: 'trpg-multiselect-trigger',
      attr: { style: 'width: 100%' },
    });
    channelSelect.createEl('option', { text: UI.CHANNEL_AMBIANCE, attr: { value: 'ambiance' } });
    channelSelect.createEl('option', { text: UI.CHANNEL_MUSIQUE, attr: { value: 'musique' } });
    channelSelect.value = this.selectedChannel;
    channelSelect.addEventListener('change', () => {
      this.selectedChannel = channelSelect.value as Channel;
    });

    this.createMultiSelectDropdown(catContainer, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[], this.sharedCategories.humeur);
    this.createMultiSelectDropdown(catContainer, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[], this.sharedCategories.lieu);
    this.createMultiSelectDropdown(catContainer, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[], this.sharedCategories.intensite);

    // --- URL input row ---
    const urlRow = form.createDiv({ cls: 'trpg-batch-url-row' });
    const urlInput = urlRow.createEl('input', {
      cls: 'trpg-input',
      attr: { type: 'text', placeholder: UI.BATCH_URL_PLACEHOLDER },
    });
    const addUrlBtn = urlRow.createEl('button', { cls: 'trpg-btn trpg-btn-small' });
    setIcon(addUrlBtn, 'plus');

    const addFromInput = () => {
      const url = urlInput.value.trim();
      if (url) {
        this.addToQueue(url);
        urlInput.value = '';
        urlInput.focus();
      }
    };

    addUrlBtn.addEventListener('click', addFromInput);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFromInput();
      }
    });

    // --- Error display ---
    this.errorEl = form.createDiv({ cls: 'trpg-error' });

    // --- Queue list ---
    this.queueListEl = form.createDiv({ cls: 'trpg-batch-queue' });

    // --- Counter ---
    this.counterEl = form.createDiv({ cls: 'trpg-batch-counter' });

    // --- Add all button ---
    this.addAllBtn = form.createEl('button', {
      cls: 'trpg-btn trpg-btn-primary',
      text: `${UI.BATCH_ADD_ALL} (0)`,
    });
    this.addAllBtn.disabled = true;
    this.addAllBtn.addEventListener('click', () => this.addAllTracks());

    this.renderQueue();
  }

  onClose(): void {
    for (const handler of this.closeHandlers) {
      document.removeEventListener('click', handler);
    }
    this.closeHandlers = [];
    this.contentEl.empty();
  }

  private addToQueue(url: string): void {
    this.errorEl.textContent = '';

    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      this.errorEl.textContent = UI.INVALID_URL;
      return;
    }

    if (this.queue.some((q) => q.youtubeId === youtubeId)) {
      this.errorEl.textContent = UI.BATCH_DUPLICATE_URL;
      return;
    }

    const item: QueuedTrack = {
      url,
      youtubeId,
      name: UI.BATCH_FETCHING,
      overrides: { humeur: null, lieu: null, intensite: null },
      expanded: false,
    };

    this.queue.push(item);
    this.renderQueue();

    this.fetchYoutubeTitle(url, item);
  }

  private async fetchYoutubeTitle(url: string, item: QueuedTrack): Promise<void> {
    try {
      const resp = await requestUrl({
        url: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      });
      if (resp.status === 200 && resp.json?.title) {
        item.name = resp.json.title;
      } else {
        item.name = `Video ${item.youtubeId}`;
      }
    } catch {
      item.name = `Video ${item.youtubeId}`;
    }
    this.renderQueue();
  }

  private renderQueue(): void {
    this.queueListEl.empty();

    if (this.queue.length === 0) {
      this.queueListEl.createDiv({
        cls: 'trpg-batch-counter',
        text: UI.BATCH_NO_TRACKS,
      });
    }

    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      const itemContainer = this.queueListEl.createDiv({ cls: 'trpg-batch-item-container' });

      const row = itemContainer.createDiv({ cls: 'trpg-batch-item' });
      row.createDiv({ cls: 'trpg-batch-item-dot' });
      row.createDiv({ cls: 'trpg-batch-item-name', text: item.name });

      const actions = row.createDiv({ cls: 'trpg-batch-item-actions' });

      // Edit button
      const editBtn = actions.createEl('button', { cls: 'trpg-btn-icon' });
      setIcon(editBtn, item.expanded ? 'chevron-up' : 'pencil');
      editBtn.addEventListener('click', () => {
        item.expanded = !item.expanded;
        if (item.expanded && item.overrides.humeur === null) {
          item.overrides.humeur = [...this.sharedCategories.humeur];
          item.overrides.lieu = [...this.sharedCategories.lieu];
          item.overrides.intensite = [...this.sharedCategories.intensite];
        }
        this.renderQueue();
      });

      // Delete button
      const deleteBtn = actions.createEl('button', { cls: 'trpg-btn-icon' });
      setIcon(deleteBtn, 'x');
      deleteBtn.addEventListener('click', () => {
        this.queue.splice(i, 1);
        this.renderQueue();
      });

      // Expanded edit panel
      if (item.expanded) {
        const panel = itemContainer.createDiv({ cls: 'trpg-batch-item-expanded' });

        const nameInput = panel.createEl('input', {
          cls: 'trpg-input',
          attr: { type: 'text', value: item.name },
        });
        nameInput.addEventListener('input', () => {
          item.name = nameInput.value;
          const nameEl = row.querySelector('.trpg-batch-item-name');
          if (nameEl) nameEl.textContent = nameInput.value;
        });

        const overrideCats = panel.createDiv({ cls: 'trpg-category-selects' });
        this.createMultiSelectDropdown(overrideCats, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[], item.overrides.humeur!);
        this.createMultiSelectDropdown(overrideCats, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[], item.overrides.lieu!);
        this.createMultiSelectDropdown(overrideCats, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[], item.overrides.intensite!);
      }
    }

    // Update counter and button
    const count = this.queue.length;
    this.counterEl.textContent = count > 0 ? `${count} ${UI.BATCH_TRACKS_READY}` : '';
    this.addAllBtn.textContent = `${UI.BATCH_ADD_ALL} (${count})`;
    this.addAllBtn.disabled = count === 0;
  }

  private addAllTracks(): void {
    this.errorEl.textContent = '';
    const errors: string[] = [];
    const succeeded: number[] = [];

    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      const categories = {
        humeur: item.overrides.humeur ? [...item.overrides.humeur] : [...this.sharedCategories.humeur],
        lieu: item.overrides.lieu ? [...item.overrides.lieu] : [...this.sharedCategories.lieu],
        intensite: item.overrides.intensite ? [...item.overrides.intensite] : [...this.sharedCategories.intensite],
      };

      const result = this.plugin.trackLibrary.addTrack(item.name, item.url, this.selectedChannel, categories);
      if (typeof result === 'string') {
        errors.push(`${item.name}: ${result}`);
      } else {
        succeeded.push(i);
      }
    }

    // Remove succeeded tracks from queue (reverse order to preserve indices)
    for (let i = succeeded.length - 1; i >= 0; i--) {
      this.queue.splice(succeeded[i], 1);
    }

    if (errors.length > 0) {
      this.errorEl.textContent = errors.join(' | ');
      this.renderQueue();
    }

    this.onAdded();

    if (errors.length === 0) {
      this.close();
    }
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
    this.closeHandlers.push(closeHandler);

    updateTrigger();
  }
}

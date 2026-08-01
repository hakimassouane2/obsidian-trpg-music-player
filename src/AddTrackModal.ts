import { Modal, App, requestUrl, setIcon } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Channel } from './types';
import { CATEGORIES, UI } from './constants';
import { extractYoutubeId } from './PlayerService';
import { canonicalYoutubeUrl } from './utils';

type CheckState = 'idle' | 'invalid' | 'duplicate' | 'pending' | 'ok' | 'error' | 'unknown';

export class AddTrackModal extends Modal {
  private plugin: TRPGMusicPlugin;
  private onAdded: () => void;
  private initial?: { url?: string; name?: string; channel?: Channel };
  private selectedCategories: { humeur: string[]; lieu: string[]; intensite: string[] } = {
    humeur: [],
    lieu: [],
    intensite: [],
  };
  private checkState: CheckState = 'idle';
  private checkedUrl = '';
  /** Incrémenté à chaque nouvelle URL : les vérifications obsolètes sont ignorées. */
  private checkToken = 0;
  /** Vérification en cours, attendue si l'utilisateur valide trop vite. */
  private pendingCheck: Promise<void> | null = null;
  private statusEl: HTMLElement | null = null;
  private forceBtn: HTMLButtonElement | null = null;

  constructor(
    app: App,
    plugin: TRPGMusicPlugin,
    onAdded: () => void,
    initial?: { url?: string; name?: string; channel?: Channel }
  ) {
    super(app);
    this.plugin = plugin;
    this.onAdded = onAdded;
    this.initial = initial;
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

    // Badge de statut : doublon éventuel puis verdict de lisibilité
    this.statusEl = form.createDiv({ cls: 'trpg-check-status trpg-check-hidden' });

    if (this.initial?.url) urlInput.value = this.initial.url;
    if (this.initial?.name) nameInput.value = this.initial.name;

    const onUrlChanged = (): void => {
      const url = urlInput.value.trim();
      this.fetchYoutubeTitle(url, nameInput);
      this.pendingCheck = this.runChecks(url);
    };

    urlInput.addEventListener('change', onUrlChanged);
    urlInput.addEventListener('paste', () => {
      setTimeout(onUrlChanged, 50);
    });

    // Une URL pré-remplie (sauvegarde d'un one-shot) est vérifiée d'emblée
    if (this.initial?.url) this.pendingCheck = this.runChecks(this.initial.url);

    const catContainer = form.createDiv({ cls: 'trpg-category-selects' });

    const channelWrapper = catContainer.createDiv({ cls: 'trpg-multiselect' });
    channelWrapper.setAttr('style', 'flex: 1');
    const channelSelect = channelWrapper.createEl('select', { cls: 'trpg-multiselect-trigger', attr: { style: 'width: 100%' } });
    channelSelect.createEl('option', { text: UI.CHANNEL_AMBIANCE, attr: { value: 'ambiance' } });
    channelSelect.createEl('option', { text: UI.CHANNEL_MUSIQUE, attr: { value: 'musique' } });
    if (this.initial?.channel) channelSelect.value = this.initial.channel;

    this.createMultiSelectDropdown(catContainer, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[], this.selectedCategories.humeur);
    this.createMultiSelectDropdown(catContainer, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[], this.selectedCategories.lieu);
    this.createMultiSelectDropdown(catContainer, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[], this.selectedCategories.intensite);

    const errorEl = form.createDiv({ cls: 'trpg-error' });

    const btnRow = form.createDiv({ cls: 'trpg-add-btn-row' });
    const addBtn = btnRow.createEl('button', { cls: 'trpg-btn trpg-btn-primary', text: UI.ADD_BUTTON });

    // Second bouton, révélé seulement quand la vidéo est déclarée illisible
    this.forceBtn = btnRow.createEl('button', {
      cls: 'trpg-btn trpg-btn-force trpg-check-hidden',
      text: UI.ADD_ANYWAY,
    });

    const submit = async (force: boolean): Promise<void> => {
      errorEl.textContent = '';
      const url = urlInput.value.trim();
      const name = nameInput.value.trim();

      if (!url || !name) {
        errorEl.textContent = UI.MISSING_FIELDS;
        return;
      }

      // Vérification encore en vol : on l'attend plutôt que de laisser passer
      // une piste illisible parce que le clic a été plus rapide.
      if (!force && this.pendingCheck && this.checkedUrl === url) {
        addBtn.disabled = true;
        addBtn.textContent = UI.CHECK_PENDING;
        try {
          await this.pendingCheck;
        } finally {
          addBtn.disabled = false;
          addBtn.textContent = UI.ADD_BUTTON;
        }
        // La modale a pu être fermée entre-temps
        if (!this.statusEl?.isConnected) return;
      }

      // La vérification n'est bloquante que sur un refus explicite de YouTube :
      // un verdict indéterminé (réseau) ne doit pas empêcher l'ajout.
      if (!force && this.checkState === 'error' && this.checkedUrl === url) {
        errorEl.textContent = `${this.statusEl?.dataset.reason ?? UI.VIDEO_UNAVAILABLE} — ${UI.ADD_ANYWAY} ?`;
        this.forceBtn?.removeClass('trpg-check-hidden');
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

      // Ajout forcé d'une vidéo illisible : on garde la trace du diagnostic
      if (force && this.checkState === 'error' && this.statusEl?.dataset.code) {
        this.plugin.trackLibrary.markUnavailable(
          result.youtubeId,
          parseInt(this.statusEl.dataset.code, 10),
          this.statusEl.dataset.reason ?? UI.VIDEO_UNAVAILABLE
        );
      }

      this.onAdded();
      this.close();
    };

    addBtn.addEventListener('click', () => void submit(false));
    this.forceBtn.addEventListener('click', () => void submit(true));
  }

  onClose(): void {
    // Invalide les vérifications encore en vol
    this.checkToken++;
    this.contentEl.empty();
  }

  /**
   * Vérifie l'URL en deux temps : doublon en bibliothèque (immédiat), puis
   * lisibilité réelle dans un lecteur intégré (quelques secondes).
   */
  private async runChecks(url: string): Promise<void> {
    const token = ++this.checkToken;
    this.checkedUrl = url;
    this.forceBtn?.addClass('trpg-check-hidden');

    if (!url) {
      this.setStatus('idle', '');
      return;
    }

    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      this.setStatus('invalid', UI.INVALID_URL);
      return;
    }

    const existing = this.plugin.trackLibrary.findByYoutubeId(youtubeId);
    if (existing) {
      this.setStatus('duplicate', this.plugin.trackLibrary.duplicateMessage(existing));
      return;
    }

    this.setStatus('pending', UI.CHECK_PENDING);

    const result = await this.plugin.playerService.probeEmbeddable(youtubeId);
    if (token !== this.checkToken) return; // URL changée entre-temps
    this.pendingCheck = null;

    if (result.status === 'ok') {
      this.setStatus('ok', UI.CHECK_OK);
    } else if (result.status === 'error') {
      this.setStatus('error', result.reason ?? UI.VIDEO_UNAVAILABLE, result.code);
      this.forceBtn?.removeClass('trpg-check-hidden');
    } else {
      this.setStatus('unknown', UI.CHECK_UNKNOWN);
    }
  }

  private setStatus(state: CheckState, message: string, code?: number): void {
    this.checkState = state;
    const el = this.statusEl;
    if (!el) return;

    el.empty();
    el.className = `trpg-check-status trpg-check-${state}`;
    delete el.dataset.code;
    delete el.dataset.reason;

    if (state === 'idle' || !message) {
      el.addClass('trpg-check-hidden');
      return;
    }

    const icons: Record<CheckState, string> = {
      idle: 'circle',
      invalid: 'x-circle',
      duplicate: 'copy',
      pending: 'loader',
      ok: 'check-circle',
      error: 'alert-triangle',
      unknown: 'help-circle',
    };
    const icon = el.createSpan({ cls: 'trpg-check-icon' });
    setIcon(icon, icons[state]);
    el.createSpan({ text: message });

    el.dataset.reason = message;
    if (code !== undefined) el.dataset.code = String(code);
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
    // URL canonique : une URL de radio ferait remonter le titre de la playlist
    const youtubeId = extractYoutubeId(url);
    const queryUrl = youtubeId ? canonicalYoutubeUrl(youtubeId) : url;
    try {
      const resp = await requestUrl({
        url: `https://www.youtube.com/oembed?url=${encodeURIComponent(queryUrl)}&format=json`,
      });
      if (resp.status === 200 && resp.json?.title) {
        nameInput.value = resp.json.title;
      }
    } catch {
      // Silently fail
    }
  }
}

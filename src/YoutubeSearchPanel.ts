import { Notice, setIcon } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Channel, YoutubeSearchResult } from './types';
import { UI } from './constants';
import { searchYoutube, youtubeThumbnailUrl } from './YoutubeSearch';
import { canonicalYoutubeUrl } from './utils';

/**
 * 'oneshot' : trouver et jouer tout de suite (champ one-shot du lecteur).
 * 'add' : trouver et ranger (modale « Ajouter une piste »), avec pré-écoute.
 */
export type SearchPanelMode = 'oneshot' | 'add';

export interface SearchPanelOptions {
  mode: SearchPanelMode;
  /** Mode oneshot : lance le résultat sur un canal. */
  onPlay?: (result: YoutubeSearchResult, channel: Channel) => void;
  /** Oneshot : ouvre la modale d'ajout pré-remplie. Add : remplit le formulaire. */
  onPick: (result: YoutubeSearchResult) => void;
}

/**
 * Liste de résultats de recherche YouTube attachée à un champ texte. Le champ
 * reste maître de la saisie : il appelle search() sur Entrée et confie ses
 * touches à handleKeydown() tant que la liste est ouverte.
 */
export class YoutubeSearchPanel {
  private plugin: TRPGMusicPlugin;
  private input: HTMLInputElement;
  private opts: SearchPanelOptions;
  private panelEl: HTMLElement;
  private listEl: HTMLElement;
  private statusEl: HTMLElement;
  private sourceEl: HTMLElement;
  private longChip: HTMLButtonElement;
  private results: YoutubeSearchResult[] = [];
  private selected = 0;
  /** Requête dont les résultats sont affichés : une saisie différente relance une recherche. */
  private shownQuery = '';
  /** Incrémenté à chaque recherche : les réponses obsolètes sont ignorées. */
  private searchToken = 0;
  private stopPreview: (() => void) | null = null;
  private previewId: string | null = null;

  constructor(plugin: TRPGMusicPlugin, input: HTMLInputElement, parent: HTMLElement, opts: SearchPanelOptions) {
    this.plugin = plugin;
    this.input = input;
    this.opts = opts;

    this.panelEl = parent.createDiv({ cls: `trpg-ytsearch trpg-ytsearch-${opts.mode} trpg-check-hidden` });

    const header = this.panelEl.createDiv({ cls: 'trpg-ytsearch-header' });
    this.longChip = header.createEl('button', { cls: 'trpg-ytsearch-chip', text: UI.YT_LONG_ONLY });
    this.longChip.addEventListener('click', () => {
      this.longChip.toggleClass('is-active', !this.longChip.hasClass('is-active'));
      // Le filtre change la requête : on relance sur le texte affiché
      if (this.shownQuery) void this.search(this.shownQuery);
      this.input.focus();
    });
    this.longChip.toggleClass('is-active', plugin.lastYoutubeSearch?.longOnly ?? true);

    this.sourceEl = header.createSpan({ cls: 'trpg-ytsearch-source trpg-check-hidden', text: UI.YT_FALLBACK_BADGE });
    this.sourceEl.setAttr('title', UI.YT_FALLBACK_HINT);

    header.createSpan({
      cls: 'trpg-ytsearch-keys',
      text: opts.mode === 'oneshot' ? UI.YT_KEYS_HINT : UI.YT_KEYS_HINT_ADD,
    });

    this.statusEl = this.panelEl.createDiv({ cls: 'trpg-ytsearch-status trpg-check-hidden' });
    this.listEl = this.panelEl.createDiv({ cls: 'trpg-ytsearch-list' });

    // Revenir dans le champ réaffiche la dernière recherche de la session
    input.addEventListener('focus', () => {
      const last = this.plugin.lastYoutubeSearch;
      if (!this.isOpen && last && last.query === this.input.value.trim()) this.showLast();
    });
  }

  get isOpen(): boolean {
    return !this.panelEl.hasClass('trpg-check-hidden');
  }

  async search(query: string): Promise<void> {
    const longOnly = this.longChip.hasClass('is-active');
    // Même requête que la dernière : on la réaffiche sans dépenser de quota
    const last = this.plugin.lastYoutubeSearch;
    if (!this.isOpen && last && last.query === query && last.longOnly === longOnly) {
      this.showLast();
      return;
    }

    const token = ++this.searchToken;
    this.open();
    this.results = [];
    this.listEl.empty();
    this.setStatus(UI.YT_SEARCHING);

    try {
      const response = await searchYoutube(query, {
        apiKey: this.plugin.data.settings.youtubeApiKey,
        longOnly,
      });
      if (token !== this.searchToken) return;
      this.plugin.lastYoutubeSearch = { query, longOnly, response };
      this.render(query, response.results, response.source);
    } catch (e) {
      if (token !== this.searchToken) return;
      this.shownQuery = '';
      this.setStatus(`${UI.YT_SEARCH_FAILED} : ${e instanceof Error ? e.message : UI.CONNECTION_REQUIRED}`, true);
    }
  }

  /**
   * Gère les touches du champ quand la liste est ouverte. Retourne vrai si la
   * touche a été consommée et ne doit pas suivre son comportement habituel.
   */
  handleKeydown(e: KeyboardEvent): boolean {
    if (!this.isOpen) return false;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (this.results.length === 0) return false;
        e.preventDefault();
        this.select(this.selected + (e.key === 'ArrowDown' ? 1 : -1));
        return true;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return true;
      case 'Enter': {
        // Texte modifié depuis l'affichage : Entrée relance une recherche
        if (this.input.value.trim() !== this.shownQuery) return false;
        const result = this.results[this.selected];
        if (!result) return false;
        e.preventDefault();
        if (this.opts.mode === 'oneshot') {
          this.opts.onPlay?.(result, e.shiftKey ? 'ambiance' : 'musique');
        } else {
          this.opts.onPick(result);
        }
        return true;
      }
      default:
        return false;
    }
  }

  close(): void {
    this.closePreview();
    this.panelEl.addClass('trpg-check-hidden');
  }

  /** À appeler quand le conteneur disparaît : coupe une pré-écoute en cours. */
  destroy(): void {
    this.searchToken++;
    this.closePreview();
  }

  private open(): void {
    this.panelEl.removeClass('trpg-check-hidden');
  }

  private showLast(): void {
    const last = this.plugin.lastYoutubeSearch;
    if (!last) return;
    this.longChip.toggleClass('is-active', last.longOnly);
    this.open();
    this.render(last.query, last.response.results, last.response.source);
  }

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.toggleClass('trpg-ytsearch-error', isError);
    this.statusEl.toggleClass('trpg-check-hidden', !message);
  }

  private render(query: string, results: YoutubeSearchResult[], source: 'api' | 'fallback'): void {
    this.closePreview();
    this.shownQuery = query;
    this.results = results;
    this.selected = 0;
    this.sourceEl.toggleClass('trpg-check-hidden', source !== 'fallback');
    this.setStatus(results.length === 0 ? UI.YT_NO_RESULTS : '');

    this.listEl.empty();
    results.forEach((result, index) => this.renderRow(result, index));
    this.select(0);
  }

  private renderRow(result: YoutubeSearchResult, index: number): void {
    const row = this.listEl.createDiv({ cls: 'trpg-ytsearch-row' });
    row.addEventListener('mouseenter', () => this.select(index, false));

    const main = row.createDiv({ cls: 'trpg-ytsearch-main' });
    const thumb = main.createDiv({ cls: 'trpg-ytsearch-thumb' });
    thumb.createEl('img', { attr: { src: youtubeThumbnailUrl(result.youtubeId), alt: '', loading: 'lazy' } });
    if (result.duration) thumb.createSpan({ cls: 'trpg-ytsearch-duration', text: result.duration });

    const text = main.createDiv({ cls: 'trpg-ytsearch-text' });
    const title = text.createDiv({ cls: 'trpg-ytsearch-title', text: result.title });
    title.setAttr('title', result.title);
    const meta = text.createDiv({ cls: 'trpg-ytsearch-meta' });
    meta.createSpan({ text: result.channelName });

    const existing = this.plugin.trackLibrary.findByYoutubeId(result.youtubeId);
    if (existing) {
      const badge = meta.createEl('button', { cls: 'trpg-ytsearch-badge', text: UI.YT_IN_LIBRARY });
      badge.setAttr('aria-label', `${UI.YT_IN_LIBRARY_PLAY} : « ${existing.name} »`);
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.plugin.playLibraryTrack(existing);
      });
    }

    const actions = row.createDiv({ cls: 'trpg-ytsearch-actions' });
    if (this.opts.mode === 'oneshot') {
      this.action(actions, 'play', UI.CHANNEL_AMBIANCE.charAt(0), UI.YT_PLAY_AMBIANCE, 'trpg-ytsearch-ambiance',
        () => this.opts.onPlay?.(result, 'ambiance'));
      this.action(actions, 'play', UI.CHANNEL_MUSIQUE.charAt(0), UI.YT_PLAY_MUSIQUE, 'trpg-ytsearch-musique',
        () => this.opts.onPlay?.(result, 'musique'));
    } else {
      const previewBtn = this.action(actions, 'headphones', '', UI.YT_PREVIEW, 'trpg-ytsearch-preview-btn',
        () => void this.togglePreview(result, row, previewBtn));
    }
    this.action(actions, 'link', '', UI.YT_COPY_LINK, '', () => {
      void navigator.clipboard.writeText(canonicalYoutubeUrl(result.youtubeId));
      new Notice(UI.YT_LINK_COPIED, 1500);
    });
    if (this.opts.mode === 'oneshot') {
      this.action(actions, 'plus', '', UI.YT_ADD_TO_LIBRARY, '', () => this.opts.onPick(result));
    }

    // Un clic sur la ligne : jouer sur Musique (oneshot) ou remplir le formulaire (add)
    main.addEventListener('click', () => {
      if (this.opts.mode === 'oneshot') this.opts.onPlay?.(result, 'musique');
      else this.opts.onPick(result);
    });
  }

  private action(
    parent: HTMLElement,
    icon: string,
    label: string,
    tooltip: string,
    cls: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = parent.createEl('button', { cls: `trpg-ytsearch-action ${cls}`.trim() });
    btn.setAttr('aria-label', tooltip);
    const iconEl = btn.createSpan({ cls: 'trpg-ytsearch-action-icon' });
    setIcon(iconEl, icon);
    if (label) btn.createSpan({ text: label });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  private select(index: number, scroll = true): void {
    const rows = this.listEl.querySelectorAll('.trpg-ytsearch-row');
    if (rows.length === 0) return;
    this.selected = (index + rows.length) % rows.length;
    rows.forEach((row, i) => row.toggleClass('is-selected', i === this.selected));
    if (scroll) rows[this.selected].scrollIntoView({ block: 'nearest' });
  }

  // --- Pré-écoute (mode add) ---

  private async togglePreview(result: YoutubeSearchResult, row: HTMLElement, btn: HTMLButtonElement): Promise<void> {
    const wasThis = this.previewId === result.youtubeId;
    this.closePreview();
    if (wasThis) return;

    // En séance, la pré-écoute sortirait dans les enceintes de la table
    if (this.plugin.playerService.isAnyChannelPlaying()) {
      new Notice(UI.YT_PREVIEW_BLOCKED, 4000);
      return;
    }

    const holder = row.createDiv({ cls: 'trpg-ytsearch-preview' });
    this.previewId = result.youtubeId;
    btn.addClass('is-active');
    btn.setAttr('aria-label', UI.YT_PREVIEW_STOP);
    const reset = (): void => {
      holder.remove();
      btn.removeClass('is-active');
      btn.setAttr('aria-label', UI.YT_PREVIEW);
    };

    try {
      const destroy = await this.plugin.playerService.createPreview(holder, result.youtubeId);
      // Une autre pré-écoute a pu être demandée pendant le chargement
      if (this.previewId !== result.youtubeId) {
        destroy();
        reset();
        return;
      }
      this.stopPreview = () => {
        destroy();
        reset();
      };
    } catch {
      reset();
      this.previewId = null;
      new Notice(UI.CONNECTION_REQUIRED, 3000);
    }
  }

  private closePreview(): void {
    this.stopPreview?.();
    this.stopPreview = null;
    this.previewId = null;
  }
}

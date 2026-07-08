import { setIcon } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Channel, OneShotEntry } from './types';
import { UI } from './constants';
import { AddTrackModal } from './AddTrackModal';

export interface OneShotSectionOptions {
  /** Appelé après une sauvegarde réussie d'un one-shot dans la bibliothèque. */
  onAfterSave: () => void;
}

/**
 * Construit les contrôles "one-shot" (champ URL + boutons Ambiance/Musique +
 * historique de session) dans `parent`. Retourne le conteneur d'historique afin
 * que l'appelant puisse le rafraîchir via renderOneShotHistory().
 */
export function buildOneShotSection(
  plugin: TRPGMusicPlugin,
  parent: HTMLElement,
  opts: OneShotSectionOptions
): HTMLElement {
  const form = parent.createDiv({ cls: 'trpg-form trpg-oneshot-form' });

  const inputRow = form.createDiv({ cls: 'trpg-oneshot-input-row' });

  const urlInput = inputRow.createEl('input', {
    cls: 'trpg-input trpg-oneshot-input',
    attr: { type: 'text', placeholder: UI.ONESHOT_URL_PLACEHOLDER },
  });

  const errorEl = form.createDiv({ cls: 'trpg-error' });

  const launch = async (channel: Channel): Promise<void> => {
    errorEl.textContent = '';
    const url = urlInput.value.trim();
    if (!url) {
      errorEl.textContent = UI.MISSING_FIELDS;
      return;
    }
    const err = await plugin.playOneShot(url, channel);
    if (err) {
      errorEl.textContent = err;
      return;
    }
    urlInput.value = '';
  };

  const makeBtn = (channel: Channel, label: string, cls: string): void => {
    const btn = inputRow.createEl('button', { cls: `trpg-btn trpg-oneshot-btn ${cls}` });
    const icon = btn.createSpan({ cls: 'trpg-oneshot-btn-icon' });
    setIcon(icon, 'play');
    btn.createSpan({ text: label });
    btn.addEventListener('click', () => launch(channel));
  };
  makeBtn('ambiance', UI.CHANNEL_AMBIANCE, 'trpg-oneshot-ambiance');
  makeBtn('musique', UI.CHANNEL_MUSIQUE, 'trpg-oneshot-musique');

  // Entrée clavier → lance sur le canal Musique (cas le plus courant : "faire passer une musique")
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      launch('musique');
    }
  });

  form.createDiv({ cls: 'trpg-oneshot-history-title', text: UI.ONESHOT_HISTORY_TITLE });
  const historyEl = form.createDiv({ cls: 'trpg-oneshot-history' });
  renderOneShotHistory(plugin, historyEl, opts);

  return historyEl;
}

/** (Re)affiche la liste de l'historique one-shot dans `historyEl`. */
export function renderOneShotHistory(
  plugin: TRPGMusicPlugin,
  historyEl: HTMLElement,
  opts: OneShotSectionOptions
): void {
  historyEl.empty();

  if (plugin.oneShotHistory.length === 0) {
    historyEl.createDiv({ cls: 'trpg-empty', text: UI.ONESHOT_EMPTY });
    return;
  }

  for (const entry of plugin.oneShotHistory) {
    const row = historyEl.createDiv({ cls: 'trpg-oneshot-item' });

    const indicator = row.createSpan({ cls: `trpg-channel-indicator trpg-indicator-${entry.channel}` });
    indicator.textContent = entry.channel === 'ambiance' ? 'A' : 'M';

    const nameEl = row.createSpan({ cls: 'trpg-oneshot-item-name', text: entry.name });
    nameEl.setAttr('title', `${entry.name} — ${UI.ONESHOT_REPLAY_HINT}`);
    nameEl.addEventListener('click', () => plugin.replayOneShot(entry));

    const saveBtn = row.createEl('button', {
      cls: 'trpg-btn-small trpg-oneshot-save',
      attr: { 'aria-label': UI.ONESHOT_SAVE },
    });
    setIcon(saveBtn, 'save');
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSaveModal(plugin, entry, opts);
    });

    const removeBtn = row.createEl('button', {
      cls: 'trpg-btn-small trpg-oneshot-remove',
      attr: { 'aria-label': UI.ONESHOT_REMOVE },
    });
    setIcon(removeBtn, 'x');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      plugin.removeOneShot(entry.id);
    });
  }
}

/** Ouvre la modale d'ajout de piste pré-remplie avec les données du one-shot. */
function openSaveModal(plugin: TRPGMusicPlugin, entry: OneShotEntry, opts: OneShotSectionOptions): void {
  new AddTrackModal(
    plugin.app,
    plugin,
    () => {
      plugin.removeOneShot(entry.id);
      opts.onAfterSave();
    },
    {
      url: `https://www.youtube.com/watch?v=${entry.youtubeId}`,
      name: entry.name === UI.ONESHOT_LOADING ? '' : entry.name,
      channel: entry.channel,
    }
  ).open();
}

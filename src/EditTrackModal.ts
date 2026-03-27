import { App, Modal, Setting } from 'obsidian';
import type TRPGMusicPlugin from './main';
import type { Track, Channel } from './types';
import { CATEGORIES, UI } from './constants';

export class EditTrackModal extends Modal {
  private plugin: TRPGMusicPlugin;
  private track: Track;

  constructor(app: App, plugin: TRPGMusicPlugin, track: Track) {
    super(app);
    this.plugin = plugin;
    this.track = track;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('trpg-edit-modal');

    contentEl.createEl('h3', { text: UI.EDIT_BUTTON });

    // Name
    new Setting(contentEl)
      .setName('Nom')
      .addText((text) =>
        text.setValue(this.track.name).onChange((val) => {
          this.track.name = val;
        })
      );

    // Channel
    new Setting(contentEl)
      .setName('Canal')
      .addDropdown((dd) =>
        dd
          .addOption('ambiance', UI.CHANNEL_AMBIANCE)
          .addOption('musique', UI.CHANNEL_MUSIQUE)
          .setValue(this.track.channel)
          .onChange((val) => {
            this.track.channel = val as Channel;
          })
      );

    // Humeur
    this.createMultiSelectSetting(contentEl, UI.FILTER_HUMEUR, CATEGORIES.humeur as unknown as string[], this.track.categories.humeur, (val) => {
      this.track.categories.humeur = val;
    });

    // Lieu
    this.createMultiSelectSetting(contentEl, UI.FILTER_LIEU, CATEGORIES.lieu as unknown as string[], this.track.categories.lieu, (val) => {
      this.track.categories.lieu = val;
    });

    // Intensité
    this.createMultiSelectSetting(contentEl, UI.FILTER_INTENSITE, CATEGORIES.intensite as unknown as string[], this.track.categories.intensite, (val) => {
      this.track.categories.intensite = val;
    });

    // Save button
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(UI.SAVE_BUTTON)
          .setCta()
          .onClick(() => {
            this.plugin.savePluginData();
            this.plugin.refreshSidePanel();
            this.plugin.refreshLibrary();
            this.close();
          })
      );
  }

  private createMultiSelectSetting(
    parent: HTMLElement,
    label: string,
    options: string[],
    selected: string[],
    onChange: (val: string[]) => void
  ): void {
    const setting = new Setting(parent).setName(label);

    const container = setting.controlEl.createDiv({ cls: 'trpg-edit-chips' });

    const refresh = () => {
      container.empty();
      for (const opt of options) {
        const chip = container.createEl('button', {
          cls: `trpg-edit-chip ${selected.includes(opt) ? 'trpg-edit-chip-active' : ''}`,
          text: opt,
        });
        chip.addEventListener('click', (e) => {
          e.preventDefault();
          if (selected.includes(opt)) {
            selected.splice(selected.indexOf(opt), 1);
          } else {
            selected.push(opt);
          }
          onChange(selected);
          refresh();
        });
      }
    };
    refresh();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

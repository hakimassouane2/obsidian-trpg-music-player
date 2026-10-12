import { PluginSettingTab, App, Setting } from 'obsidian';
import type TRPGMusicPlugin from './main';
import { UI } from './constants';
import { testApiKey } from './YoutubeSearch';

export class TRPGMusicSettingsTab extends PluginSettingTab {
  plugin: TRPGMusicPlugin;

  constructor(app: App, plugin: TRPGMusicPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(UI.SETTINGS_DEFAULT_AMBIANCE)
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 1)
          .setValue(this.plugin.data.settings.ambianceVolume * 100)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.data.settings.ambianceVolume = value / 100;
            await this.plugin.savePluginData();
          })
      );

    new Setting(containerEl)
      .setName(UI.SETTINGS_DEFAULT_MUSIQUE)
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 1)
          .setValue(this.plugin.data.settings.musiqueVolume * 100)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.data.settings.musiqueVolume = value / 100;
            await this.plugin.savePluginData();
          })
      );

    // Recherche YouTube intégrée
    const keySetting = new Setting(containerEl)
      .setName(UI.YT_KEY_NAME)
      .setDesc(UI.YT_KEY_DESC)
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('AIza...')
          .setValue(this.plugin.data.settings.youtubeApiKey)
          .onChange(async (value) => {
            this.plugin.data.settings.youtubeApiKey = value.trim();
            // Les résultats en cache viennent peut-être de l'autre source
            this.plugin.lastYoutubeSearch = null;
            await this.plugin.savePluginData();
          });
      });

    const keyResultEl = containerEl.createDiv({ cls: 'trpg-premium-test-result' });
    keySetting.addButton((btn) =>
      btn.setButtonText(UI.YT_KEY_TEST).onClick(async () => {
        btn.setDisabled(true);
        keyResultEl.className = 'trpg-premium-test-result trpg-test-pending';
        keyResultEl.textContent = `${UI.YT_KEY_TEST}…`;
        const result = await testApiKey(this.plugin.data.settings.youtubeApiKey);
        keyResultEl.textContent = result.message;
        keyResultEl.className = result.ok
          ? 'trpg-premium-test-result trpg-test-pass'
          : 'trpg-premium-test-result trpg-test-fail';
        btn.setDisabled(false);
      })
    );

    const guide = containerEl.createEl('details', { cls: 'trpg-ytkey-guide' });
    guide.createEl('summary', { text: UI.YT_KEY_GUIDE_TITLE });
    const steps = guide.createEl('ol');
    const step = (build: (li: HTMLLIElement) => void): void => build(steps.createEl('li'));
    step((li) => {
      li.appendText('Ouvre la ');
      li.createEl('a', { text: 'console Google Cloud', href: 'https://console.cloud.google.com/projectcreate' });
      li.appendText(' et crée un projet (nom libre, par exemple « Obsidian JDR »).');
    });
    step((li) => {
      li.appendText('Active l\'API ');
      li.createEl('a', {
        text: 'YouTube Data API v3',
        href: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
      });
      li.appendText(' pour ce projet (bouton « Activer »).');
    });
    step((li) => {
      li.appendText('Dans ');
      li.createEl('a', { text: 'Identifiants', href: 'https://console.cloud.google.com/apis/credentials' });
      li.appendText(', clique sur « Créer des identifiants » puis « Clé API ».');
    });
    step((li) => li.appendText('Conseillé : modifie la clé et restreins-la à « YouTube Data API v3 ».'));
    step((li) => li.appendText('Colle la clé dans le champ ci-dessus, puis clique sur « Tester la clé ».'));
    guide.createEl('p', {
      cls: 'setting-item-description',
      text: 'Aucune carte bancaire n\'est nécessaire. Le quota gratuit (10 000 unités par jour) permet environ 100 recherches quotidiennes, et il se réinitialise chaque nuit.',
    });

    // Vérification de lisibilité de toute la bibliothèque
    const scanSetting = new Setting(containerEl)
      .setName(UI.SCAN_LIBRARY)
      .setDesc(UI.SCAN_LIBRARY_DESC);

    const scanResultEl = containerEl.createDiv({ cls: 'trpg-premium-test-result' });
    const unavailable = this.plugin.trackLibrary.getUnavailableTracks();
    if (unavailable.length > 0) {
      scanResultEl.textContent = `${unavailable.length} piste(s) marquée(s) illisible(s) : ${unavailable.map((t) => t.name).join(', ')}`;
      scanResultEl.className = 'trpg-premium-test-result trpg-test-fail';
    }

    scanSetting.addButton((btn) =>
      btn.setButtonText('Vérifier').onClick(async () => {
        if (this.plugin.isScanning()) return;

        btn.setDisabled(true);
        scanResultEl.className = 'trpg-premium-test-result trpg-test-pending';
        scanResultEl.textContent = `${UI.SCAN_RUNNING}…`;

        await this.plugin.scanLibrary((done, total) => {
          scanResultEl.textContent = `${UI.SCAN_RUNNING} : ${done}/${total}`;
        });

        btn.setDisabled(false);
        // Redessine la section pour refléter la nouvelle liste
        this.display();
      })
    );

    scanSetting.addButton((btn) =>
      btn.setButtonText(UI.SCAN_CANCEL).onClick(() => {
        this.plugin.cancelScan();
      })
    );

    // YouTube Premium test
    const premiumSetting = new Setting(containerEl)
      .setName('Test YouTube Premium')
      .setDesc('Vérifie si YouTube Premium est actif (pas de publicités)');

    const resultEl = containerEl.createDiv({ cls: 'trpg-premium-test-result' });

    premiumSetting.addButton((btn) =>
      btn.setButtonText('Tester').onClick(async () => {
        resultEl.textContent = 'Test en cours...';
        resultEl.className = 'trpg-premium-test-result trpg-test-pending';
        btn.setDisabled(true);

        // Use a track from the user's library if available
        const tracks = this.plugin.trackLibrary.getTracks();
        const testVideoId = tracks.length > 0 ? tracks[0].youtubeId : undefined;

        const result = await this.plugin.playerService.testPremium(containerEl, testVideoId);

        resultEl.textContent = result.message;
        resultEl.className = result.premium
          ? 'trpg-premium-test-result trpg-test-pass'
          : 'trpg-premium-test-result trpg-test-fail';
        btn.setDisabled(false);
      })
    );
  }
}

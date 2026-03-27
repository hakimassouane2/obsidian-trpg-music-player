import { PluginSettingTab, App, Setting } from 'obsidian';
import type TRPGMusicPlugin from './main';
import { UI } from './constants';

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

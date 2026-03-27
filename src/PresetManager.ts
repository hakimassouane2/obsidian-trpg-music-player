import type { Preset, PluginData } from './types';
import type { PlayerService } from './PlayerService';
import type { TrackLibrary } from './TrackLibrary';
import { generateId } from './utils';

export class PresetManager {
  private data: PluginData;
  private saveData: () => Promise<void>;
  private playerService: PlayerService;
  private trackLibrary: TrackLibrary;

  constructor(
    data: PluginData,
    saveData: () => Promise<void>,
    playerService: PlayerService,
    trackLibrary: TrackLibrary
  ) {
    this.data = data;
    this.saveData = saveData;
    this.playerService = playerService;
    this.trackLibrary = trackLibrary;
  }

  // F2: All volumes stored as 0-1 floats. Clamped on input.
  addPreset(
    name: string,
    ambianceTrackId?: string,
    musiqueTrackId?: string,
    ambianceVolume?: number,
    musiqueVolume?: number
  ): Preset {
    const preset: Preset = {
      id: generateId(),
      name,
      ambianceTrackId,
      musiqueTrackId,
      ambianceVolume: Math.min(1, Math.max(0, ambianceVolume ?? this.data.settings.ambianceVolume)),
      musiqueVolume: Math.min(1, Math.max(0, musiqueVolume ?? this.data.settings.musiqueVolume)),
    };

    this.data.presets.push(preset);
    this.saveData();
    return preset;
  }

  removePreset(id: string): void {
    this.data.presets = this.data.presets.filter((p) => p.id !== id);
    this.saveData();
  }

  getPresets(): Preset[] {
    return this.data.presets;
  }

  getPresetByName(name: string): Preset | undefined {
    return this.data.presets.find((p) => p.name === name);
  }

  // F2: Volumes are 0-1 in presets, multiplied by 100 for PlayerService (0-100 scale)
  async applyPreset(preset: Preset): Promise<void> {
    if (preset.ambianceVolume !== undefined) {
      this.playerService.setVolume('ambiance', Math.round(preset.ambianceVolume * 100));
    }
    if (preset.musiqueVolume !== undefined) {
      this.playerService.setVolume('musique', Math.round(preset.musiqueVolume * 100));
    }

    if (preset.ambianceTrackId) {
      const track = this.trackLibrary.getTrackById(preset.ambianceTrackId);
      if (track) {
        await this.playerService.play('ambiance', track.youtubeId);
      }
    }

    if (preset.musiqueTrackId) {
      const track = this.trackLibrary.getTrackById(preset.musiqueTrackId);
      if (track) {
        await this.playerService.play('musique', track.youtubeId);
      }
    }
  }
}

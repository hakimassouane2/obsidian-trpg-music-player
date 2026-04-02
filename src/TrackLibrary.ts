import type { Track, Channel, PluginData } from './types';
import { extractYoutubeId } from './PlayerService';
import { UI } from './constants';
import { generateId } from './utils';

interface TrackFilters {
  channel?: Channel;
  humeur?: string[];
  lieu?: string[];
  intensite?: string[];
}

export class TrackLibrary {
  private data: PluginData;
  private saveData: () => Promise<void>;

  constructor(data: PluginData, saveData: () => Promise<void>) {
    this.data = data;
    this.saveData = saveData;
  }

  addTrack(
    name: string,
    youtubeUrl: string,
    channel: Channel,
    categories: { humeur: string[]; lieu: string[]; intensite: string[] }
  ): Track | string {
    const youtubeId = extractYoutubeId(youtubeUrl);
    if (!youtubeId) return UI.INVALID_URL;

    const track: Track = {
      id: generateId(),
      name,
      youtubeId,
      channel,
      categories,
    };

    this.data.tracks.push(track);
    this.saveData();
    return track;
  }

  removeTrack(id: string): void {
    this.data.tracks = this.data.tracks.filter((t) => t.id !== id);
    // F10: Clean up stale preset references
    for (const preset of this.data.presets) {
      if (preset.ambianceTrackId === id) preset.ambianceTrackId = undefined;
      if (preset.musiqueTrackId === id) preset.musiqueTrackId = undefined;
    }
    this.saveData();
  }

  getTracks(filters?: TrackFilters): Track[] {
    let tracks = this.data.tracks;

    if (filters) {
      if (filters.channel) {
        tracks = tracks.filter((t) => t.channel === filters.channel);
      }
      if (filters.humeur && filters.humeur.length > 0) {
        tracks = tracks.filter((t) => filters.humeur!.some((h) => t.categories.humeur.includes(h)));
      }
      if (filters.lieu && filters.lieu.length > 0) {
        tracks = tracks.filter((t) => filters.lieu!.some((l) => t.categories.lieu.includes(l)));
      }
      if (filters.intensite && filters.intensite.length > 0) {
        tracks = tracks.filter((t) => filters.intensite!.some((i) => t.categories.intensite.includes(i)));
      }
    }

    return tracks;
  }

  getTrackById(id: string): Track | undefined {
    return this.data.tracks.find((t) => t.id === id);
  }
}

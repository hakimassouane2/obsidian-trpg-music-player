import type { Track, Channel, PluginData } from './types';
import { extractYoutubeId } from './PlayerService';
import { UI } from './constants';
import { generateId } from './utils';

interface TrackFilters {
  channel?: Channel;
  humeur?: string[];
  lieu?: string[];
  intensite?: string[];
  /** Écarte les pistes marquées illisibles (utilisé par les playlists). */
  excludeUnavailable?: boolean;
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

    // Une même vidéo ne peut être ajoutée qu'une fois, quel que soit le canal :
    // seul l'identifiant fait foi, donc une URL de radio ou de playlist est
    // reconnue comme doublon de l'URL simple correspondante.
    const existing = this.findByYoutubeId(youtubeId);
    if (existing) return this.duplicateMessage(existing);

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

  /** Retourne la piste correspondant à cet identifiant vidéo, ou undefined. */
  findByYoutubeId(youtubeId: string): Track | undefined {
    return this.data.tracks.find((t) => t.youtubeId === youtubeId);
  }

  /** Message d'erreur affiché quand une vidéo est déjà en bibliothèque. */
  duplicateMessage(track: Track): string {
    const channelLabel = track.channel === 'ambiance' ? UI.CHANNEL_AMBIANCE : UI.CHANNEL_MUSIQUE;
    return `${UI.DUPLICATE_IN_LIBRARY} : « ${track.name} » (${channelLabel})`;
  }

  /** Marque une piste comme illisible. Sans effet si l'identifiant est inconnu. */
  markUnavailable(youtubeId: string, code: number, reason: string): Track | undefined {
    const track = this.findByYoutubeId(youtubeId);
    if (!track) return undefined;

    // Ne pas réécrire (et resauvegarder) si le diagnostic est identique
    if (track.unavailable?.code === code) return track;

    track.unavailable = { code, reason, checkedAt: new Date().toISOString() };
    this.saveData();
    return track;
  }

  /** Réhabilite une piste : YouTube revient parfois sur ses restrictions. */
  clearUnavailable(id: string): void {
    const track = this.data.tracks.find((t) => t.id === id);
    if (!track?.unavailable) return;

    delete track.unavailable;
    this.saveData();
  }

  /** Pistes actuellement marquées illisibles. */
  getUnavailableTracks(): Track[] {
    return this.data.tracks.filter((t) => t.unavailable);
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
      if (filters.excludeUnavailable) {
        tracks = tracks.filter((t) => !t.unavailable);
      }
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

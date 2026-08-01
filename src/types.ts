export type Channel = 'ambiance' | 'musique';

export interface TrackCategories {
  humeur: string[];
  lieu: string[];
  intensite: string[];
}

/** Marque une piste détectée comme non lisible (embed désactivé, vidéo supprimée…). */
export interface TrackUnavailable {
  /** Code d'erreur du lecteur YouTube (2, 5, 100, 101, 150). */
  code: number;
  /** Message lisible correspondant au code. */
  reason: string;
  /** Date ISO de la détection. */
  checkedAt: string;
}

export interface Track {
  id: string;
  name: string;
  youtubeId: string;
  channel: Channel;
  categories: TrackCategories;
  /** Présent uniquement si la piste a été détectée illisible. Absent = piste saine. */
  unavailable?: TrackUnavailable;
}

/** Piste jouée en "one-shot" (session courante uniquement, non persistée). */
export interface OneShotEntry {
  id: string;
  youtubeId: string;
  channel: Channel;
  name: string;
}

export interface Preset {
  id: string;
  name: string;
  ambianceTrackId?: string;
  musiqueTrackId?: string;
  ambianceVolume?: number;
  musiqueVolume?: number;
}

export interface PluginSettings {
  ambianceVolume: number;
  musiqueVolume: number;
  crossfadeDuration: number;
}

export interface PluginData {
  tracks: Track[];
  presets: Preset[];
  settings: PluginSettings;
}

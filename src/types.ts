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
  /** Clé de l'API YouTube Data v3. Vide = recherche en mode secours. */
  youtubeApiKey: string;
}

export interface PluginData {
  tracks: Track[];
  presets: Preset[];
  settings: PluginSettings;
}

/** Une vidéo trouvée par la recherche YouTube intégrée. */
export interface YoutubeSearchResult {
  youtubeId: string;
  title: string;
  channelName: string;
  /** Durée lisible (« 1:02:03 »), null si inconnue. */
  duration: string | null;
}

export interface YoutubeSearchResponse {
  results: YoutubeSearchResult[];
  /** 'api' : clé API. 'fallback' : lecture de la page youtube.com. */
  source: 'api' | 'fallback';
}

/** Dernière recherche de la session, réaffichée quand on revient dans le champ. */
export interface LastYoutubeSearch {
  query: string;
  longOnly: boolean;
  response: YoutubeSearchResponse;
}

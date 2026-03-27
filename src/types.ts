export type Channel = 'ambiance' | 'musique';

export interface TrackCategories {
  humeur: string[];
  lieu: string[];
  intensite: string[];
}

export interface Track {
  id: string;
  name: string;
  youtubeId: string;
  channel: Channel;
  categories: TrackCategories;
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

import type { PluginSettings, PluginData } from './types';

export const VIEW_TYPE = 'trpg-music-player';
export const VIEW_TYPE_LIBRARY = 'trpg-music-library';

export const CATEGORIES = {
  humeur: ['Tendu', 'Calme', 'Épique', 'Mystérieux', 'Triste', 'Joyeux', 'Combat', 'Narratif'] as const,
  lieu: ['Taverne', 'Donjon', 'Forêt', 'Ville', 'Océan', 'Temple', 'Générique'] as const,
  intensite: ['Faible', 'Moyenne', 'Élevée'] as const,
};

export const DEFAULT_SETTINGS: PluginSettings = {
  ambianceVolume: 0.8,
  musiqueVolume: 0.8,
  crossfadeDuration: 3000,
};

export const DEFAULT_DATA: PluginData = {
  tracks: [],
  presets: [],
  settings: { ...DEFAULT_SETTINGS },
};

export const UI = {
  PLUGIN_NAME: 'Lecteur Musical TRPG',
  PANEL_TITLE: 'Lecteur Musical TRPG',

  // Sections
  SECTION_PLAYER: 'Lecteur',
  SECTION_VOLUME: 'Volume',
  SECTION_LIBRARY: 'Bibliothèque',
  SECTION_PRESETS: 'Presets',
  SECTION_ADD_TRACK: 'Ajouter une piste',
  SECTION_ADD_PRESET: 'Ajouter un preset',

  // Channels
  CHANNEL_AMBIANCE: 'Ambiance',
  CHANNEL_MUSIQUE: 'Musique',

  // Controls
  NO_TRACK: 'Aucune piste',
  PLAY: 'Lecture',
  PAUSE: 'Pause',
  STOP: 'Arrêt',
  ADD_BUTTON: 'Ajouter',
  SAVE_BUTTON: 'Enregistrer',
  DELETE_BUTTON: 'Supprimer',
  DELETE_CONFIRM: 'Supprimer la piste',

  // Filters
  FILTER_ALL: 'Tous',
  FILTER_HUMEUR: 'Humeur',
  FILTER_LIEU: 'Lieu',
  FILTER_INTENSITE: 'Intensité',

  // Form
  YOUTUBE_URL_PLACEHOLDER: 'URL YouTube...',
  TRACK_NAME_PLACEHOLDER: 'Nom de la piste...',
  PRESET_NAME_PLACEHOLDER: 'Nom du preset...',
  SELECT_TRACK: 'Sélectionner une piste',
  NONE: 'Aucune',

  // Errors
  INVALID_URL: 'URL YouTube invalide',
  VIDEO_UNAVAILABLE: 'Vidéo indisponible',
  CONNECTION_REQUIRED: 'Connexion requise',
  PRESET_NOT_FOUND: 'Preset introuvable',
  MISSING_FIELDS: 'Veuillez remplir tous les champs requis',

  // Library
  LIBRARY_TITLE: 'Bibliothèque Musicale',
  SEARCH_PLACEHOLDER: 'Rechercher une piste...',
  ALL_CHANNELS: 'Tous les canaux',
  TRACK_COUNT: 'pistes',
  EDIT_BUTTON: 'Modifier',

  // Settings
  SETTINGS_DEFAULT_AMBIANCE: 'Volume ambiance par défaut',
  SETTINGS_DEFAULT_MUSIQUE: 'Volume musique par défaut',
} as const;

export const LOG_PREFIX = '[TRPG Music]';

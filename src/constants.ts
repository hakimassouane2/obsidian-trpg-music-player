import type { PluginSettings, PluginData } from './types';

export const VIEW_TYPE = 'trpg-music-player';
export const VIEW_TYPE_LIBRARY = 'trpg-music-library';

export const CATEGORIES = {
  humeur: ['Tendu', 'Calme', 'Épique', 'Mystérieux', 'Triste', 'Joyeux', 'Comique', 'Combat', 'Poursuite', 'Narratif', 'Exploration', 'Voyage'] as const,
  lieu: ['Taverne', 'Donjon', 'Forêt', 'Ville', 'Océan', 'Temple', 'Générique'] as const,
  intensite: ['Faible', 'Moyenne', 'Élevée'] as const,
};

/**
 * Synonymes de recherche par tag : taper « city », « town » ou « village » ramène
 * les pistes taguées « Ville ». Purement additif — enrichir librement, les valeurs
 * sont comparées sans accent ni casse.
 */
export const TAG_ALIASES: Record<string, string[]> = {
  // Humeur
  'Tendu': ['tense', 'suspense', 'stress', 'danger', 'menace', 'angoisse'],
  'Calme': ['calm', 'peaceful', 'chill', 'paisible', 'repos', 'ambient', 'serein'],
  'Épique': ['epic', 'boss', 'heroique', 'grandiose', 'final', 'climax'],
  'Mystérieux': ['mystery', 'mysterious', 'creepy', 'horror', 'horreur', 'etrange', 'enquete', 'occulte', 'sombre'],
  'Triste': ['sad', 'melancolie', 'deuil', 'emouvant', 'tragique'],
  'Joyeux': ['happy', 'joy', 'fete', 'festif', 'gai', 'celebration'],
  'Comique': ['funny', 'comic', 'humour', 'rigolo', 'absurde'],
  'Combat': ['fight', 'battle', 'war', 'guerre', 'bataille', 'boss', 'affrontement'],
  'Poursuite': ['chase', 'course', 'fuite', 'run', 'traque'],
  'Narratif': ['narrative', 'story', 'dialogue', 'roleplay', 'scene', 'intrigue'],
  'Exploration': ['explore', 'exploring', 'decouverte', 'crawl', 'fouille'],
  'Voyage': ['travel', 'journey', 'road', 'route', 'chemin', 'overland', 'caravane'],
  // Lieu
  'Taverne': ['tavern', 'inn', 'auberge', 'bar', 'pub'],
  'Donjon': ['dungeon', 'cave', 'caverne', 'crypte', 'crypt', 'ruines', 'souterrain', 'labyrinthe', 'tombeau'],
  'Forêt': ['forest', 'wood', 'woods', 'bois', 'jungle', 'nature', 'sylvestre', 'clairiere'],
  'Ville': ['city', 'town', 'village', 'cite', 'urbain', 'marche', 'market', 'capitale', 'rue'],
  'Océan': ['ocean', 'sea', 'mer', 'bateau', 'ship', 'navire', 'port', 'pirate', 'plage', 'naval'],
  'Temple': ['church', 'eglise', 'cathedrale', 'sanctuaire', 'shrine', 'monastere', 'sacre', 'rituel'],
  'Générique': ['generic', 'neutre', 'passe-partout', 'fond', 'background'],
  // Intensité
  'Faible': ['low', 'soft', 'doux', 'leger'],
  'Moyenne': ['medium', 'moyen', 'mid'],
  'Élevée': ['high', 'fort', 'intense', 'eleve', 'puissant'],
};

export const DEFAULT_SETTINGS: PluginSettings = {
  ambianceVolume: 0.8,
  musiqueVolume: 0.8,
  crossfadeDuration: 3000,
  youtubeApiKey: '',
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
  SEARCH_PLACEHOLDER: 'Rechercher : titre, tag, canal (ex. combat foret)...',
  ALL_CHANNELS: 'Tous les canaux',
  TRACK_COUNT: 'pistes',
  EDIT_BUTTON: 'Modifier',

  // Settings
  SETTINGS_DEFAULT_AMBIANCE: 'Volume ambiance par défaut',
  SETTINGS_DEFAULT_MUSIQUE: 'Volume musique par défaut',

  // Sequential mode
  SEQUENTIAL_MODE: 'Mode séquentiel',
  SEQUENTIAL_ON: 'Mode séquentiel activé',
  SEQUENTIAL_OFF: 'Mode séquentiel désactivé',

  // One-shot (lecture rapide non sauvegardée)
  SECTION_ONESHOT: 'One-shot rapide',
  ONESHOT_URL_PLACEHOLDER: 'URL YouTube, ou recherche + Entrée…',
  ONESHOT_HISTORY_TITLE: 'One-shots de la session',
  ONESHOT_EMPTY: 'Aucun one-shot lancé cette session',
  ONESHOT_LOADING: 'Chargement…',
  ONESHOT_SAVE: 'Sauver dans la bibliothèque',
  ONESHOT_REMOVE: 'Retirer de la liste',
  ONESHOT_REPLAY_HINT: 'Cliquer pour relancer',

  // Recherche YouTube intégrée
  ADD_URL_OR_SEARCH_PLACEHOLDER: 'URL YouTube, ou recherche + Entrée...',
  YT_SEARCHING: 'Recherche sur YouTube…',
  YT_NO_RESULTS: 'Aucun résultat',
  YT_SEARCH_FAILED: 'Recherche YouTube impossible',
  YT_SEARCH_PARSE_ERROR: 'page de résultats YouTube illisible (ajoute une clé API dans les réglages)',
  YT_LONG_ONLY: 'Longues (>20 min)',
  YT_FALLBACK_BADGE: 'mode secours',
  YT_FALLBACK_HINT: 'Recherche sans clé API : moins fiable, et les vidéos non intégrables ne sont pas filtrées. Ajoute une clé dans les réglages du plugin.',
  YT_KEYS_HINT: '↑↓ choisir · Entrée : Musique · Maj+Entrée : Ambiance · Échap : fermer',
  YT_KEYS_HINT_ADD: '↑↓ choisir · Entrée : remplir le formulaire · Échap : fermer',
  YT_PLAY_AMBIANCE: 'Jouer sur Ambiance',
  YT_PLAY_MUSIQUE: 'Jouer sur Musique',
  YT_COPY_LINK: 'Copier le lien',
  YT_LINK_COPIED: 'Lien copié',
  YT_ADD_TO_LIBRARY: 'Ajouter à la bibliothèque',
  YT_IN_LIBRARY: 'En bibliothèque',
  YT_IN_LIBRARY_PLAY: 'Jouer la piste de ta bibliothèque',
  YT_PREVIEW: 'Pré-écouter',
  YT_PREVIEW_STOP: 'Arrêter la pré-écoute',
  YT_PREVIEW_BLOCKED: 'Pré-écoute désactivée : un canal joue déjà (les joueurs l\'entendraient)',
  YT_KEY_NAME: 'Clé API YouTube',
  YT_KEY_DESC: 'Rend la recherche intégrée fiable (environ 100 recherches par jour, gratuit). Sans clé, la recherche passe par le mode secours.',
  YT_KEY_TEST: 'Tester la clé',
  YT_KEY_MISSING: 'Aucune clé renseignée',
  YT_KEY_OK: 'Clé valide',
  YT_KEY_FAIL: 'Clé refusée',
  YT_KEY_GUIDE_TITLE: 'Créer une clé (5 minutes, gratuit)',

  // Batch add
  SECTION_BATCH_ADD: 'Ajout batch de pistes',
  BATCH_URL_PLACEHOLDER: 'Coller une URL YouTube...',
  BATCH_ADD_ALL: 'Ajouter tout',
  BATCH_TRACKS_READY: 'pistes prêtes',
  BATCH_NO_TRACKS: 'Aucune piste dans la file',
  BATCH_DUPLICATE_URL: 'Cette URL est déjà dans la file',
  BATCH_FETCHING: 'Chargement...',

  // Doublons bibliothèque
  DUPLICATE_IN_LIBRARY: 'Déjà dans la bibliothèque',
  ONESHOT_ALREADY_IN_LIBRARY: 'Déjà en bibliothèque',

  // Vérification de lecture (embed)
  CHECK_PENDING: 'Vérification de la lecture…',
  CHECK_OK: 'Vidéo lisible',
  CHECK_UNKNOWN: 'Vérification impossible (réseau ?) — ajout autorisé',
  CHECK_RECHECK: 'Revérifier',
  ADD_ANYWAY: 'Ajouter quand même',
  BATCH_FORCE_TOGGLE: 'Forcer l\'ajout de cette piste',
  BATCH_SKIPPED_UNPLAYABLE: 'piste(s) illisible(s) non ajoutée(s) — clique sur ⚠ pour forcer',
  TRACK_UNAVAILABLE_BADGE: 'Illisible',
  SCAN_LIBRARY: 'Vérifier toute la bibliothèque',
  SCAN_LIBRARY_DESC: 'Teste chaque piste dans un lecteur caché et marque celles qui ne peuvent pas être lues. Long : compte environ 3 secondes par piste.',
  SCAN_RUNNING: 'Vérification en cours',
  SCAN_CANCEL: 'Arrêter la vérification',
  SCAN_DONE: 'Vérification terminée',

  // Erreurs de lecture YouTube
  ERR_INVALID_ID: 'Identifiant de vidéo invalide',
  ERR_HTML5: 'Erreur du lecteur YouTube',
  ERR_NOT_FOUND: 'Vidéo introuvable (supprimée ou privée)',
  ERR_EMBED_DISABLED: 'Lecture externe désactivée par le propriétaire',
  ERR_NO_START: 'La vidéo n\'a pas démarré',
  ERR_UNKNOWN: 'Vidéo indisponible',
  SKIPPING_TO_NEXT: 'passage à la suivante',
  TOO_MANY_FAILURES: 'Trop de pistes illisibles d\'affilée — playlist arrêtée',
} as const;

export const LOG_PREFIX = '[TRPG Music]';

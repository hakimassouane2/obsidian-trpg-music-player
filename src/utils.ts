import { requestUrl } from 'obsidian';
import { UI, TAG_ALIASES } from './constants';
import type { Track } from './types';

// F7: Shared utility — single source for ID generation
export function generateId(): string {
  return crypto.randomUUID();
}

// --- Recherche ---

/**
 * Forme comparable d'un texte : minuscules, sans accent ni ligature.
 * « Forêt » et « foret » se ramènent à la même chaîne, pour qu'une saisie
 * rapide sans accent trouve quand même les tags accentués.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .toLowerCase();
}

/** Découpe une saisie en termes normalisés. Tous doivent matcher (ET). */
export function parseSearchTerms(raw: string): string[] {
  return normalizeSearch(raw)
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/** Vrai si chaque terme apparaît dans le texte. Aucun terme = tout passe. */
export function matchesTerms(text: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = normalizeSearch(text);
  return terms.every((term) => haystack.includes(term));
}

/**
 * Texte indexé d'une piste : titre, canal, tags et synonymes des tags.
 * C'est ce qui permet de retrouver une piste taguée « Ville » en tapant « city ».
 */
export function trackSearchText(track: Track): string {
  const tags = [...track.categories.humeur, ...track.categories.lieu, ...track.categories.intensite];
  const channel = track.channel === 'ambiance' ? UI.CHANNEL_AMBIANCE : UI.CHANNEL_MUSIQUE;

  const parts = [track.name, channel, ...tags];
  for (const tag of tags) {
    const aliases = TAG_ALIASES[tag];
    if (aliases) parts.push(...aliases);
  }

  return normalizeSearch(parts.join(' '));
}

/**
 * Filtre des pistes sur les termes saisis, en remontant les correspondances de
 * titre au-dessus de celles qui ne matchent que par tag. Le tri étant stable,
 * l'ordre d'origine est conservé à pertinence égale.
 */
export function filterTracksBySearch(tracks: Track[], terms: string[]): Track[] {
  if (terms.length === 0) return tracks;

  const matched: { track: Track; score: number }[] = [];
  for (const track of tracks) {
    const haystack = trackSearchText(track);
    if (!terms.every((term) => haystack.includes(term))) continue;

    const name = normalizeSearch(track.name);
    const score = terms.reduce((n, term) => (name.includes(term) ? n + 1 : n), 0);
    matched.push({ track, score });
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.map((m) => m.track);
}

/** URL canonique d'une vidéo, sans paramètres de playlist/radio. */
export function canonicalYoutubeUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

/**
 * Traduit un code d'erreur du lecteur YouTube en message lisible.
 * Code 0 = pseudo-code interne : la vidéo n'a jamais démarré (aucune erreur émise).
 */
export function describeYoutubeError(code: number): string {
  switch (code) {
    case 0:
      return UI.ERR_NO_START;
    case 2:
      return UI.ERR_INVALID_ID;
    case 5:
      return UI.ERR_HTML5;
    case 100:
      return UI.ERR_NOT_FOUND;
    case 101:
    case 150:
      return UI.ERR_EMBED_DISABLED;
    default:
      return UI.ERR_UNKNOWN;
  }
}

/**
 * Indique si un code d'erreur justifie de marquer durablement la piste comme illisible.
 * Les codes transitoires (erreur lecteur HTML5, non-démarrage) sont exclus : ils
 * peuvent venir du réseau et ne doivent pas condamner une piste saine.
 */
export function isPersistentYoutubeError(code: number): boolean {
  return code === 2 || code === 100 || code === 101 || code === 150;
}

/**
 * Récupère le titre d'une vidéo YouTube via l'endpoint oembed.
 * Retourne null en cas d'échec (hors ligne, URL invalide, etc.).
 */
export async function fetchYoutubeTitle(url: string): Promise<string | null> {
  try {
    const resp = await requestUrl({
      url: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    });
    if (resp.status === 200 && resp.json?.title) {
      return resp.json.title as string;
    }
  } catch {
    // Échec silencieux
  }
  return null;
}

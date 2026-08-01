import { requestUrl } from 'obsidian';
import { UI } from './constants';

// F7: Shared utility — single source for ID generation
export function generateId(): string {
  return crypto.randomUUID();
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

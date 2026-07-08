import { requestUrl } from 'obsidian';

// F7: Shared utility — single source for ID generation
export function generateId(): string {
  return crypto.randomUUID();
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

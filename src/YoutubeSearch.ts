import { requestUrl } from 'obsidian';
import type { YoutubeSearchResponse, YoutubeSearchResult } from './types';
import { LOG_PREFIX, UI } from './constants';

/** Nombre de résultats affichés par recherche. */
export const SEARCH_MAX_RESULTS = 8;

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Filtres de la page de résultats youtube.com (paramètre `sp`) :
 * vidéos uniquement, avec ou sans la contrainte « plus de 20 minutes ».
 */
const PAGE_FILTER_VIDEOS = 'EgIQAQ==';
const PAGE_FILTER_VIDEOS_LONG = 'EgQQARgC';

/**
 * Cherche des vidéos YouTube. L'API officielle est utilisée quand une clé est
 * configurée ; sans clé, ou si l'API refuse (quota épuisé, clé invalide,
 * réseau), on bascule sans bruit sur la lecture de la page de résultats.
 */
export async function searchYoutube(
  query: string,
  opts: { apiKey: string; longOnly: boolean }
): Promise<YoutubeSearchResponse> {
  if (opts.apiKey) {
    try {
      const results = await searchWithApi(query, opts.apiKey, opts.longOnly);
      return { results, source: 'api' };
    } catch (e) {
      console.warn(LOG_PREFIX, 'Recherche via l\'API YouTube en échec, bascule sur le mode secours :', e);
    }
  }
  const results = await searchWithPage(query, opts.longOnly);
  return { results, source: 'fallback' };
}

/**
 * Vérifie une clé API par l'appel le moins coûteux (1 unité de quota).
 * Retourne un message lisible dans tous les cas.
 */
export async function testApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey) return { ok: false, message: UI.YT_KEY_MISSING };
  try {
    const params = new URLSearchParams({ part: 'id', id: 'dQw4w9WgXcQ', key: apiKey });
    const resp = await requestUrl({ url: `${API_BASE}/videos?${params}`, throw: false });
    if (resp.status === 200) return { ok: true, message: UI.YT_KEY_OK };
    return { ok: false, message: `${UI.YT_KEY_FAIL} : ${apiErrorReason(resp.json)}` };
  } catch {
    return { ok: false, message: `${UI.YT_KEY_FAIL} : ${UI.CONNECTION_REQUIRED}` };
  }
}

/** URL de la miniature d'une vidéo, déduite de son identifiant. */
export function youtubeThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
}

// --- API officielle ---

async function searchWithApi(query: string, apiKey: string, longOnly: boolean): Promise<YoutubeSearchResult[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(SEARCH_MAX_RESULTS),
    // Écarte d'emblée les vidéos dont la lecture intégrée est désactivée
    videoEmbeddable: 'true',
    key: apiKey,
  });
  if (longOnly) params.set('videoDuration', 'long');

  const resp = await requestUrl({ url: `${API_BASE}/search?${params}`, throw: false });
  if (resp.status !== 200) throw new Error(apiErrorReason(resp.json));

  const items: unknown[] = resp.json?.items ?? [];
  const results: YoutubeSearchResult[] = [];
  for (const item of items as Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }>) {
    const youtubeId = item.id?.videoId;
    if (!youtubeId) continue;
    results.push({
      youtubeId,
      // L'API renvoie des titres échappés en HTML (&amp;, &#39;…)
      title: decodeHtml(item.snippet?.title ?? youtubeId),
      channelName: decodeHtml(item.snippet?.channelTitle ?? ''),
      duration: null,
    });
  }

  // La recherche ne donne pas les durées : un second appel (1 unité) les complète.
  // Son échec ne doit pas faire perdre les résultats.
  try {
    const durations = await fetchDurations(results.map((r) => r.youtubeId), apiKey);
    for (const r of results) r.duration = durations.get(r.youtubeId) ?? null;
  } catch {
    // Durées absentes : affichage sans durée
  }

  return results;
}

async function fetchDurations(ids: string[], apiKey: string): Promise<Map<string, string>> {
  const durations = new Map<string, string>();
  if (ids.length === 0) return durations;

  const params = new URLSearchParams({ part: 'contentDetails', id: ids.join(','), key: apiKey });
  const resp = await requestUrl({ url: `${API_BASE}/videos?${params}`, throw: false });
  if (resp.status !== 200) return durations;

  for (const item of (resp.json?.items ?? []) as Array<{ id?: string; contentDetails?: { duration?: string } }>) {
    const formatted = item.contentDetails?.duration ? formatIsoDuration(item.contentDetails.duration) : null;
    if (item.id && formatted) durations.set(item.id, formatted);
  }
  return durations;
}

function apiErrorReason(json: unknown): string {
  const error = (json as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null)?.error;
  return error?.errors?.[0]?.reason ?? error?.message ?? UI.ERR_UNKNOWN;
}

/** « PT1H2M3S » → « 1:02:03 », « PT4M5S » → « 4:05 ». */
function formatIsoDuration(iso: string): string | null {
  const match = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, d, h, m, s] = match.map((v) => parseInt(v ?? '0', 10));
  const hours = d * 24 + h;
  const ss = String(s).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

function decodeHtml(text: string): string {
  return new DOMParser().parseFromString(text, 'text/html').documentElement.textContent ?? text;
}

// --- Mode secours : page de résultats youtube.com ---

/**
 * Lit la page de résultats et en extrait le JSON `ytInitialData`. Fragile par
 * nature : si YouTube change sa page, cette fonction lève une erreur et
 * l'interface l'affiche, la clé API restant le chemin fiable.
 */
async function searchWithPage(query: string, longOnly: boolean): Promise<YoutubeSearchResult[]> {
  const params = new URLSearchParams({
    search_query: query,
    sp: longOnly ? PAGE_FILTER_VIDEOS_LONG : PAGE_FILTER_VIDEOS,
  });
  const resp = await requestUrl({
    url: `https://www.youtube.com/results?${params}`,
    headers: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      // Évite la page de consentement aux cookies servie en Europe
      Cookie: 'SOCS=CAI; CONSENT=YES+1',
    },
  });

  const match = resp.text.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) throw new Error(UI.YT_SEARCH_PARSE_ERROR);

  const results: YoutubeSearchResult[] = [];
  const seen = new Set<string>();
  collectVideoRenderers(JSON.parse(match[1]), (renderer) => {
    const youtubeId = renderer.videoId;
    if (!youtubeId || seen.has(youtubeId) || results.length >= SEARCH_MAX_RESULTS) return;
    seen.add(youtubeId);
    results.push({
      youtubeId,
      title: renderer.title?.runs?.[0]?.text ?? youtubeId,
      channelName: renderer.ownerText?.runs?.[0]?.text ?? '',
      duration: renderer.lengthText?.simpleText ?? null,
    });
  });
  return results;
}

interface VideoRenderer {
  videoId?: string;
  title?: { runs?: Array<{ text?: string }> };
  ownerText?: { runs?: Array<{ text?: string }> };
  lengthText?: { simpleText?: string };
}

/**
 * Parcourt l'arbre en profondeur plutôt que de suivre un chemin précis : la
 * structure autour des `videoRenderer` change souvent, eux beaucoup moins.
 */
function collectVideoRenderers(node: unknown, visit: (renderer: VideoRenderer) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectVideoRenderers(child, visit);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.videoRenderer) {
    visit(obj.videoRenderer as VideoRenderer);
    return;
  }
  for (const key in obj) collectVideoRenderers(obj[key], visit);
}

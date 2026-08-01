import type { Channel } from './types';
import { LOG_PREFIX, UI } from './constants';
import { SequentialQueue } from './SequentialQueue';
import { describeYoutubeError } from './utils';

// YouTube IFrame API types
declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
  namespace YT {
    enum PlayerState {
      UNSTARTED = -1,
      ENDED = 0,
      PLAYING = 1,
      PAUSED = 2,
      BUFFERING = 3,
      CUED = 5,
    }
    class Player {
      constructor(elementId: string | HTMLElement, options: PlayerOptions);
      loadVideoById(videoId: string): void;
      cueVideoById(videoId: string): void;
      mute(): void;
      unMute(): void;
      playVideo(): void;
      pauseVideo(): void;
      stopVideo(): void;
      setVolume(volume: number): void;
      getVolume(): number;
      getPlayerState(): PlayerState;
      getVideoData(): { video_id: string; title: string; author: string };
      getCurrentTime(): number;
      getDuration(): number;
      destroy(): void;
    }
    interface PlayerOptions {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (event: { target: Player }) => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  }
}

interface ChannelState {
  player: YT.Player | null;
  currentVideoId: string | null;
  volume: number;
  containerId: string;
  playing: boolean;
  paused: boolean;
  /** Timer de surveillance du démarrage effectif de la lecture. */
  startWatchdog: number | null;
}

/** Résultat d'un test de lisibilité d'une vidéo dans un lecteur intégré. */
export interface ProbeResult {
  /** 'ok' : la vidéo démarre. 'error' : refus explicite de YouTube. 'unknown' : verdict impossible. */
  status: 'ok' | 'error' | 'unknown';
  /** Code d'erreur YouTube, présent si status === 'error'. */
  code?: number;
  /** Message lisible, présent si status === 'error'. */
  reason?: string;
}

const API_LOAD_TIMEOUT = 15000;
/** Délai au-delà duquel une lecture qui n'a jamais démarré est considérée en échec. */
const PLAYBACK_START_TIMEOUT = 10000;
/** Délai maximal d'un test de lisibilité. */
const PROBE_TIMEOUT = 12000;
/** Nombre de tests de lisibilité menés en parallèle. */
const MAX_CONCURRENT_PROBES = 3;
/** Nombre d'échecs consécutifs en playlist avant abandon (évite la boucle infinie). */
const MAX_CONSECUTIVE_FAILURES = 5;

export class PlayerService {
  private channels: Record<Channel, ChannelState> = {
    ambiance: { player: null, currentVideoId: null, volume: 80, containerId: '', playing: false, paused: false, startWatchdog: null },
    musique: { player: null, currentVideoId: null, volume: 80, containerId: '', playing: false, paused: false, startWatchdog: null },
  };
  private readonly masterVolume = 100;
  private apiLoaded = false;
  private apiLoading: Promise<void> | null = null;
  private onErrorCallback: ((channel: Channel, message: string) => void) | null = null;
  private onPlaybackFailureCallback: ((channel: Channel, videoId: string, code: number, reason: string, skipped: boolean) => void) | null = null;
  private scriptTag: HTMLScriptElement | null = null;
  private _sequentialQueue = new SequentialQueue();
  private isAdvancing = false;
  private consecutiveFailures = 0;
  private probeContainer: HTMLElement | null = null;
  private activeProbes = 0;
  private probeWaiters: Array<() => void> = [];
  onTrackAdvance: ((trackName: string) => void) | null = null;

  get sequentialQueue(): SequentialQueue {
    return this._sequentialQueue;
  }

  onError(callback: (channel: Channel, message: string) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Notifie qu'une lecture a échoué. `skipped` indique si la playlist a
   * automatiquement enchaîné sur la piste suivante.
   */
  onPlaybackFailure(
    callback: (channel: Channel, videoId: string, code: number, reason: string, skipped: boolean) => void
  ): void {
    this.onPlaybackFailureCallback = callback;
  }

  // F3: Added timeout + reject on script load error
  async loadYouTubeAPI(): Promise<void> {
    if (this.apiLoaded) return;
    if (this.apiLoading) return this.apiLoading;

    this.apiLoading = new Promise<void>((resolve, reject) => {
      if (window.YT && window.YT.Player) {
        this.apiLoaded = true;
        resolve();
        return;
      }

      const timeout = window.setTimeout(() => {
        reject(new Error('YouTube API load timeout'));
      }, API_LOAD_TIMEOUT);

      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error('Failed to load YouTube API script'));
        };
        document.head.appendChild(tag);
        this.scriptTag = tag; // F15: Store reference for cleanup
      }

      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        window.clearTimeout(timeout);
        if (previousCallback) previousCallback();
        this.apiLoaded = true;
        resolve();
      };
    });

    return this.apiLoading;
  }

  async createPlayer(channel: Channel, container: HTMLElement): Promise<void> {
    try {
      await this.loadYouTubeAPI();
    } catch {
      console.error(LOG_PREFIX, 'Failed to load YouTube API');
      if (this.onErrorCallback) {
        this.onErrorCallback(channel, UI.CONNECTION_REQUIRED);
      }
      return;
    }

    const containerId = `trpg-yt-${channel}-${Date.now()}`;
    const playerDiv = container.createDiv({ attr: { id: containerId } });
    this.channels[channel].containerId = containerId;

    return new Promise<void>((resolve) => {
      this.channels[channel].player = new YT.Player(playerDiv, {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          loop: 1,
        },
        events: {
          onReady: () => {
            resolve();
          },
          onStateChange: (event) => {
            const state = this.channels[channel];

            // La lecture est effectivement partie : plus besoin de surveiller le démarrage
            if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING) {
              this.clearStartWatchdog(channel);
              if (event.data === YT.PlayerState.PLAYING) this.consecutiveFailures = 0;
            }

            if (event.data === YT.PlayerState.ENDED) {
              if (!state.currentVideoId || !state.player) return;

              // Guard against reentrant ENDED events (YouTube can fire multiple)
              if (this.isAdvancing) return;

              // Sequential mode: advance to next track in queue (musique only)
              if (channel === 'musique' && this._sequentialQueue.isActive()) {
                if (this.advanceQueue()) return;
              }

              // Default: auto-loop
              this.startPlayback(channel, state.currentVideoId);
            }
          },
          onError: (event) => {
            console.error(LOG_PREFIX, `Player error on ${channel}:`, event.data);
            this.handlePlaybackFailure(channel, event.data);
          },
        },
      });
    });
  }

  async play(channel: Channel, youtubeId: string): Promise<void> {
    const state = this.channels[channel];

    if (!this.apiLoaded) {
      if (this.onErrorCallback) {
        this.onErrorCallback(channel, UI.CONNECTION_REQUIRED);
      }
      return;
    }

    if (!state.player) {
      console.error(LOG_PREFIX, `No player initialized for channel ${channel}`);
      return;
    }

    // Stop current track instantly if switching
    if (state.currentVideoId && state.currentVideoId !== youtubeId) {
      state.player.stopVideo();
    }
    this.startPlayback(channel, youtubeId);
  }

  stop(channel: Channel): void {
    const state = this.channels[channel];
    if (!state.player || !state.currentVideoId) return;

    this.clearStartWatchdog(channel);
    state.player.stopVideo();
    state.currentVideoId = null;
    state.playing = false;
    state.paused = false;
  }

  togglePause(channel: Channel): void {
    const state = this.channels[channel];
    if (!state.player) return;

    if (state.paused) {
      state.player.playVideo();
      state.paused = false;
      state.playing = true;
    } else if (state.playing) {
      this.clearStartWatchdog(channel);
      state.player.pauseVideo();
      state.paused = true;
      state.playing = false;
    }
  }

  /**
   * Charge et lance une vidéo sur un canal, puis arme la surveillance de démarrage.
   * Point de passage unique de toute lecture : garantit qu'un échec silencieux
   * (vidéo qui ne démarre jamais, sans erreur émise) finit par être détecté.
   */
  private startPlayback(channel: Channel, youtubeId: string): void {
    const state = this.channels[channel];
    if (!state.player) return;

    state.player.loadVideoById(youtubeId);
    state.player.setVolume(this.getEffectiveVolume(channel));
    state.currentVideoId = youtubeId;
    state.playing = true;
    state.paused = false;
    this.armStartWatchdog(channel, youtubeId);
  }

  private armStartWatchdog(channel: Channel, youtubeId: string): void {
    this.clearStartWatchdog(channel);
    this.channels[channel].startWatchdog = window.setTimeout(() => {
      const state = this.channels[channel];
      state.startWatchdog = null;
      // La piste a changé ou la lecture a été arrêtée entre-temps : rien à signaler
      if (state.currentVideoId !== youtubeId || !state.playing) return;
      console.error(LOG_PREFIX, `Playback never started on ${channel} for ${youtubeId}`);
      this.handlePlaybackFailure(channel, 0);
    }, PLAYBACK_START_TIMEOUT);
  }

  private clearStartWatchdog(channel: Channel): void {
    const state = this.channels[channel];
    if (state.startWatchdog !== null) {
      window.clearTimeout(state.startWatchdog);
      state.startWatchdog = null;
    }
  }

  /**
   * Avance d'une piste dans la playlist et la lance. Retourne false si la file
   * est vide (la playlist est alors désactivée pour garder l'UI cohérente).
   */
  private advanceQueue(): boolean {
    const state = this.channels.musique;
    if (!state.player) return false;

    this.isAdvancing = true;
    try {
      const nextTrack = this._sequentialQueue.next();
      if (nextTrack) {
        this.startPlayback('musique', nextTrack.youtubeId);
        if (this.onTrackAdvance) this.onTrackAdvance(nextTrack.name);
        return true;
      }
      this._sequentialQueue.setActive(false);
      return false;
    } finally {
      this.isAdvancing = false;
    }
  }

  /**
   * Traite un échec de lecture : enchaîne automatiquement sur la piste suivante
   * si une playlist tourne, puis remonte l'information (piste concernée + cause)
   * pour affichage et marquage éventuel.
   */
  private handlePlaybackFailure(channel: Channel, code: number): void {
    const state = this.channels[channel];
    const videoId = state.currentVideoId ?? '';
    const reason = describeYoutubeError(code);
    this.clearStartWatchdog(channel);

    const canSkip = channel === 'musique' && this._sequentialQueue.isActive() && !this.isAdvancing;
    let skipped = false;

    if (canSkip) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this._sequentialQueue.setActive(false);
        state.playing = false;
        this.consecutiveFailures = 0;
        this.notifyFailure(channel, videoId, code, reason, false);
        if (this.onErrorCallback) this.onErrorCallback(channel, UI.TOO_MANY_FAILURES);
        return;
      }
      skipped = this.advanceQueue();
    } else {
      state.playing = false;
    }

    this.notifyFailure(channel, videoId, code, reason, skipped);
  }

  private notifyFailure(channel: Channel, videoId: string, code: number, reason: string, skipped: boolean): void {
    if (this.onPlaybackFailureCallback) {
      this.onPlaybackFailureCallback(channel, videoId, code, reason, skipped);
    } else if (this.onErrorCallback) {
      this.onErrorCallback(channel, reason);
    }
  }

  /**
   * Teste si une vidéo est réellement lisible dans un lecteur intégré : elle est
   * chargée puis lancée en sourdine dans un lecteur jetable et invisible. C'est le
   * seul verdict fiable — l'endpoint oembed répond 200 même pour les vidéos dont
   * le propriétaire a désactivé la lecture externe.
   */
  async probeEmbeddable(youtubeId: string): Promise<ProbeResult> {
    try {
      await this.loadYouTubeAPI();
    } catch {
      return { status: 'unknown' };
    }

    await this.acquireProbeSlot();
    try {
      return await this.runProbe(youtubeId);
    } finally {
      this.releaseProbeSlot();
    }
  }

  private acquireProbeSlot(): Promise<void> {
    if (this.activeProbes < MAX_CONCURRENT_PROBES) {
      this.activeProbes++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.probeWaiters.push(() => {
        this.activeProbes++;
        resolve();
      });
    });
  }

  private releaseProbeSlot(): void {
    this.activeProbes--;
    const next = this.probeWaiters.shift();
    if (next) next();
  }

  private runProbe(youtubeId: string): Promise<ProbeResult> {
    if (!this.probeContainer) {
      this.probeContainer = document.body.createDiv({ cls: 'trpg-youtube-probes' });
      this.probeContainer.style.cssText =
        'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
    }
    const host = this.probeContainer.createDiv();

    return new Promise<ProbeResult>((resolve) => {
      let settled = false;
      let player: YT.Player | null = null;

      const finish = (result: ProbeResult): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        try {
          player?.destroy();
        } catch {
          // Le lecteur peut déjà être détruit
        }
        host.remove();
        resolve(result);
      };

      const timeout = window.setTimeout(() => finish({ status: 'unknown' }), PROBE_TIMEOUT);

      try {
        player = new YT.Player(host, {
          height: '1',
          width: '1',
          videoId: youtubeId,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, mute: 1 },
          events: {
            onReady: (event) => {
              // Muet puis lecture réelle : c'est le démarrage effectif qui fait foi,
              // le simple chargement des métadonnées ne suffit pas à conclure.
              try {
                event.target.mute();
                event.target.setVolume(0);
                event.target.playVideo();
              } catch {
                finish({ status: 'unknown' });
              }
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING) {
                finish({ status: 'ok' });
              }
            },
            onError: (event) => {
              finish({
                status: 'error',
                code: event.data,
                reason: describeYoutubeError(event.data),
              });
            },
          },
        });
      } catch {
        finish({ status: 'unknown' });
      }
    });
  }

  setVolume(channel: Channel, volume: number): void {
    this.channels[channel].volume = Math.round(volume);
    const state = this.channels[channel];
    if (state.player) {
      state.player.setVolume(this.getEffectiveVolume(channel));
    }
  }


  /**
   * Test for YouTube Premium by loading a video and checking if an ad plays
   * before the actual content starts. Uses a provided videoId (from user's library)
   * or falls back to a known embeddable video.
   */
  async testPremium(container: HTMLElement, videoId?: string): Promise<{ premium: boolean; message: string }> {
    if (!this.apiLoaded) {
      try {
        await this.loadYouTubeAPI();
      } catch {
        return { premium: false, message: UI.CONNECTION_REQUIRED };
      }
    }

    // Prefer user-provided video, fall back to Rick Astley (always embeddable, monetized)
    const testVideoId = videoId || 'dQw4w9WgXcQ';
    const testDivId = `trpg-yt-test-${Date.now()}`;
    const testDiv = container.createDiv({ attr: { id: testDivId } });
    testDiv.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;';

    return new Promise((resolve) => {
      let adDetected = false;
      let videoStarted = false;
      const timeout = window.setTimeout(() => {
        cleanup();
        if (!videoStarted) {
          resolve({ premium: false, message: 'Test expiré — impossible de charger la vidéo' });
        } else {
          resolve({
            premium: !adDetected,
            message: adDetected
              ? 'Publicités détectées — YouTube Premium non actif'
              : 'Aucune publicité — YouTube Premium actif ✓',
          });
        }
      }, 12000);

      let player: YT.Player;
      const cleanup = () => {
        window.clearTimeout(timeout);
        try { player?.destroy(); } catch { /* */ }
        testDiv.remove();
      };

      player = new YT.Player(testDiv, {
        height: '1',
        width: '1',
        videoId: testVideoId,
        playerVars: { autoplay: 1, controls: 0 },
        events: {
          onReady: (event) => {
            event.target.setVolume(0); // Muted test
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              // Check if the playing video matches our test video
              // During an ad, getVideoData().video_id differs from the loaded video
              try {
                const data = player.getVideoData();
                if (data.video_id && data.video_id !== testVideoId) {
                  adDetected = true;
                  // Ad detected — no need to wait further
                  cleanup();
                  resolve({
                    premium: false,
                    message: 'Publicités détectées — YouTube Premium non actif',
                  });
                  return;
                }
              } catch { /* getVideoData may not be available */ }

              if (!videoStarted) {
                videoStarted = true;
                // If video started playing within ~3 seconds with no ad, likely Premium
                // Wait a bit more to be sure, then resolve
                window.setTimeout(() => {
                  if (!adDetected) {
                    cleanup();
                    resolve({
                      premium: true,
                      message: 'Aucune publicité — YouTube Premium actif ✓',
                    });
                  }
                }, 3000);
              }
            }
          },
          onError: () => {
            cleanup();
            resolve({ premium: false, message: 'Erreur lors du test — vidéo inaccessible' });
          },
        },
      });
    });
  }

  isPlayerInitialized(channel: Channel): boolean {
    return this.channels[channel].player !== null;
  }

  getChannelState(channel: Channel): { isPlaying: boolean; isPaused: boolean; videoId: string | null; volume: number } {
    const state = this.channels[channel];
    return {
      isPlaying: state.playing,
      isPaused: state.paused,
      videoId: state.currentVideoId,
      volume: state.volume,
    };
  }

  private getEffectiveVolume(channel: Channel): number {
    return Math.round(this.channels[channel].volume * (this.masterVolume / 100));
  }

  // F4: stopPlayback() for view close without destroying the service
  stopPlayback(): void {
    for (const ch of ['ambiance', 'musique'] as Channel[]) {
      const state = this.channels[ch];
      this.clearStartWatchdog(ch);
      if (state.player && state.currentVideoId) {
        state.player.stopVideo();
        state.currentVideoId = null;
        state.playing = false;
        state.paused = false;
      }
    }
  }

  // F15: Clean up script tag on destroy
  destroy(): void {
    for (const ch of ['ambiance', 'musique'] as Channel[]) {
      this.clearStartWatchdog(ch);
      try {
        this.channels[ch].player?.destroy();
      } catch {
        // Player may already be destroyed
      }
      this.channels[ch].player = null;
      this.channels[ch].currentVideoId = null;
      this.channels[ch].playing = false;
      this.channels[ch].paused = false;
    }

    this.probeContainer?.remove();
    this.probeContainer = null;
    this.probeWaiters = [];
    this.activeProbes = 0;

    if (this.scriptTag && this.scriptTag.parentNode) {
      this.scriptTag.parentNode.removeChild(this.scriptTag);
      this.scriptTag = null;
    }

    this.apiLoaded = false;
    this.apiLoading = null;
  }
}

// F13: Removed bare 11-char pattern — only accept full YouTube URLs
/**
 * Extrait le seul identifiant de vidéo d'une URL YouTube. Tout le reste
 * (`&list=`, `&start_radio=`, `&t=`, `?si=`…) est ignoré, ce qui garantit
 * qu'une URL collée depuis une radio ou une playlist donne exactement le
 * même identifiant que l'URL simple de la même vidéo.
 */
export function extractYoutubeId(url: string): string | null {
  const patterns = [
    // watch?…&v=ID — le paramètre v n'est pas forcément en tête
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})/,
    // Formats à segment de chemin : youtu.be/ID, /embed/ID, /shorts/ID, /live/ID, /v/ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

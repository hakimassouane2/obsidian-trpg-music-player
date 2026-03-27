import type { Channel } from './types';
import { LOG_PREFIX, UI } from './constants';

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
}

const API_LOAD_TIMEOUT = 15000;

export class PlayerService {
  private channels: Record<Channel, ChannelState> = {
    ambiance: { player: null, currentVideoId: null, volume: 80, containerId: '', playing: false, paused: false },
    musique: { player: null, currentVideoId: null, volume: 80, containerId: '', playing: false, paused: false },
  };
  private readonly masterVolume = 100;
  private apiLoaded = false;
  private apiLoading: Promise<void> | null = null;
  private onErrorCallback: ((channel: Channel, message: string) => void) | null = null;
  private scriptTag: HTMLScriptElement | null = null;

  onError(callback: (channel: Channel, message: string) => void): void {
    this.onErrorCallback = callback;
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
            // Auto-loop: when video ends, replay it
            if (event.data === YT.PlayerState.ENDED) {
              const state = this.channels[channel];
              if (state.currentVideoId && state.player) {
                state.player.loadVideoById(state.currentVideoId);
                state.player.setVolume(this.getEffectiveVolume(channel));
              }
            }
          },
          onError: (event) => {
            console.error(LOG_PREFIX, `Player error on ${channel}:`, event.data);
            if (this.onErrorCallback) {
              this.onErrorCallback(channel, UI.VIDEO_UNAVAILABLE);
            }
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
    state.player.loadVideoById(youtubeId);
    state.player.setVolume(this.getEffectiveVolume(channel));
    state.currentVideoId = youtubeId;
    state.playing = true;
    state.paused = false;
  }

  stop(channel: Channel): void {
    const state = this.channels[channel];
    if (!state.player || !state.currentVideoId) return;

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
      state.player.pauseVideo();
      state.paused = true;
      state.playing = false;
    }
  }

  setVolume(channel: Channel, volume: number): void {
    this.channels[channel].volume = volume;
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

    if (this.scriptTag && this.scriptTag.parentNode) {
      this.scriptTag.parentNode.removeChild(this.scriptTag);
      this.scriptTag = null;
    }

    this.apiLoaded = false;
    this.apiLoading = null;
  }
}

// F13: Removed bare 11-char pattern — only accept full YouTube URLs
export function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

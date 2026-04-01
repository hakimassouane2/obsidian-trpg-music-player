import type { Track } from './types';

export class SequentialQueue {
  private queue: Track[] = [];
  private index = -1;
  private active = false;
  private lastPlayedTrack: Track | null = null;

  /** Build a shuffled queue from the given tracks. Preserves anti-repeat across rebuilds. */
  build(tracks: Track[]): void {
    if (tracks.length === 0) {
      this.queue = [];
      this.index = -1;
      return;
    }

    this.queue = [...tracks];
    this.fisherYatesShuffle(this.queue);

    // Anti-repeat: if the first track of the new shuffle is the same as the last played track, swap it
    if (this.lastPlayedTrack && this.queue.length > 1 && this.queue[0].id === this.lastPlayedTrack.id) {
      const swapIdx = 1 + Math.floor(Math.random() * (this.queue.length - 1));
      [this.queue[0], this.queue[swapIdx]] = [this.queue[swapIdx], this.queue[0]];
    }

    this.index = -1;
  }

  /** Returns the next track in the queue. Re-shuffles when exhausted. */
  next(): Track | null {
    if (this.queue.length === 0) return null;

    this.index++;

    if (this.index >= this.queue.length) {
      // Queue exhausted — re-shuffle with anti-repeat
      this.lastPlayedTrack = this.queue[this.queue.length - 1];
      this.fisherYatesShuffle(this.queue);

      if (this.lastPlayedTrack && this.queue.length > 1 && this.queue[0].id === this.lastPlayedTrack.id) {
        const swapIdx = 1 + Math.floor(Math.random() * (this.queue.length - 1));
        [this.queue[0], this.queue[swapIdx]] = [this.queue[swapIdx], this.queue[0]];
      }

      this.index = 0;
    }

    return this.queue[this.index];
  }

  /** Returns the currently playing track (last returned by next()). */
  current(): Track | null {
    if (this.index < 0 || this.index >= this.queue.length) return null;
    return this.queue[this.index];
  }

  /** Empties the queue and resets state. Preserves lastPlayedTrack for anti-repeat across toggle cycles. */
  clear(): void {
    this.queue = [];
    this.index = -1;
  }

  /** Returns a copy of the queue for display purposes. */
  getQueue(): Track[] {
    return [...this.queue];
  }

  /** Returns the current index in the queue. */
  getIndex(): number {
    return this.index;
  }

  /** Jump to a specific index in the queue. */
  jumpTo(index: number): Track | null {
    if (index < 0 || index >= this.queue.length) return null;
    this.index = index;
    return this.queue[this.index];
  }

  isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.clear();
    }
  }

  private fisherYatesShuffle(arr: Track[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

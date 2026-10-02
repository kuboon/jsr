/**
 * Game background music on the Web Audio API, with no dependencies.
 *
 * - **Intro + loop**: a track plays its intro once, then loops between its
 *   `loopStart` and `loopEnd` forever, sample-accurately and with no gap — the
 *   looping is done by `AudioBufferSourceNode` itself, not by a timer.
 * - **Crossfades**: switching tracks fades the old one out and the new one in
 *   along equal-power curves, so the overall loudness does not dip midway.
 * - **Buses**: `master`, `bgm` and `se` volumes, each its own `GainNode`.
 * - **Browser chores**: the `AudioContext` is resumed on the first user gesture
 *   (browsers keep it suspended until then), and paused while the tab is
 *   hidden.
 *
 * Tracks are synthesized: you write the melody in MML and bring the
 * instruments (or take some from `@kuboon/bgm/instruments`), and
 * {@linkcode GameAudio.compose} renders them into a track. A track lives in
 * memory as an `AudioBuffer`, which is what makes the loop seamless.
 *
 * @example
 * ```ts ignore
 * import { GameAudio } from "@kuboon/bgm";
 * import { kick, musicBox, triangle } from "@kuboon/bgm/instruments";
 *
 * const audio = new GameAudio();
 * const instruments = [musicBox, triangle, kick];
 * const field = audio.compose(
 *   "t120 @0 o5 l8 c<g>ceg4.r L e4dcd4<g4> ; @1 o3 c2g2 L c1 ; r1 L @2 [c4]4",
 *   instruments,
 * );
 *
 * audio.playBgm(field);
 * // later: crossfade over one second
 * audio.playBgm(otherTrack, { fade: 1 });
 * audio.setVolume("bgm", 0.5);
 * ```
 *
 * @module
 */

import { type Instrument, renderMml, type RenderMmlOptions } from "./mml.ts";

export {
  type Instrument,
  type InstrumentNote,
  type MmlNote,
  type MmlPart,
  parseMml,
  type RenderedMml,
  renderMml,
  type RenderMmlOptions,
} from "./mml.ts";

/** A volume bus. `bgm` and `se` both feed `master`. */
export type Bus = "master" | "bgm" | "se";

/** Where a track loops, in seconds from its start. */
export interface LoopPoints {
  /** Where each loop restarts. The part before it is the intro. Default `0`. */
  loopStart?: number;
  /** Where each loop ends and jumps back to `loopStart`. Default: the end of the audio. */
  loopEnd?: number;
}

/** Audio plus its loop points; made by {@linkcode GameAudio.compose} or {@linkcode createTrack}. */
export interface Track {
  readonly buffer: AudioBuffer;
  /** Seconds. */
  readonly loopStart: number;
  /** Seconds. */
  readonly loopEnd: number;
}

/**
 * Pairs an `AudioBuffer` you rendered yourself with its loop points, in
 * seconds. {@linkcode GameAudio.compose} uses this under the hood.
 *
 * @throws {RangeError} unless `0 <= loopStart < loopEnd <= buffer.duration`
 */
export function createTrack(buffer: AudioBuffer, loop: LoopPoints = {}): Track {
  const loopStart = loop.loopStart ?? 0;
  const loopEnd = loop.loopEnd ?? buffer.duration;
  if (!(loopStart >= 0 && loopStart < loopEnd && loopEnd <= buffer.duration)) {
    throw new RangeError(
      `Loop points must satisfy 0 <= loopStart < loopEnd <= ${buffer.duration}, got ${loopStart} and ${loopEnd}`,
    );
  }
  return { buffer, loopStart, loopEnd };
}

/** Options for {@linkcode GameAudio}. */
export interface GameAudioOptions {
  /** Use this context instead of creating one. */
  context?: AudioContext;
  /** Pause while the page is hidden. Default `true`. */
  pauseWhenHidden?: boolean;
}

/** Options for {@linkcode GameAudio.playBgm}. */
export interface PlayBgmOptions {
  /** Crossfade duration in seconds. Default `0` (cut). */
  fade?: number;
  /** Restart even if this track is already the one playing. Default `false`. */
  restart?: boolean;
}

/** Options for {@linkcode GameAudio.stopBgm}. */
export interface StopBgmOptions {
  /** Fade-out duration in seconds. Default `0`. */
  fade?: number;
}

/** Options for {@linkcode GameAudio.setVolume}. */
export interface SetVolumeOptions {
  /** Ramp duration in seconds. Default `0`. */
  fade?: number;
}

/** Options for {@linkcode GameAudio.playSe}. */
export interface PlaySeOptions {
  /** Gain for this one sound, on top of the `se` bus. Default `1`. */
  volume?: number;
  /** `2` is an octave up and twice as fast. Default `1`. */
  playbackRate?: number;
}

/**
 * The fades get a gain node each, so a fade-out can start in the middle of a
 * fade-in: two `setValueCurveAtTime` ranges overlapping on one param throw,
 * and `cancelAndHoldAtTime` (the other way out) is missing in Firefox.
 */
interface Playing {
  track: Track;
  source: AudioBufferSourceNode;
  fadeIn: GainNode;
  fadeOut: GainNode;
  startedAt: number;
}

const CURVE_STEPS = 64;

/** Equal-power fade: 0 → 1 (`in`) or 1 → 0 (`out`). */
function fadeCurve(direction: "in" | "out"): Float32Array {
  const curve = new Float32Array(CURVE_STEPS);
  for (let i = 0; i < CURVE_STEPS; i++) {
    const t = i / (CURVE_STEPS - 1);
    // sin rather than cos for the fade-out: cos(π/2) is 6e-17, not silence.
    curve[i] = Math.sin((direction === "in" ? t : 1 - t) * Math.PI / 2);
  }
  return curve;
}

const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

/**
 * One `AudioContext` with `master` / `bgm` / `se` buses, one background track
 * at a time, and any number of overlapping sound effects.
 */
export class GameAudio {
  readonly context: AudioContext;
  readonly #buses: Record<Bus, GainNode>;
  #bgm: Playing | null = null;
  #paused = false;
  #cleanup: (() => void)[] = [];

  constructor(options: GameAudioOptions = {}) {
    this.context = options.context ?? new AudioContext();
    const master = this.context.createGain();
    master.connect(this.context.destination);
    const bgm = this.context.createGain();
    bgm.connect(master);
    const se = this.context.createGain();
    se.connect(master);
    this.#buses = { master, bgm, se };

    if (typeof document === "undefined") return;
    this.#unlockOnGesture();
    if (options.pauseWhenHidden ?? true) this.#pauseWhenHidden();
  }

  /** Browsers start a context suspended until a user gesture; resume it on the first one. */
  #unlockOnGesture(): void {
    const unlock = () => {
      if (this.#paused) return;
      void this.context.resume().then(() => {
        if (this.context.state === "running") remove();
      });
    };
    const remove = () => {
      for (const type of GESTURES) {
        document.removeEventListener(type, unlock, true);
      }
    };
    for (const type of GESTURES) document.addEventListener(type, unlock, true);
    this.#cleanup.push(remove);
  }

  #pauseWhenHidden(): void {
    const onChange = () => {
      if (document.hidden) void this.context.suspend();
      else if (!this.#paused) void this.context.resume();
    };
    document.addEventListener("visibilitychange", onChange);
    this.#cleanup.push(() =>
      document.removeEventListener("visibilitychange", onChange)
    );
  }

  /** The bus's `GainNode`, for routing your own nodes (filters, analysers) through it. */
  bus(name: Bus): GainNode {
    return this.#buses[name];
  }

  /** The bus's current volume. */
  volume(name: Bus): number {
    return this.#buses[name].gain.value;
  }

  /** Sets a bus's volume (`1` is unchanged), optionally ramping over `fade` seconds. */
  setVolume(name: Bus, value: number, options: SetVolumeOptions = {}): void {
    const param = this.#buses[name].gain;
    const now = this.context.currentTime;
    const fade = options.fade ?? 0;
    param.cancelScheduledValues(now);
    if (fade > 0) {
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + fade);
    } else {
      param.setValueAtTime(value, now);
    }
  }

  /**
   * Renders MML with your instruments into a {@linkcode Track} — `@n` plays
   * `instruments[n]`, and `L` marks where the loop starts. See
   * {@linkcode renderMml} for the details.
   */
  compose(
    mml: string,
    instruments: readonly Instrument[],
    options?: RenderMmlOptions,
  ): Track {
    const rate = this.context.sampleRate;
    const { samples, loopStart } = renderMml(mml, instruments, rate, options);
    const buffer = this.context.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    return createTrack(buffer, { loopStart });
  }

  /** The track playing as BGM, or `null`. */
  get bgm(): Track | null {
    return this.#bgm?.track ?? null;
  }

  /**
   * Where the BGM is within its track, in seconds — wrapped into the loop once
   * the intro is over. `null` when nothing is playing.
   */
  get bgmPosition(): number | null {
    if (this.#bgm === null) return null;
    const { track, startedAt } = this.#bgm;
    const elapsed = Math.max(0, this.context.currentTime - startedAt);
    if (elapsed < track.loopEnd) return elapsed;
    const loopLength = track.loopEnd - track.loopStart;
    return track.loopStart + (elapsed - track.loopStart) % loopLength;
  }

  /**
   * Plays `track` as the BGM, replacing (and crossfading from) whatever was
   * playing. Asking for the track that is already playing does nothing unless
   * `restart` is set, so it is safe to call on every scene change.
   */
  playBgm(track: Track, options: PlayBgmOptions = {}): void {
    if (this.#bgm?.track === track && !options.restart) return;
    const fade = options.fade ?? 0;
    const now = this.context.currentTime;
    this.#fadeOutBgm(now, fade);

    const source = this.context.createBufferSource();
    source.buffer = track.buffer;
    source.loop = true;
    source.loopStart = track.loopStart;
    source.loopEnd = track.loopEnd;
    const fadeIn = this.context.createGain();
    if (fade > 0) fadeIn.gain.setValueCurveAtTime(fadeCurve("in"), now, fade);
    const fadeOut = this.context.createGain();
    source.connect(fadeIn).connect(fadeOut).connect(this.#buses.bgm);
    source.start(now);
    this.#bgm = { track, source, fadeIn, fadeOut, startedAt: now };
  }

  /** Stops the BGM, optionally fading out over `fade` seconds. */
  stopBgm(options: StopBgmOptions = {}): void {
    this.#fadeOutBgm(this.context.currentTime, options.fade ?? 0);
    this.#bgm = null;
  }

  #fadeOutBgm(now: number, fade: number): void {
    if (this.#bgm === null) return;
    const { source, fadeOut } = this.#bgm;
    if (fade > 0) fadeOut.gain.setValueCurveAtTime(fadeCurve("out"), now, fade);
    source.addEventListener("ended", () => fadeOut.disconnect());
    source.stop(now + fade);
  }

  /**
   * Plays `track` once as a sound effect, from its start to its end (loop
   * points are ignored). Returns the source, so a long effect can be stopped.
   */
  playSe(track: Track, options: PlaySeOptions = {}): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = track.buffer;
    source.playbackRate.value = options.playbackRate ?? 1;
    const gain = this.context.createGain();
    gain.gain.value = options.volume ?? 1;
    source.connect(gain).connect(this.#buses.se);
    source.addEventListener("ended", () => gain.disconnect());
    source.start();
    return source;
  }

  /** Whether {@linkcode pause} is in effect. */
  get paused(): boolean {
    return this.#paused;
  }

  /** Freezes everything — BGM, effects, and their fades — where it is. */
  async pause(): Promise<void> {
    this.#paused = true;
    await this.context.suspend();
  }

  /** Undoes {@linkcode pause}. */
  async resume(): Promise<void> {
    this.#paused = false;
    await this.context.resume();
  }

  /** Stops everything, removes the page listeners, and closes the context. */
  async close(): Promise<void> {
    for (const cleanup of this.#cleanup) cleanup();
    this.#cleanup = [];
    this.stopBgm();
    await this.context.close();
  }
}

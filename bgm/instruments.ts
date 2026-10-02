/**
 * Ready-made {@linkcode Instrument}s for {@linkcode GameAudio.compose}.
 *
 * - Chiptune: {@linkcode pulse}, {@linkcode square}, {@linkcode triangle},
 *   {@linkcode sawtooth}, {@linkcode noise}
 * - {@linkcode musicBox}: a plucked metal tine that rings on after the note
 * - {@linkcode electricGuitar}: a plucked string (Karplus–Strong) through an
 *   overdrive
 * - Drums: {@linkcode kick}, {@linkcode snare}, {@linkcode hihat} — they
 *   ignore the note's pitch
 *
 * Every one is a plain function, so writing your own is the same shape: take
 * an {@linkcode InstrumentNote}, return its samples.
 *
 * @example
 * ```ts ignore
 * import { GameAudio } from "@kuboon/bgm";
 * import { electricGuitar, kick, musicBox } from "@kuboon/bgm/instruments";
 *
 * const audio = new GameAudio();
 * const song = audio.compose(
 *   "t120 @0 o5 l8 cegedc<g4> ; @1 o3 l4 c c g g ; @2 l4 c c c c",
 *   [musicBox, electricGuitar, kick],
 * );
 * ```
 *
 * @module
 */

import type { Instrument } from "./mml.ts";

export type { Instrument, InstrumentNote } from "./mml.ts";

const ATTACK = 0.002;
const RELEASE = 0.02;

/** A deterministic white-noise source, so a song renders the same every time. */
function random(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x80000000 - 1;
  };
}

/** A held tone: a short attack, the wave for as long as the note is held, then a short release. */
function held(wave: (phase: number) => number): Instrument {
  return ({ frequency, duration, velocity, sampleRate }) => {
    const attack = Math.max(1, Math.round(ATTACK * sampleRate));
    const hold = Math.round(duration * sampleRate);
    const release = Math.round(RELEASE * sampleRate);
    const out = new Float32Array(hold + release);
    for (let i = 0; i < out.length; i++) {
      const envelope = i < attack
        ? i / attack
        : i < hold
        ? 1
        : 1 - (i - hold) / release;
      out[i] = velocity * envelope * wave(frequency * i / sampleRate % 1);
    }
    return out;
  };
}

/**
 * A pulse wave of the given duty cycle (`0.125`, `0.25` and `0.5` are the
 * classic console ones), with its DC offset removed so a note starts and stops
 * without a click.
 */
export function pulse(duty = 0.5): Instrument {
  const peak = Math.max(duty, 1 - duty);
  return held((phase) => ((phase < duty ? 1 : 0) - duty) / peak);
}

/** {@linkcode pulse} at 50%. */
export const square: Instrument = pulse(0.5);

/** A triangle wave — the classic bass. */
export const triangle: Instrument = held((phase) =>
  4 * Math.abs(phase - 0.5) - 1
);

/** A sawtooth wave — bright and buzzy. */
export const sawtooth: Instrument = held((phase) => 2 * phase - 1);

/** Noise whose brightness follows the note's pitch: high notes hiss, low ones rumble. */
export const noise: Instrument = (note) => {
  const next = random(Math.round(note.frequency * 1000));
  const period = Math.max(
    1,
    Math.round(note.sampleRate / (note.frequency * 16)),
  );
  let sample = 0;
  let value = 0;
  // `held` calls the wave once per sample, in order, so it can step the noise.
  return held(() => {
    if (sample++ % period === 0) value = next();
    return value;
  })(note);
};

/**
 * A music box tine. A tine is a cantilever, whose second mode sits at 6.27×
 * the fundamental — that inharmonic partial is what makes it sound like
 * metal. Both decay exponentially, low notes slower than high ones, and the
 * note rings on regardless of how long it is held.
 */
export const musicBox: Instrument = ({ frequency, velocity, sampleRate }) => {
  const decay = Math.min(1.5, 0.9 * Math.sqrt(440 / frequency));
  // Three time constants: the tail is down to 5% by then.
  const out = new Float32Array(Math.round(decay * 3 * sampleRate));
  const attack = Math.round(0.001 * sampleRate);
  // Each partial is a decaying sine, stepped by rotating a vector rather than
  // calling sin and exp every sample.
  const [c1, s1] = rotation(frequency, decay, sampleRate);
  const [c2, s2] = rotation(frequency * 6.27, decay / 6, sampleRate);
  let x1 = 1, y1 = 0, x2 = 1, y2 = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] = velocity * Math.min(1, i / attack) * (y1 + 0.3 * y2) * 0.6;
    const nx1 = x1 * c1 - y1 * s1;
    y1 = x1 * s1 + y1 * c1;
    x1 = nx1;
    const nx2 = x2 * c2 - y2 * s2;
    y2 = x2 * s2 + y2 * c2;
    x2 = nx2;
  }
  return out;
};

/** One sample's rotation of a sine at `frequency`, shrunk to decay with time constant `decay`. */
function rotation(
  frequency: number,
  decay: number,
  sampleRate: number,
): [number, number] {
  const angle = 2 * Math.PI * frequency / sampleRate;
  const shrink = Math.exp(-1 / (decay * sampleRate));
  return [Math.cos(angle) * shrink, Math.sin(angle) * shrink];
}

/**
 * An overdriven electric guitar: a Karplus–Strong plucked string (a burst of
 * noise circulating through a damped delay line one period long), clipped
 * with `tanh`, then darkened by a one-pole low-pass standing in for the
 * speaker cabinet. Releasing the note mutes the string.
 */
export const electricGuitar: Instrument = (
  { frequency, duration, velocity, sampleRate },
) => {
  // Averaging with the neighbour written one step later shortens the loop by half a sample, so the
  // line is half a sample longer than a period; a first-order all-pass supplies the fractional
  // rest, keeping high notes in tune.
  const delay = sampleRate / frequency + 0.5;
  let size = Math.max(2, Math.floor(delay));
  let fraction = delay - size;
  if (fraction < 0.1 && size > 2) {
    size--;
    fraction++;
  }
  const allpass = (1 - fraction) / (1 + fraction);
  const line = new Float32Array(size);
  const next = random(Math.round(frequency * 1000));
  for (let i = 0; i < size; i++) line[i] = next();

  // A string left ringing is inaudible after a few seconds; stop computing it there.
  const hold = Math.min(Math.round(duration * sampleRate), 3 * sampleRate);
  const release = Math.round(0.05 * sampleRate);
  const out = new Float32Array(hold + release);
  const drive = 6;
  const cabinet = Math.exp(-2 * Math.PI * 3500 / sampleRate);
  let previousIn = 0;
  let previousOut = 0;
  let lowpass = 0;
  for (let i = 0; i < out.length; i++) {
    const index = i % size;
    const current = line[index];
    const following = line[(index + 1) % size];
    // Averaging neighbours is the string's damping; 0.996 its loss per pass.
    const averaged = 0.996 * 0.5 * (current + following);
    const tuned = allpass * (averaged - previousOut) + previousIn;
    previousIn = averaged;
    previousOut = tuned;
    line[index] = tuned;

    const driven = Math.tanh(drive * current) / Math.tanh(drive);
    lowpass = (1 - cabinet) * driven + cabinet * lowpass;
    const mute = i < hold ? 1 : 1 - (i - hold) / release;
    out[i] = velocity * mute * lowpass * 0.8;
  }
  return out;
};

/** A kick drum: a sine sweeping down from 150 Hz, decaying fast. */
export const kick: Instrument = ({ velocity, sampleRate }) => {
  const out = new Float32Array(Math.round(0.4 * sampleRate));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const frequency = 45 + 105 * Math.exp(-t / 0.04);
    phase += frequency / sampleRate;
    out[i] = velocity * Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.12);
  }
  return out;
};

/** A snare drum: a burst of noise over a short 180 Hz body. */
export const snare: Instrument = ({ velocity, sampleRate }) => {
  const out = new Float32Array(Math.round(0.25 * sampleRate));
  const next = random(0x5ca7e);
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const body = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.03);
    out[i] = velocity * (0.7 * next() * Math.exp(-t / 0.06) + 0.5 * body);
  }
  return out;
};

/** A closed hi-hat: high-passed noise, very short. */
export const hihat: Instrument = ({ velocity, sampleRate }) => {
  const out = new Float32Array(Math.round(0.08 * sampleRate));
  const next = random(0x41ba7);
  let previous = 0;
  for (let i = 0; i < out.length; i++) {
    const white = next();
    // Differencing white noise is a crude high-pass: only the hiss is left.
    out[i] = velocity * 0.5 * (white - previous) *
      Math.exp(-i / sampleRate / 0.02);
    previous = white;
  }
  return out;
};

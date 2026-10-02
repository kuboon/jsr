import { assert, assertEquals } from "@std/assert";
import * as instruments from "./instruments.ts";
import type { Instrument, InstrumentNote } from "./mml.ts";

const SAMPLE_RATE = 48000;

function note(frequency: number, duration = 0.5): InstrumentNote {
  return { frequency, duration, velocity: 1, sampleRate: SAMPLE_RATE };
}

/** The lag, in samples, at which the signal best matches itself, searched around `near`. */
function period(samples: Float32Array, near: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = Math.floor(near * 0.8); lag <= Math.ceil(near * 1.2); lag++) {
    let score = 0;
    for (let i = 2000; i < 6000; i++) score += samples[i] * samples[i + lag];
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return best;
}

const all = Object.entries(instruments).filter(([, value]) =>
  typeof value === "function" && value.length === 1
) as [string, Instrument][];

Deno.test("instruments: every one renders finite samples within ±1.5", () => {
  for (const [name, instrument] of all.filter(([name]) => name !== "pulse")) {
    const samples = instrument(note(440));
    assert(samples.length > 0, name);
    assert(
      samples.every((s) => Number.isFinite(s) && Math.abs(s) <= 1.5),
      name,
    );
  }
});

Deno.test("instruments: rendering is deterministic", () => {
  for (const [name, instrument] of all.filter(([name]) => name !== "pulse")) {
    assertEquals(instrument(note(330)), instrument(note(330)), name);
  }
});

Deno.test("instruments: held tones last as long as the note, plus a short release", () => {
  const samples = instruments.square(note(440, 0.5));
  assertEquals(samples.length, 0.52 * SAMPLE_RATE);
});

Deno.test("instruments: the music box rings on past a short note", () => {
  assert(instruments.musicBox(note(880, 0.1)).length > SAMPLE_RATE);
});

Deno.test("instruments: pitched voices play in tune", () => {
  for (
    const [name, instrument] of [
      ["square", instruments.square],
      ["triangle", instruments.triangle],
      ["electricGuitar", instruments.electricGuitar],
    ] as const
  ) {
    for (const frequency of [110, 440, 1046.5]) {
      const expected = SAMPLE_RATE / frequency;
      const measured = period(instrument(note(frequency, 1)), expected);
      assert(
        Math.abs(measured - expected) <= 1,
        `${name} at ${frequency} Hz: period ${measured}, expected ${expected}`,
      );
    }
  }
});

Deno.test("instruments: pulse duty cycles carry no DC offset", () => {
  for (const duty of [0.125, 0.25, 0.5]) {
    const samples = instruments.pulse(duty)(note(500, 1));
    const middle = samples.subarray(SAMPLE_RATE * 0.1, SAMPLE_RATE * 0.9);
    const mean = middle.reduce((a, b) => a + b, 0) / middle.length;
    assert(Math.abs(mean) < 0.01, `duty ${duty}: mean ${mean}`);
  }
});

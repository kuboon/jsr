import { assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import { type Instrument, parseMml, renderMml } from "./mml.ts";

const notes = (source: string, part = 0) => parseMml(source)[part].notes;

Deno.test("parseMml: note lengths, dots and ^, at the given tempo", () => {
  const [part] = parseMml("t120 q8 c4 d8 e8. f^8 g4.^16");
  assertEquals(part.notes.map((n) => n.start), [0, 0.5, 0.75, 1.125, 1.875]);
  assertEquals(part.notes.map((n) => n.duration), [
    0.5,
    0.25,
    0.375,
    0.75,
    0.875,
  ]);
  assertEquals(part.end, 2.75);
});

Deno.test("parseMml: l sets the default length", () => {
  const [part] = parseMml("t60 l8 c c. c4");
  assertEquals(part.notes.map((n) => n.start), [0, 0.5, 1.25]);
});

Deno.test("parseMml: octaves and accidentals", () => {
  assertEquals(notes("c c+ d- e# o5 c > c < < c b-").map((n) => n.midi), [
    60,
    61,
    61,
    65,
    72,
    84,
    60,
    70,
  ]);
});

Deno.test("parseMml: q gates notes, rests make none", () => {
  const [part] = parseMml("t60 q4 c4 r4 c4");
  assertEquals(part.notes.map((n) => [n.start, n.duration]), [[0, 0.5], [
    2,
    0.5,
  ]]);
});

Deno.test("parseMml: & ties a note to the same pitch, or slurs into another", () => {
  assertEquals(
    notes("t60 q4 c4&c4 d4").map((n) => [n.midi, n.start, n.duration]),
    [[60, 0, 1.5], [62, 2, 0.5]],
  );
  assertEquals(
    notes("t60 q4 c4&d4").map((n) => [n.midi, n.start, n.duration]),
    [[60, 0, 1], [62, 1, 0.5]],
  );
});

Deno.test("parseMml: v, @ and their defaults", () => {
  assertEquals(
    notes("c v3 @2 c").map((n) => [n.velocity, n.instrument]),
    [[12 / 15, 0], [3 / 15, 2]],
  );
});

Deno.test("parseMml: [ ]n repeats, nesting included, twice by default", () => {
  assertEquals(notes("[c d]3").length, 6);
  assertEquals(notes("[[c]2 d]").map((n) => n.midi), [60, 60, 62, 60, 60, 62]);
});

Deno.test("parseMml: L marks the loop start", () => {
  assertEquals(parseMml("t60 c4 L d4")[0].loop, 1);
  assertEquals(parseMml("c4")[0].loop, null);
});

Deno.test("parseMml: parts split on ;, and start at the first part's tempo", () => {
  const parts = parseMml("t60 c4 ; d4 ; t120 e4");
  assertEquals(parts.map((p) => p.end), [1, 1, 0.5]);
});

Deno.test("parseMml: errors name the part and column", () => {
  assertThrows(() => parseMml("c ; c x"), SyntaxError, "part 2, column 4");
  assertThrows(() => parseMml("c]"), SyntaxError, `"]" without "["`);
  assertThrows(() => parseMml("[c"), SyntaxError, `"[" without "]"`);
  assertThrows(() => parseMml("o"), SyntaxError, `"o" needs a number`);
  assertThrows(() => parseMml("v16"), SyntaxError, "out of range");
  assertThrows(() => parseMml("[L c]"), SyntaxError, "inside [ ]");
  assertThrows(() => parseMml("L c L c"), SyntaxError, `More than one "L"`);
});

/** Plays a constant 1 for `tail` seconds, whatever the note. */
const constant = (tail: number): Instrument => ({ sampleRate }) =>
  new Float32Array(Math.round(tail * sampleRate)).fill(1);

Deno.test("renderMml: plays each @n with instruments[n]", () => {
  const { samples } = renderMml(
    "t60 q8 @0 c4 @1 c4",
    [constant(1), () => new Float32Array(1000).fill(-1)],
    1000,
    { gain: 1 },
  );
  assertEquals([samples[0], samples[999], samples[1000]], [1, 1, -1]);
});

Deno.test("renderMml: with L, the song ends with its parts and tails wrap into the loop", () => {
  const { samples, loopStart } = renderMml(
    "t60 c4 L c4",
    [constant(3)],
    1000,
    { gain: 0.1 },
  );
  assertEquals(loopStart, 1);
  assertEquals(samples.length, 2000);
  assertAlmostEquals(samples[0], 0.1);
  // The first note's tail and the second note both run 3 s, so the loop holds
  // the second note's three passes plus the first note's last two seconds.
  assertAlmostEquals(samples[1000], 0.5);
});

Deno.test("renderMml: without L, the song runs on until every tail ends", () => {
  const { samples, loopStart } = renderMml("t60 c4", [constant(3)], 1000);
  assertEquals([samples.length, loopStart], [3000, 0]);
});

Deno.test("renderMml: rejects Ls at different times, and unknown instruments", () => {
  assertThrows(
    () => renderMml("L c4 ; c4 L c4", [constant(1)], 1000),
    SyntaxError,
    "same time",
  );
  assertThrows(() => renderMml("@1 c", [constant(1)], 1000), RangeError, "@1");
});

/**
 * MML (Music Macro Language) parsing, and rendering it with your instruments.
 *
 * @module
 */

/** One note, as handed to an {@linkcode Instrument}. */
export interface InstrumentNote {
  /** Hz. */
  frequency: number;
  /** How long the note is held, in seconds (after `q` gating and `&` ties). */
  duration: number;
  /** `0`–`1`, from `v0`–`v15`. */
  velocity: number;
  sampleRate: number;
}

/**
 * Renders one note to mono samples at `note.sampleRate`, starting at the note's
 * onset. The result may run past `note.duration` — a release or a ringing
 * tail — and it is mixed in as is. Peaks around ±1 at velocity 1.
 */
export type Instrument = (note: InstrumentNote) => Float32Array;

/** A note in a parsed song. Times are in seconds. */
export interface MmlNote {
  start: number;
  /** Held length, gated by `q`. */
  duration: number;
  /** MIDI note number; `60` is `o4c`. */
  midi: number;
  /** Index into the instruments, from `@n`. */
  instrument: number;
  velocity: number;
}

/** One part (one `;`-separated voice). Times are in seconds. */
export interface MmlPart {
  notes: MmlNote[];
  /** Where `L` is, or `null`. */
  loop: number | null;
  /** When the part's last note or rest ends. */
  end: number;
}

interface Length {
  denominator: number | null;
  dots: number;
}

type Command =
  | { kind: "note"; semitone: number | null; lengths: Length[] }
  | { kind: "octave"; value: number }
  | { kind: "octaveShift"; by: 1 | -1 }
  | { kind: "length"; value: Length }
  | { kind: "tempo"; value: number }
  | { kind: "volume"; value: number }
  | { kind: "gate"; value: number }
  | { kind: "instrument"; value: number }
  | { kind: "tie" }
  | { kind: "loop" }
  | { kind: "repeat"; body: Command[]; count: number };

const SEMITONES: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

class Reader {
  #i = 0;
  #start = 0;
  constructor(readonly source: string, readonly part: number) {}

  /** Marks where the command being read starts, for error messages. */
  begin(): void {
    this.#start = this.#i;
  }

  error(message: string): SyntaxError {
    return new SyntaxError(
      `MML part ${this.part + 1}, column ${this.#start + 1}: ${message}`,
    );
  }

  get done(): boolean {
    return this.#i >= this.source.length;
  }

  peek(): string {
    return this.source[this.#i];
  }

  next(): string {
    return this.source[this.#i++];
  }

  skipSpace(): void {
    while (!this.done && /\s/.test(this.peek())) this.#i++;
  }

  int(): number | null {
    const match = /^\d+/.exec(this.source.slice(this.#i));
    if (match === null) return null;
    this.#i += match[0].length;
    return Number(match[0]);
  }

  requireInt(command: string, min: number, max: number): number {
    const value = this.int();
    if (value === null) throw this.error(`"${command}" needs a number`);
    if (value < min || value > max) {
      throw this.error(`"${command}${value}" is out of range ${min}-${max}`);
    }
    return value;
  }

  length(): Length {
    const denominator = this.int();
    if (denominator === 0) throw this.error("a length cannot be 0");
    let dots = 0;
    while (this.peek() === ".") {
      this.next();
      dots++;
    }
    return { denominator, dots };
  }
}

function parseCommands(reader: Reader, inRepeat: boolean): Command[] {
  const commands: Command[] = [];
  for (reader.skipSpace(); !reader.done; reader.skipSpace()) {
    reader.begin();
    const c = reader.next();
    if (c in SEMITONES || c === "r") {
      let semitone = c === "r" ? null : SEMITONES[c];
      while (semitone !== null && /[+#-]/.test(reader.peek() ?? "")) {
        semitone += reader.next() === "-" ? -1 : 1;
      }
      const lengths = [reader.length()];
      while (reader.peek() === "^") {
        reader.next();
        lengths.push(reader.length());
      }
      commands.push({ kind: "note", semitone, lengths });
    } else if (c === "o") {
      commands.push({ kind: "octave", value: reader.requireInt("o", 0, 9) });
    } else if (c === ">" || c === "<") {
      commands.push({ kind: "octaveShift", by: c === ">" ? 1 : -1 });
    } else if (c === "l") {
      const value = reader.length();
      if (value.denominator === null) throw reader.error(`"l" needs a number`);
      commands.push({ kind: "length", value });
    } else if (c === "t") {
      commands.push({ kind: "tempo", value: reader.requireInt("t", 1, 999) });
    } else if (c === "v") {
      commands.push({ kind: "volume", value: reader.requireInt("v", 0, 15) });
    } else if (c === "q") {
      commands.push({ kind: "gate", value: reader.requireInt("q", 1, 8) });
    } else if (c === "@") {
      commands.push({
        kind: "instrument",
        value: reader.requireInt("@", 0, 255),
      });
    } else if (c === "&") {
      commands.push({ kind: "tie" });
    } else if (c === "L") {
      if (inRepeat) throw reader.error(`"L" cannot be inside [ ]`);
      commands.push({ kind: "loop" });
    } else if (c === "[") {
      const body = parseCommands(reader, true);
      commands.push({ kind: "repeat", body, count: reader.int() ?? 2 });
    } else if (c === "]") {
      if (!inRepeat) throw reader.error(`"]" without "["`);
      return commands;
    } else {
      throw reader.error(`unexpected "${c}"`);
    }
  }
  if (inRepeat) throw reader.error(`"[" without "]"`);
  return commands;
}

interface State {
  time: number;
  octave: number;
  length: Length;
  tempo: number;
  volume: number;
  gate: number;
  instrument: number;
  tie: boolean;
  part: MmlPart;
}

function beats(length: Length, fallback: Length): number {
  const denominator = length.denominator ?? fallback.denominator!;
  return 4 / denominator * (2 - 0.5 ** length.dots);
}

function run(commands: Command[], state: State): void {
  for (const command of commands) {
    switch (command.kind) {
      case "note": {
        const seconds = command.lengths.reduce(
          (sum, length) => sum + beats(length, state.length),
          0,
        ) * 60 / state.tempo;
        if (command.semitone !== null) {
          const midi = (state.octave + 1) * 12 + command.semitone;
          const notes = state.part.notes;
          const last = notes.at(-1);
          const held = seconds * state.gate / 8;
          if (state.tie && last !== undefined && last.midi === midi) {
            last.duration = state.time - last.start + held;
          } else {
            if (state.tie && last !== undefined) {
              last.duration = state.time - last.start;
            }
            notes.push({
              start: state.time,
              duration: held,
              midi,
              instrument: state.instrument,
              velocity: state.volume / 15,
            });
          }
        }
        state.tie = false;
        state.time += seconds;
        break;
      }
      case "octave":
        state.octave = command.value;
        break;
      case "octaveShift":
        state.octave += command.by;
        break;
      case "length":
        state.length = command.value;
        break;
      case "tempo":
        state.tempo = command.value;
        break;
      case "volume":
        state.volume = command.value;
        break;
      case "gate":
        state.gate = command.value;
        break;
      case "instrument":
        state.instrument = command.value;
        break;
      case "tie":
        state.tie = true;
        break;
      case "loop":
        if (state.part.loop !== null) {
          throw new SyntaxError(`More than one "L"`);
        }
        state.part.loop = state.time;
        break;
      case "repeat":
        for (let i = 0; i < command.count; i++) run(command.body, state);
        break;
    }
  }
}

/**
 * Parses MML into timed notes, one {@linkcode MmlPart} per `;`-separated part.
 *
 * Parts run side by side. Each starts at the tempo the first part starts
 * with, so a single leading `t` sets the whole song's tempo.
 *
 * @throws {SyntaxError} on malformed MML, naming the part and column
 */
export function parseMml(source: string): MmlPart[] {
  const parsed = source.split(";").map((text, i) =>
    parseCommands(new Reader(text, i), false)
  ).filter((commands) => commands.length > 0);
  const firstTempo = parsed[0]?.find((c) =>
    c.kind === "tempo" || c.kind === "note"
  );
  const tempo = firstTempo?.kind === "tempo" ? firstTempo.value : 120;
  return parsed.map((commands) => {
    const part: MmlPart = { notes: [], loop: null, end: 0 };
    const state: State = {
      time: 0,
      octave: 4,
      length: { denominator: 4, dots: 0 },
      tempo,
      volume: 12,
      gate: 7,
      instrument: 0,
      tie: false,
      part,
    };
    run(commands, state);
    part.end = state.time;
    return part;
  });
}

/** Options for {@linkcode renderMml}. */
export interface RenderMmlOptions {
  /** Applied to every note before mixing, leaving headroom for the parts to add up. Default `0.3`. */
  gain?: number;
}

/** What {@linkcode renderMml} produces. */
export interface RenderedMml {
  /** Mono. */
  samples: Float32Array<ArrayBuffer>;
  /** Seconds; where `L` is, or `0` without one. */
  loopStart: number;
}

/**
 * Renders MML to mono samples, playing `@n` with `instruments[n]`.
 *
 * With an `L`, the song is a loop: it ends where the parts end, and any tail
 * still ringing at that point wraps around to the loop's start, so the loop
 * has no seam. Without one, the samples run on until every tail has died
 * out.
 *
 * @throws {SyntaxError} on malformed MML, or parts whose `L`s are at different times
 * @throws {RangeError} when a part uses an instrument that is not given
 */
export function renderMml(
  source: string,
  instruments: readonly Instrument[],
  sampleRate: number,
  options: RenderMmlOptions = {},
): RenderedMml {
  const gain = options.gain ?? 0.3;
  const parts = parseMml(source);
  const loops = parts.flatMap((part) => part.loop === null ? [] : [part.loop]);
  const loopSample = loops.length > 0
    ? Math.round(loops[0] * sampleRate)
    : null;
  if (loops.some((loop) => Math.round(loop * sampleRate) !== loopSample)) {
    throw new SyntaxError(
      `Every part's "L" has to fall at the same time, got ${loops.join(", ")}s`,
    );
  }

  const rendered = parts.flatMap((part) =>
    part.notes.map((note) => {
      const instrument = instruments[note.instrument];
      if (instrument === undefined) {
        throw new RangeError(`No instrument for "@${note.instrument}"`);
      }
      return {
        at: Math.round(note.start * sampleRate),
        samples: instrument({
          frequency: 440 * 2 ** ((note.midi - 69) / 12),
          duration: note.duration,
          velocity: note.velocity,
          sampleRate,
        }),
      };
    })
  );

  const end = Math.round(Math.max(0, ...parts.map((p) => p.end)) * sampleRate);
  const length = loopSample === null
    ? Math.max(end, ...rendered.map((r) => r.at + r.samples.length))
    : end;
  const out = new Float32Array(length);
  const loopLength = length - (loopSample ?? 0);
  for (const { at, samples } of rendered) {
    for (let i = 0; i < samples.length; i++) {
      let index = at + i;
      if (index >= length) {
        if (loopSample === null || loopLength <= 0) break;
        index = loopSample + (index - length) % loopLength;
      }
      out[index] += samples[i] * gain;
    }
  }
  for (let i = 0; i < length; i++) {
    out[i] = Math.max(-1, Math.min(1, out[i]));
  }
  return { samples: out, loopStart: (loopSample ?? 0) / sampleRate };
}

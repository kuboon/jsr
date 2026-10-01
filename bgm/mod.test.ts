import { assertEquals, assertThrows } from "@std/assert";
import { createTrack, GameAudio } from "./mod.ts";

type Curve = { start: number; end: number };

/** Records automation, and throws on overlapping curves the way browsers do. */
class FakeParam {
  events: unknown[][] = [];
  #curves: Curve[] = [];
  constructor(public value: number) {}
  setValueAtTime(value: number, time: number) {
    this.events.push(["set", value, time]);
    this.value = value;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push(["ramp", value, time]);
    this.value = value;
  }
  setValueCurveAtTime(curve: Float32Array, start: number, duration: number) {
    const end = start + duration;
    if (this.#curves.some((c) => start < c.end && c.start < end)) {
      throw new DOMException("overlapping curve", "NotSupportedError");
    }
    this.#curves.push({ start, end });
    this.events.push(["curve", curve[0], curve.at(-1), start, duration]);
  }
  cancelScheduledValues(time: number) {
    this.events.push(["cancel", time]);
  }
}

class FakeNode extends EventTarget {
  outputs: FakeNode[] = [];
  connect<T extends FakeNode>(node: T): T {
    this.outputs.push(node);
    return node;
  }
  disconnect() {
    this.outputs = [];
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeParam(1);
  startedAt?: number;
  stoppedAt?: number;
  start(time = 0) {
    this.startedAt = time;
  }
  stop(time = 0) {
    this.stoppedAt = time;
  }
}

class FakeContext {
  currentTime = 0;
  state: AudioContextState = "suspended";
  destination = new FakeNode();
  sources: FakeSource[] = [];
  createGain() {
    return new FakeGain();
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  decodeAudioData(_data: ArrayBuffer) {
    return Promise.resolve(fakeBuffer(8));
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

function fakeBuffer(duration: number): AudioBuffer {
  return { duration } as AudioBuffer;
}

function setup() {
  const context = new FakeContext();
  const audio = new GameAudio({ context: context as unknown as AudioContext });
  return { context, audio };
}

/** The gain nodes a BGM source plays through, up to the bus it reaches. */
function chain(source: FakeSource): FakeNode[] {
  const nodes: FakeNode[] = [];
  let node: FakeNode = source;
  while (node.outputs.length > 0) {
    node = node.outputs[0];
    nodes.push(node);
  }
  return nodes;
}

Deno.test("createTrack: defaults to looping the whole buffer", () => {
  const track = createTrack(fakeBuffer(10));
  assertEquals([track.loopStart, track.loopEnd], [0, 10]);
});

Deno.test("createTrack: rejects loop points outside the buffer", () => {
  assertThrows(() => createTrack(fakeBuffer(10), { loopEnd: 11 }), RangeError);
  assertThrows(
    () => createTrack(fakeBuffer(10), { loopStart: 5, loopEnd: 5 }),
    RangeError,
  );
  assertThrows(
    () => createTrack(fakeBuffer(10), { loopStart: -1 }),
    RangeError,
  );
});

Deno.test("playBgm: plays the intro once, then loops between the loop points", () => {
  const { context, audio } = setup();
  const track = createTrack(fakeBuffer(10), { loopStart: 2, loopEnd: 8 });
  context.currentTime = 3;
  audio.playBgm(track);
  const [source] = context.sources;
  assertEquals(
    [source.loop, source.loopStart, source.loopEnd, source.startedAt],
    [true, 2, 8, 3],
  );
  const nodes = chain(source);
  assertEquals(nodes.at(-3), audio.bus("bgm") as unknown as FakeNode);
  assertEquals(nodes.at(-2), audio.bus("master") as unknown as FakeNode);
  assertEquals(nodes.at(-1), context.destination);
  assertEquals(audio.bgm, track);
});

Deno.test("playBgm: asking for the playing track again does nothing, unless restart", () => {
  const { context, audio } = setup();
  const track = createTrack(fakeBuffer(10));
  audio.playBgm(track);
  audio.playBgm(track);
  assertEquals(context.sources.length, 1);
  audio.playBgm(track, { restart: true });
  assertEquals(context.sources.length, 2);
  assertEquals(context.sources[0].stoppedAt, 0);
});

Deno.test("playBgm: crossfades along equal-power curves", () => {
  const { context, audio } = setup();
  audio.playBgm(createTrack(fakeBuffer(10)));
  context.currentTime = 5;
  audio.playBgm(createTrack(fakeBuffer(10)), { fade: 2 });
  const [oldSource, newSource] = context.sources;
  assertEquals(oldSource.stoppedAt, 7);
  const oldFadeOut = chain(oldSource)[1] as FakeGain;
  assertEquals(oldFadeOut.gain.events, [["curve", 1, 0, 5, 2]]);
  const newFadeIn = chain(newSource)[0] as FakeGain;
  assertEquals(newFadeIn.gain.events, [["curve", 0, 1, 5, 2]]);
});

Deno.test("playBgm: switching again mid-fade does not overlap automation", () => {
  const { context, audio } = setup();
  audio.playBgm(createTrack(fakeBuffer(10)), { fade: 2 });
  context.currentTime = 1;
  audio.playBgm(createTrack(fakeBuffer(10)), { fade: 2 });
  context.currentTime = 1.5;
  audio.stopBgm({ fade: 1 });
  assertEquals(context.sources.map((s) => s.stoppedAt), [3, 2.5]);
});

Deno.test("bgmPosition: counts through the intro, then wraps inside the loop", () => {
  const { context, audio } = setup();
  assertEquals(audio.bgmPosition, null);
  audio.playBgm(createTrack(fakeBuffer(10), { loopStart: 2, loopEnd: 6 }));
  context.currentTime = 1;
  assertEquals(audio.bgmPosition, 1);
  context.currentTime = 7;
  assertEquals(audio.bgmPosition, 3);
  context.currentTime = 11;
  assertEquals(audio.bgmPosition, 3);
});

Deno.test("stopBgm: fades out, then stops", () => {
  const { context, audio } = setup();
  audio.playBgm(createTrack(fakeBuffer(10)));
  context.currentTime = 4;
  audio.stopBgm({ fade: 1.5 });
  assertEquals(context.sources[0].stoppedAt, 5.5);
  assertEquals(audio.bgm, null);
  assertEquals(audio.bgmPosition, null);
});

Deno.test("setVolume: sets a bus at once, or ramps it", () => {
  const { context, audio } = setup();
  const bgm = audio.bus("bgm") as unknown as FakeGain;
  audio.setVolume("bgm", 0.5);
  assertEquals(audio.volume("bgm"), 0.5);
  context.currentTime = 2;
  audio.setVolume("bgm", 0.2, { fade: 1 });
  assertEquals(bgm.gain.events.slice(-3), [
    ["cancel", 2],
    ["set", 0.5, 2],
    ["ramp", 0.2, 3],
  ]);
});

Deno.test("playSe: plays once through the se bus, ignoring loop points", () => {
  const { context, audio } = setup();
  const track = createTrack(fakeBuffer(1), { loopStart: 0.5 });
  audio.playSe(track, { volume: 0.3, playbackRate: 2 });
  const [source] = context.sources;
  assertEquals(source.loop, false);
  assertEquals(source.playbackRate.value, 2);
  const [gain, bus] = chain(source) as FakeGain[];
  assertEquals(gain.gain.value, 0.3);
  assertEquals(bus, audio.bus("se") as unknown as FakeGain);
  assertEquals(audio.bgm, null);
});

Deno.test("load: decodes an ArrayBuffer into a track with loop points", async () => {
  const { audio } = setup();
  const track = await audio.load(new ArrayBuffer(0), { loopStart: 1 });
  assertEquals([track.loopStart, track.loopEnd], [1, 8]);
});

Deno.test("pause/resume: suspend and resume the context", async () => {
  const { context, audio } = setup();
  await audio.pause();
  assertEquals([audio.paused, context.state], [true, "suspended"]);
  await audio.resume();
  assertEquals([audio.paused, context.state], [false, "running"]);
});

/// <reference lib="dom" />

import { createTrack, GameAudio, type Track } from "@kuboon/bgm";

/** One section of a tune, one eighth note per entry; `0` is a rest. */
interface Section {
  melody: number[];
  bass: number[];
}

interface Tune {
  name: string;
  bpm: number;
  intro: Section;
  loop: Section;
}

const FIELD: Tune = {
  name: "Field",
  bpm: 132,
  intro: {
    melody: [72, 67, 64, 67, 72, 76, 79, 0],
    bass: [48, 0, 55, 0, 48, 0, 55, 0],
  },
  loop: {
    melody: [
      ...[76, 0, 74, 72, 74, 0, 67, 0],
      ...[72, 74, 76, 77, 79, 0, 0, 0],
      ...[77, 0, 76, 74, 72, 0, 69, 0],
      ...[71, 72, 74, 71, 72, 0, 0, 0],
    ],
    bass: [
      ...[48, 55, 52, 55, 48, 55, 52, 55],
      ...[53, 57, 60, 57, 55, 59, 62, 59],
      ...[53, 57, 60, 57, 57, 60, 64, 60],
      ...[55, 59, 62, 59, 48, 52, 55, 52],
    ],
  },
};

const BATTLE: Tune = {
  name: "Battle",
  bpm: 168,
  intro: {
    melody: [69, 0, 69, 0, 69, 0, 72, 71, 69, 0, 0, 0, 64, 0, 0, 0],
    bass: [45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 40, 40, 40, 40],
  },
  loop: {
    melody: [
      ...[69, 72, 76, 72, 69, 72, 76, 79],
      ...[77, 76, 74, 72, 74, 0, 71, 0],
      ...[69, 72, 76, 72, 69, 72, 76, 81],
      ...[79, 77, 76, 74, 76, 0, 0, 0],
    ],
    bass: [
      ...[45, 57, 45, 57, 45, 57, 45, 57],
      ...[41, 53, 41, 53, 43, 55, 43, 55],
      ...[45, 57, 45, 57, 45, 57, 45, 57],
      ...[40, 52, 40, 52, 40, 52, 40, 52],
    ],
  },
};

type Wave = (phase: number) => number;
const pulse: Wave = (phase) => (phase % 1 < 0.25 ? 1 : -1);
const triangle: Wave = (phase) => 4 * Math.abs((phase % 1) - 0.5) - 1;

function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Mixes one voice into `out`, each note decaying to silence by the end of its step. */
function renderVoice(
  out: Float32Array,
  rate: number,
  offset: number,
  stepLength: number,
  notes: number[],
  wave: Wave,
  gain: number,
): void {
  const attack = rate * 0.005;
  notes.forEach((midi, step) => {
    if (midi === 0) return;
    const start = offset + step * stepLength;
    const frequency = hz(midi);
    for (let i = 0; i < stepLength; i++) {
      const envelope = Math.min(1, i / attack) * (1 - i / stepLength) ** 1.5;
      out[start + i] += gain * envelope * wave(frequency * i / rate);
    }
  });
}

/** Renders intro + loop into one buffer; the loop starts exactly where the intro ends. */
function renderTune(audio: GameAudio, tune: Tune): Track {
  const rate = audio.context.sampleRate;
  const stepLength = Math.round(rate * 60 / tune.bpm / 2);
  const introLength = tune.intro.melody.length * stepLength;
  const length = introLength + tune.loop.melody.length * stepLength;
  const buffer = audio.context.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (
    const [section, offset] of [[tune.intro, 0], [
      tune.loop,
      introLength,
    ]] as const
  ) {
    renderVoice(data, rate, offset, stepLength, section.melody, pulse, 0.12);
    renderVoice(data, rate, offset, stepLength, section.bass, triangle, 0.3);
  }
  return createTrack(buffer, { loopStart: introLength / rate });
}

function renderCoin(audio: GameAudio): Track {
  const rate = audio.context.sampleRate;
  const stepLength = Math.round(rate * 0.08);
  const buffer = audio.context.createBuffer(1, stepLength * 3, rate);
  renderVoice(
    buffer.getChannelData(0),
    rate,
    0,
    stepLength,
    [83, 88, 0],
    pulse,
    0.3,
  );
  return createTrack(buffer);
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function setupBgmDemo(): void {
  const audio = new GameAudio();
  const tunes = new Map<Track, Tune>();
  const tracks: Record<string, Track> = {};
  for (const tune of [FIELD, BATTLE]) {
    const track = renderTune(audio, tune);
    tunes.set(track, tune);
    tracks[tune.name] = track;
  }
  const coin = renderCoin(audio);

  for (
    const button of document.querySelectorAll<HTMLButtonElement>("[data-bgm]")
  ) {
    button.addEventListener("click", () => {
      audio.playBgm(tracks[button.dataset.bgm!], { fade: 1 });
    });
  }
  byId("bgm-stop").addEventListener("click", () => audio.stopBgm({ fade: 1 }));
  byId("bgm-coin").addEventListener("click", () => audio.playSe(coin));

  const pause = byId<HTMLButtonElement>("bgm-pause");
  pause.addEventListener("click", async () => {
    if (audio.paused) await audio.resume();
    else await audio.pause();
    pause.setAttribute("aria-pressed", String(audio.paused));
  });

  for (const bus of ["master", "bgm", "se"] as const) {
    const slider = byId<HTMLInputElement>(`bgm-volume-${bus}`);
    const apply = () => audio.setVolume(bus, Number(slider.value));
    slider.addEventListener("input", apply);
    apply();
  }

  const status = byId("bgm-status");
  const intro = byId("bgm-intro");
  const cursor = byId("bgm-cursor");
  const draw = () => {
    const track = audio.bgm;
    const position = audio.bgmPosition;
    if (track === null || position === null) {
      status.textContent = "Stopped";
      intro.style.width = "0";
      cursor.hidden = true;
    } else {
      const section = position < track.loopStart ? "intro" : "loop";
      status.textContent = `${tunes.get(track)!.name}: ${
        position.toFixed(2)
      }s (${section})`;
      intro.style.width = `${track.loopStart / track.loopEnd * 100}%`;
      cursor.hidden = false;
      cursor.style.left = `${position / track.loopEnd * 100}%`;
    }
    requestAnimationFrame(draw);
  };
  draw();
}

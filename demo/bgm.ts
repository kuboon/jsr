/// <reference lib="dom" />

import { GameAudio, type Instrument, type Track } from "@kuboon/bgm";
import {
  electricGuitar,
  hihat,
  kick,
  musicBox,
  pulse,
  snare,
  triangle,
} from "@kuboon/bgm/instruments";

interface Tune {
  name: string;
  /** `@n` in the MML plays `instruments[n]`. */
  instruments: { name: string; instrument: Instrument }[];
  mml: string;
}

const FIELD: Tune = {
  name: "Field",
  instruments: [
    { name: "musicBox", instrument: musicBox },
    { name: "triangle", instrument: triangle },
    { name: "kick", instrument: kick },
    { name: "hihat", instrument: hihat },
  ],
  mml: `t120
@0 v13 o5 l8 c<geg>ceg r L
  e4dcd4<g4> cdefg4g4 a4gfe4d4 edc<b>c2
  e4dcd4<g4> cdefg4>c4< agfagfed c4<g4>c2;
@1 v13 q6 o3 l4 c g c g L l8
  [cg>c<g]4 [fa>c<a]2 o2[gb>d<b]2
  o3[cg>c<g]4 [fa>c<a]2 o2gb>d<b o3cg>c<g;
@2 v14 r1 L [c4 r4 c4 r4]8;
@3 l8 r1 L [v8c v4c]32`,
};

const BATTLE: Tune = {
  name: "Battle",
  instruments: [
    { name: "electricGuitar", instrument: electricGuitar },
    { name: "pulse(0.25)", instrument: pulse(0.25) },
    { name: "kick", instrument: kick },
    { name: "snare", instrument: snare },
    { name: "hihat", instrument: hihat },
  ],
  mml: `t160
@1 v10 q6 o4 l8 r1 r1 L
  a>cec<a>ceg< >fedcdr<br a>cec<a>cea< >gfede4.r<
  o5c4<b4a4g4 o4fga>cd4c4 o5e4d4c<b>c<a o4g+4e4a2;
@0 v12 q4 l8 o2 a1 r2 g4 e4 L
  [a]8 [f]4[g]4 [a]8 o3[c]8 o2[f]8 [d]8 [a]8 [e]4[a]4;
@0 v10 q4 l8 o3 e1 r2 d4 <b4> L
  [e]8 [c]4[d]4 [e]8 [g]8 [c]8 [a]8 [e]8 <[b]4>[e]4;
@2 v14 c1 r1 L [c4 r4 c8c8 r4]8;
@3 v12 r1 r2 l8 cccc L [r4 c4 r4 c4]8;
@4 l8 r1 r1 L [v9c v5c]32`,
};

const COIN = "t240 v13 l16 o5 b>e4";

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function setupBgmDemo(): void {
  const audio = new GameAudio();
  const names = new Map<Track, string>();
  const coin = audio.compose(COIN, [pulse(0.25)]);

  const editor = byId<HTMLTextAreaElement>("bgm-mml");
  const legend = byId("bgm-instruments");
  const error = byId("bgm-error");
  let selected = FIELD;
  const cache = new Map<Tune, Track>();

  const compose = (tune: Tune, mml: string): Track | null => {
    try {
      const track = audio.compose(
        mml,
        tune.instruments.map((i) => i.instrument),
      );
      names.set(track, tune.name);
      error.textContent = "";
      return track;
    } catch (e) {
      error.textContent = (e as Error).message;
      return null;
    }
  };

  const select = (tune: Tune) => {
    selected = tune;
    editor.value = tune.mml;
    legend.textContent = tune.instruments.map((i, n) => `@${n} ${i.name}`)
      .join("  ");
  };
  select(FIELD);

  for (const tune of [FIELD, BATTLE]) {
    byId(`bgm-${tune.name.toLowerCase()}`).addEventListener("click", () => {
      select(tune);
      let track = cache.get(tune);
      if (track === undefined) {
        track = compose(tune, tune.mml)!;
        cache.set(tune, track);
      }
      audio.playBgm(track, { fade: 1 });
    });
  }
  byId("bgm-play-edited").addEventListener("click", () => {
    const track = compose(selected, editor.value);
    if (track !== null) audio.playBgm(track, { fade: 0.3 });
  });
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
      status.textContent = `${names.get(track)}: ${
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

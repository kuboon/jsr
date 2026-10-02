/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { hastToDom, markdownToHast, tocFromHast } from "@kuboon/md";
import { Qrcode } from "@kuboon/qrcode-gen";
import type { ShareButtonsElement } from "@kuboon/share-element";
import "@kuboon/share-element";
import { createOnboardingTour } from "@kuboon/onboarding-kit/element";
import type { TourScenario } from "@kuboon/onboarding-kit";
import { setupBgmDemo } from "./bgm.ts";

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// --- @kuboon/md ---

const SAMPLE_MARKDOWN = `# Hello, Markdown

GitHub Flavored Markdown: **bold**, ~~strike~~, [links](https://jsr.io/@kuboon/md),
and footnotes[^1].

## Code {#code}

\`\`\`ts
const greet = (name: string): string => \`Hello, \${name}!\`;
console.log(greet("world"));
\`\`\`

## Diagram

\`\`\`mermaid
graph LR
  A[Markdown] --> B[hast]
  B --> C[HTML]
  B --> D[DOM]
  B --> E[TOC]
\`\`\`

## Table and tasks

| Package | Kind |
| ------- | ---- |
| md | converter |
| qrcode-gen | encoder |

- [x] Sanitized output
- [ ] Your idea here

Jump back to [the code](#code).

[^1]: Footnote links work, too.
`;

const mdSource = byId<HTMLTextAreaElement>("md-source");
const mdOutput = byId<HTMLDivElement>("md-output");
const mdToc = byId<HTMLOListElement>("md-toc");
const mdStatus = byId<HTMLParagraphElement>("md-status");

let renderSeq = 0;

async function renderMarkdown(): Promise<void> {
  const seq = ++renderSeq;
  const started = performance.now();
  try {
    const hast = await markdownToHast(mdSource.value, {
      mermaid: matchMedia("(prefers-color-scheme: dark)").matches
        ? { bg: "#151b23", fg: "#e6edf3" }
        : undefined,
    });
    if (seq !== renderSeq) return;
    mdOutput.replaceChildren(hastToDom(hast));
    mdToc.replaceChildren(
      ...tocFromHast(hast).map(({ depth, id, text }) => {
        const li = document.createElement("li");
        li.dataset.depth = String(depth);
        const a = document.createElement("a");
        a.href = `#${id}`;
        a.textContent = text;
        li.append(a);
        return li;
      }),
    );
    mdStatus.textContent = `Rendered in ${
      Math.round(performance.now() - started)
    } ms`;
  } catch (error) {
    if (seq !== renderSeq) return;
    mdStatus.textContent = `Error: ${(error as Error).message}`;
  }
}

let renderTimer: ReturnType<typeof setTimeout> | undefined;
mdSource.value = SAMPLE_MARKDOWN;
mdSource.addEventListener("input", () => {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderMarkdown, 200);
});
void renderMarkdown();

// --- @kuboon/qrcode-gen ---

const QUIET_ZONE = 4;
const qrSvg = byId("qr-svg") as unknown as SVGSVGElement;
const qrText = byId<HTMLInputElement>("qr-text");
const qrStatus = byId<HTMLParagraphElement>("qr-status");

function renderQrcode(): void {
  try {
    const qr = new Qrcode(qrText.value);
    const { size, matrix } = qr.toJSON();
    let d = "";
    matrix.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      })
    );
    const extent = size + QUIET_ZONE * 2;
    qrSvg.setAttribute("viewBox", `0 0 ${extent} ${extent}`);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "#000");
    qrSvg.replaceChildren(path);
    qrStatus.textContent = `Version ${qr.version} (${size}×${size} modules)`;
  } catch (error) {
    qrSvg.replaceChildren();
    qrStatus.textContent = `Error: ${(error as Error).message}`;
  }
}

qrText.addEventListener("input", renderQrcode);
renderQrcode();

// --- @kuboon/share-element ---

const shareButtons = byId<ShareButtonsElement>("share-buttons");
const shareUrl = byId<HTMLInputElement>("share-url");

shareButtons.url = shareUrl.value;
shareUrl.addEventListener("input", () => {
  shareButtons.url = shareUrl.value;
});
// Read the checked radio on load too: a reload can restore the form's state.
function applyShareLang(): void {
  const checked = document.querySelector<HTMLInputElement>(
    "input[name=share-lang]:checked",
  );
  shareButtons.lang = checked?.value ?? "en";
}
for (
  const radio of document.querySelectorAll<HTMLInputElement>(
    "input[name=share-lang]",
  )
) {
  radio.addEventListener("change", applyShareLang);
}
applyShareLang();

// --- @kuboon/bgm ---

setupBgmDemo();

// --- @kuboon/onboarding-kit ---

const scenario: TourScenario = {
  name: "kuboon-jsr-demo",
  version: 2,
  steps: [
    {
      id: "welcome",
      title: "Welcome",
      body: "This page demos five packages. This tour is one of them.",
    },
    {
      id: "nav",
      target: "[data-tour=nav]",
      body: "Jump to any package from here.",
      placement: "bottom-start",
    },
    {
      id: "md",
      target: "[data-tour=md]",
      title: "@kuboon/md",
      body:
        "Edit the Markdown and watch the preview and table of contents update.",
      placement: "top",
    },
    {
      id: "qrcode-gen",
      target: "[data-tour=qrcode-gen]",
      title: "@kuboon/qrcode-gen",
      body: "Type anything to encode it as a QR code.",
      placement: "top",
    },
    {
      id: "share-element",
      target: "[data-tour=share-element]",
      title: "@kuboon/share-element",
      body: "One tag for a row of share buttons.",
      placement: "top",
    },
    {
      id: "bgm",
      target: "[data-tour=bgm]",
      title: "@kuboon/bgm",
      body:
        "Play a tune: its intro plays once, then the loop repeats seamlessly. Switch tunes to hear the crossfade.",
      placement: "top",
    },
    {
      id: "done",
      target: "[data-tour=tour-start]",
      body: "Press this again whenever you want to replay the tour.",
      placement: "bottom-start",
    },
  ],
};

const tour = createOnboardingTour();
document.body.append(tour);

byId<HTMLButtonElement>("tour-start").addEventListener("click", () => {
  if (tour.scenario === null) tour.scenario = scenario;
  void tour.start({ force: true });
});

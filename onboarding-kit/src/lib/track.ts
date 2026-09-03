/**
 * Follows a target's viewport rectangle as it moves — the shared plumbing behind both the
 * spotlight (which must *cover* the target) and {@link ../lib/anchor.ts anchor} (which must sit
 * *beside* it).
 */

import type { TourTarget } from "./types.ts";
import { isElement } from "./dom.ts";

/** Reads a target's current viewport rectangle. */
export function readRect(target: TourTarget): DOMRect {
  if (isElement(target)) return target.getBoundingClientRect();
  return new DOMRect(target.x, target.y, target.width ?? 0, target.height ?? 0);
}

function sameRect(a: DOMRect | null, b: DOMRect): boolean {
  return a !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height;
}

/**
 * Calls `onRect` whenever the target's viewport rectangle changes.
 *
 * Polls on `requestAnimationFrame` and listens for scroll and resize, so a target that moves for
 * any reason — its own animation, a resize, a scroll of any ancestor — is tracked without needing
 * a `ResizeObserver`/`IntersectionObserver` wired up per target.
 *
 * @param target Element or fixed rectangle to follow
 * @param onRect Called immediately, then on every change
 * @returns A function that stops tracking
 */
export function trackRect(
  target: TourTarget,
  onRect: (rect: DOMRect) => void,
): () => void {
  let last: DOMRect | null = null;
  let frame = 0;

  function emit(): void {
    const rect = readRect(target);
    if (sameRect(last, rect)) return;
    last = rect;
    onRect(rect);
  }

  function poll(): void {
    emit();
    frame = requestAnimationFrame(poll);
  }

  function force(): void {
    last = null;
    emit();
  }

  emit();
  frame = requestAnimationFrame(poll);
  globalThis.addEventListener("scroll", force, {
    passive: true,
    capture: true,
  });
  globalThis.addEventListener("resize", force, { passive: true });

  return () => {
    cancelAnimationFrame(frame);
    globalThis.removeEventListener("scroll", force, { capture: true });
    globalThis.removeEventListener("resize", force);
  };
}

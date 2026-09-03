/**
 * Positions a floating element beside a target — the one piece of `@remix-run/ui/anchor` this kit
 * had to bring in-house to stop depending on Remix UI.
 *
 * It is deliberately not a full floating-ui-style engine: it honors the requested placement, flips
 * to the *opposite* side when that would overflow the viewport, and clamps the cross axis into the
 * viewport. It does not cascade through every side in turn — see the README.
 */

import type { TourPlacement, TourTarget } from "./types.ts";
import { trackRect } from "./track.ts";

const VIEWPORT_MARGIN = 8;

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function splitPlacement(
  placement: TourPlacement,
): { side: Side; align: Align } {
  const [side, align] = placement.split("-") as [Side, Align | undefined];
  return { side, align: align ?? "center" };
}

type Size = { width: number; height: number };
type Position = { top: number; left: number };

function place(
  targetRect: DOMRect,
  size: Size,
  side: Side,
  align: Align,
  offset: number,
): Position {
  if (side === "top" || side === "bottom") {
    return {
      top: side === "top"
        ? targetRect.top - size.height - offset
        : targetRect.bottom + offset,
      left: align === "start"
        ? targetRect.left
        : align === "end"
        ? targetRect.right - size.width
        : targetRect.left + targetRect.width / 2 - size.width / 2,
    };
  }
  return {
    left: side === "left"
      ? targetRect.left - size.width - offset
      : targetRect.right + offset,
    top: align === "start"
      ? targetRect.top
      : align === "end"
      ? targetRect.bottom - size.height
      : targetRect.top + targetRect.height / 2 - size.height / 2,
  };
}

function overflows(side: Side, pos: Position, size: Size): boolean {
  if (side === "top") return pos.top < 0;
  if (side === "bottom") return pos.top + size.height > globalThis.innerHeight;
  if (side === "left") return pos.left < 0;
  return pos.left + size.width > globalThis.innerWidth;
}

function clamp(pos: Position, size: Size): Position {
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    globalThis.innerHeight - size.height - VIEWPORT_MARGIN,
  );
  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    globalThis.innerWidth - size.width - VIEWPORT_MARGIN,
  );
  return {
    top: Math.min(Math.max(pos.top, VIEWPORT_MARGIN), maxTop),
    left: Math.min(Math.max(pos.left, VIEWPORT_MARGIN), maxLeft),
  };
}

/** Options for {@link anchor}. */
export type AnchorOptions = {
  placement: TourPlacement;
  /** Gap in pixels between the target and the floating element. */
  offset: number;
};

/**
 * Positions `floatingEl` (which must be `position: fixed`) beside `target`, re-positioning it as
 * the target moves, and returns a function that stops tracking.
 *
 * `floatingEl`'s own size is read fresh on every update, so its `max-width`/`max-height` should
 * already be set — by its stylesheet, not by this function — before this is called.
 */
export function anchor(
  floatingEl: HTMLElement,
  target: TourTarget,
  options: AnchorOptions,
): () => void {
  const { side, align } = splitPlacement(options.placement);

  return trackRect(target, (targetRect) => {
    const size = floatingEl.getBoundingClientRect();

    let chosenSide = side;
    let pos = place(targetRect, size, chosenSide, align, options.offset);
    if (overflows(chosenSide, pos, size)) {
      chosenSide = OPPOSITE[side];
      pos = place(targetRect, size, chosenSide, align, options.offset);
    }
    pos = clamp(pos, size);

    floatingEl.style.top = `${pos.top}px`;
    floatingEl.style.left = `${pos.left}px`;
  });
}

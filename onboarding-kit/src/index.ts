/**
 * A product tour: a spotlight walkthrough whose scenario is JSON.
 *
 * This entry is the headless half — step order, target resolution, keyboard control and
 * completion — and renders nothing. Import `@kuboon/onboarding-kit/element` for the
 * `<onboarding-tour>` custom element that draws it.
 */

export { createTour, isTourVisible, resolveStepOptions } from "./lib/tour.ts";
export type { Tour, TourEventMap, TourOptions } from "./lib/tour.ts";
export { localStorageTourStore, memoryTourStore } from "./lib/store.ts";
export type { TourStore } from "./lib/store.ts";
export { readRect, trackRect } from "./lib/track.ts";
export { anchor } from "./lib/anchor.ts";
export type { AnchorOptions } from "./lib/anchor.ts";
export type {
  TourLabels,
  TourPlacement,
  TourPoint,
  TourScenario,
  TourState,
  TourStatus,
  TourStep,
  TourStepDefaults,
  TourStopReason,
  TourTarget,
  TourWhenMissing,
} from "./lib/types.ts";

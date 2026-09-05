/**
 * The one place the headless core touches a DOM constructor directly.
 *
 * The headless entry has to be importable where there is no DOM — a test runner, a server render —
 * so `instanceof HTMLElement` is never written bare: the constructor itself is absent there, and a
 * bare check would throw a ReferenceError rather than return false.
 */

/**
 * True when the value is a live element rather than a fixed rectangle or nothing at all.
 *
 * `Element`, not `HTMLElement`: a tour points at whatever is on the page, and plenty of pages draw
 * the interesting part — a chart, a diagram, a game board — in SVG. Everything the kit asks of a
 * target (`getBoundingClientRect`, `getClientRects`, `checkVisibility`, `scrollIntoView`) is
 * `Element`'s, so narrowing to HTML only ever excluded targets that would have worked.
 */
export function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

/**
 * True when the element actually has a box on the page.
 *
 * "The selector matched" and "there is something to point at" are different questions. A
 * responsive app keeps both layouts' chrome in the DOM and hides one of them with
 * `display: none` — a phone's bottom bar and a desktop's side rail say the same thing in two
 * elements, and only one is up at a time. Spotlighting the hidden one draws a zero-sized rectangle
 * in the corner of the screen and anchors the tooltip to it.
 *
 * So an unrendered match counts as a miss, and the step's `whenMissing` decides what happens
 * next. That is what lets one scenario name both layouts and stay correct in either.
 */
export function isRendered(element: Element): boolean {
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({
      contentVisibilityAuto: true,
      visibilityProperty: true,
    });
  }
  return element.getClientRects().length > 0;
}

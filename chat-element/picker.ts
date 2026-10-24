/**
 * Pointing at something on the page.
 *
 * "This button here" is most of what a person means when they ask about a screen, and the words
 * for it are the part they do not have. {@link pickElement} lets them click it instead: the page
 * is highlighted under the pointer, the click is swallowed rather than acted on, and what comes
 * back is the element. {@link elementPath} turns that into a CSS selector the model can read and a
 * tool can `querySelector()` again.
 *
 * **Only the path leaves.** No text, no attribute values beyond an `id`, no form contents: a page
 * the person is signed in to is full of things they did not mean to send, and pointing at a row of
 * a table is not consent to send the row. Whatever the model needs to know about the element after
 * that is a tool's to read, under the page's own rules.
 *
 * @module
 */

import type { ClientTool } from "./session.ts";

/**
 * A CSS selector that finds this element again, and says roughly where it is.
 *
 * Built from tag names, `:nth-of-type()` where a tag repeats among its siblings, and an `id` where
 * one is unique in the element's tree — at which point the path stops, because everything above a
 * unique id is noise. Class names are left out: they change with every deploy of a CSS-in-JS
 * site, and they say more about the page's styling than about where the thing is.
 *
 * Inside a shadow root the path is relative to that root; there is no selector that crosses one.
 *
 * @param element The element to describe
 * @returns A selector, such as `main > form:nth-of-type(2) > button`
 *
 * @example
 * ```ts ignore
 * elementPath(document.querySelector("#save")!); // "#save"
 * ```
 */
export function elementPath(element: Element): string {
  const root = element.getRootNode() as ParentNode;
  const steps: string[] = [];

  for (
    let current: Element | null = element;
    current !== null;
    current = current.parentElement
  ) {
    const id = current.id;
    if (id !== "" && PLAIN_ID.test(id)) {
      if (root.querySelectorAll(`[id="${id}"]`).length === 1) {
        steps.unshift(`#${id}`);
        break;
      }
    }

    const tag = current.localName;
    steps.unshift(tag + nthOfType(current));
    if (tag === "body" || tag === "html") break;
  }

  return steps.join(" > ");
}

/**
 * The ids that need no escaping in a selector.
 *
 * Every other id would need `CSS.escape()`, which is not everywhere a path is built, and the
 * fallback — tag names from the parent down — is a correct selector anyway.
 */
const PLAIN_ID = /^[A-Za-z][\w-]*$/;

/** `:nth-of-type(n)` when the tag repeats among its siblings, nothing when it does not. */
function nthOfType(element: Element): string {
  const parent = element.parentElement;
  if (parent === null) return "";

  let index = 0;
  let count = 0;
  for (const sibling of parent.children) {
    if (sibling.localName !== element.localName) continue;
    count++;
    if (sibling === element) index = count;
  }
  return count > 1 ? `:nth-of-type(${index})` : "";
}

/** Options for {@link pickElement}. */
export interface PickElementOptions {
  /**
   * Elements that cannot be picked, together with everything inside them — the chat itself,
   * usually, so that the panel is not the first thing under the pointer.
   */
  ignore?: readonly Element[];
  /** Ends the pick, resolving `null`. */
  signal?: AbortSignal;
  /** What the hint under the highlight says. Defaults to the path of the hovered element. */
  hint?: (element: Element) => string;
}

/**
 * Lets the person click an element on the page, and resolves with it.
 *
 * While it runs, whatever is under the pointer is outlined, and the next click — or `Enter` — picks
 * it. The click goes no further: a link is not followed and a button does not submit, because the
 * person was pointing, not pressing. `Escape`, or the signal, ends it with `null`.
 *
 * The highlight is a fixed overlay that takes no pointer events, so the page's own layout and
 * hover styles are left alone.
 *
 * @param options What cannot be picked, and how to stop
 * @returns The element, or `null` if the pick was cancelled
 *
 * @example
 * ```ts ignore
 * const element = await pickElement({ ignore: [panel] });
 * if (element) composer.value += elementPath(element);
 * ```
 */
export function pickElement(
  options: PickElementOptions = {},
): Promise<Element | null> {
  const { ignore = [], signal, hint = elementPath } = options;
  if (signal?.aborted) return Promise.resolve(null);

  return new Promise((resolve) => {
    const doc = document;
    const box = doc.createElement("div");
    box.setAttribute("aria-hidden", "true");
    box.style.cssText = BOX_STYLE;
    const label = doc.createElement("div");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = LABEL_STYLE;
    doc.documentElement.append(box, label);

    const previousCursor = doc.documentElement.style.cursor;
    doc.documentElement.style.cursor = "crosshair";

    let current: Element | null = null;

    const pickable = (target: EventTarget | null): Element | null => {
      if (!(target instanceof Element)) return null;
      if (target === box || target === label) return null;
      if (ignore.some((ignored) => ignored.contains(target))) return null;
      return target;
    };

    const show = (element: Element | null) => {
      current = element;
      if (element === null) {
        box.style.display = "none";
        label.style.display = "none";
        return;
      }
      const rect = element.getBoundingClientRect();
      Object.assign(box.style, {
        display: "block",
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      label.textContent = hint(element);
      Object.assign(label.style, {
        display: "block",
        top: `${Math.min(rect.bottom + 4, innerHeight - 28)}px`,
        left: `${Math.max(0, Math.min(rect.left, innerWidth - 320))}px`,
      });
    };

    const finish = (element: Element | null) => {
      for (const [type, listener] of listeners) {
        removeEventListener(type, listener, true);
      }
      signal?.removeEventListener("abort", abort);
      box.remove();
      label.remove();
      doc.documentElement.style.cursor = previousCursor;
      resolve(element);
    };

    const abort = () => finish(null);

    /** Keeps the event from the page — it was a point, not a press. */
    const swallow = (event: Event) => {
      if (pickable(event.target) === null) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    };

    const listeners: [string, EventListener][] = [
      ["pointermove", (event) => show(pickable(event.target))],
      ["pointerdown", swallow],
      ["mousedown", swallow],
      ["pointerup", swallow],
      ["mouseup", swallow],
      ["click", (event) => {
        if (swallow(event)) finish(pickable(event.target));
      }],
      // The page moves under a still pointer; the outline follows what is now there.
      ["scroll", () => current && show(current)],
      ["keydown", (event) => {
        const key = (event as KeyboardEvent).key;
        if (key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(null);
        } else if (key === "Enter" && current !== null) {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(current);
        }
      }],
    ];

    for (const [type, listener] of listeners) {
      addEventListener(type, listener, true);
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

const BOX_STYLE = [
  "position: fixed",
  "display: none",
  "z-index: 2147483647",
  "pointer-events: none",
  "box-sizing: border-box",
  "outline: 2px solid Highlight",
  "background: color-mix(in srgb, Highlight 15%, transparent)",
].join("; ");

const LABEL_STYLE = [
  "position: fixed",
  "display: none",
  "z-index: 2147483647",
  "pointer-events: none",
  "max-width: 320px",
  "overflow: hidden",
  "text-overflow: ellipsis",
  "white-space: nowrap",
  "padding: 2px 6px",
  "border-radius: 4px",
  "font: 12px/1.5 ui-monospace, monospace",
  "background: Highlight",
  "color: HighlightText",
].join("; ");

/** Options for {@link pickElementTool}. */
export interface PickElementToolOptions {
  /** What the tool is called. Defaults to `pick_element`. */
  name?: string;
  /**
   * The elements that cannot be picked. A function, because the chat it is usually the panel of
   * may not exist yet when the tool is made.
   */
  ignore?: () => readonly Element[];
}

/**
 * A tool the model calls to have the person point at something.
 *
 * The answer is the element's {@link elementPath} and nothing else — see the module notes for why
 * the contents stay on the page.
 *
 * A modal dialog makes the rest of the page inert, so this works from a non-modal chat only.
 *
 * @param options What it is called, and what cannot be picked
 * @returns The tool, for a session's `tools`
 */
export function pickElementTool(
  options: PickElementToolOptions = {},
): ClientTool {
  return {
    name: options.name ?? "pick_element",
    description:
      "Asks the person to click an element on the page they are looking at, and returns its CSS " +
      "selector path. Only the path comes back, never the element's contents. Use it when they " +
      'refer to something on screen ("this button", "the box over here") and you need to know ' +
      "which one. Tell them you are asking them to point at it before calling this.",
    inputSchema: { type: "object", properties: {} },
    run: async (_input, signal) => {
      const element = await pickElement({
        ignore: options.ignore?.() ?? [],
        signal,
      });
      if (element === null) return "The person did not pick an element.";
      return elementPath(element);
    },
  };
}

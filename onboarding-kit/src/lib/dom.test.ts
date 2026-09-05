import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { isElement, isRendered } from "./dom.ts";

/**
 * There is no DOM here, so these check the two things that survive its absence: that `isElement`
 * says no rather than throwing, and that `isRendered` asks the element the right question. The
 * element itself is a stand-in — both branches only ever call methods, never construct anything.
 */
function stub(shape: Partial<Element>): Element {
  return shape as Element;
}

describe("isElement", () => {
  it("is false, not a ReferenceError, where Element does not exist", () => {
    expect(isElement(stub({}))).toBe(false);
    expect(isElement(null)).toBe(false);
  });
});

describe("isRendered", () => {
  it("asks checkVisibility when the browser has it", () => {
    expect(isRendered(stub({ checkVisibility: () => true }))).toBe(true);
    expect(isRendered(stub({ checkVisibility: () => false }))).toBe(false);
  });

  it("passes the options that make visibility and content-visibility count", () => {
    let seen: CheckVisibilityOptions | undefined;
    isRendered(stub({
      checkVisibility: (options?: CheckVisibilityOptions) => {
        seen = options;
        return true;
      },
    }));

    expect(seen?.visibilityProperty).toBe(true);
    expect(seen?.contentVisibilityAuto).toBe(true);
  });

  it("falls back to client rects, so a display:none match reads as absent", () => {
    const laidOut = stub({
      getClientRects: () => [{}] as unknown as DOMRectList,
    });
    const hidden = stub({ getClientRects: () => [] as unknown as DOMRectList });

    expect(isRendered(laidOut)).toBe(true);
    expect(isRendered(hidden)).toBe(false);
  });
});

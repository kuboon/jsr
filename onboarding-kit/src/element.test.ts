import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import {
  createOnboardingTour,
  DEFAULT_TAG_NAME,
  defineOnboardingTour,
} from "./element.ts";

/**
 * The overlay needs a browser, so what is left to test here is the thing that has to hold *outside*
 * one: that importing this module on a server is harmless. An app's component file is evaluated
 * twice — once by the SSG build or SSR render, once in the browser — and a module that reaches for
 * `HTMLElement` while being defined takes the whole build down with it.
 */
describe("importing the element without a DOM", () => {
  it("registers nothing and says so", () => {
    expect(defineOnboardingTour()).toBe(false);
    expect(defineOnboardingTour("some-other-tag")).toBe(false);
  });

  it("names the tag it registers, so nobody has to hard-code the string", () => {
    expect(DEFAULT_TAG_NAME).toBe("onboarding-tour");
  });

  it("fails loudly only when something actually asks for an element", () => {
    expect(() => createOnboardingTour()).toThrow(/needs a DOM/);
  });
});

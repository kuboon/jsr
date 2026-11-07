import { assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import {
  appleMapUrl,
  googleMapUrl,
  mapProvider,
  nativeMapUrl,
  zoomToSpan,
} from "./mod.ts";

const USER_AGENTS = {
  iPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iPadMini:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // iPadOS Safari asks for desktop sites by default, with a Mac user agent.
  iPadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
};

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };

Deno.test("mapProvider: Apple Maps on iPhone, iPad and Mac", () => {
  for (
    const ua of ["iPhone", "iPadMini", "iPadDesktopMode", "macChrome"] as const
  ) {
    assertEquals(mapProvider(USER_AGENTS[ua]), "apple", ua);
  }
});

Deno.test("mapProvider: Google Maps everywhere else, including no user agent", () => {
  assertEquals(mapProvider(USER_AGENTS.androidChrome), "google");
  assertEquals(mapProvider(USER_AGENTS.windowsEdge), "google");
  assertEquals(mapProvider(""), "google");
});

Deno.test("googleMapUrl: center and zoom", () => {
  assertEquals(
    googleMapUrl({ ...TOKYO, zoom: 16 }),
    "https://www.google.com/maps/@?api=1&map_action=map&center=35.681236,139.767125&zoom=16",
  );
});

Deno.test("googleMapUrl: zoom is rounded into 0-21, and omitted when not given", () => {
  assertEquals(googleMapUrl({ ...TOKYO, zoom: 30 }).endsWith("&zoom=21"), true);
  assertEquals(googleMapUrl({ ...TOKYO, zoom: -3 }).endsWith("&zoom=0"), true);
  assertEquals(
    googleMapUrl({ ...TOKYO, zoom: 12.6 }).endsWith("&zoom=13"),
    true,
  );
  assertEquals(
    googleMapUrl(TOKYO),
    "https://www.google.com/maps/@?api=1&map_action=map&center=35.681236,139.767125",
  );
});

Deno.test("appleMapUrl: center, and a span only when zoom is given", () => {
  assertEquals(
    appleMapUrl(TOKYO),
    "https://maps.apple.com/frame?center=35.681236,139.767125",
  );
  assertEquals(
    appleMapUrl({ ...TOKYO, zoom: 16 }),
    "https://maps.apple.com/frame?center=35.681236,139.767125&span=0.008924,0.010986",
  );
});

Deno.test("coordinates are written with at most six decimals", () => {
  assertEquals(
    googleMapUrl({ latitude: 1.23456789, longitude: -100 }),
    "https://www.google.com/maps/@?api=1&map_action=map&center=1.234568,-100",
  );
});

Deno.test("zoomToSpan: halves with each zoom step, narrower in latitude away from the equator", () => {
  const [, at10] = zoomToSpan(10, 0);
  const [, at11] = zoomToSpan(11, 0);
  assertAlmostEquals(at10 / at11, 2);
  const [equatorLat, equatorLng] = zoomToSpan(10, 0);
  assertAlmostEquals(equatorLat, equatorLng);
  const [northLat, northLng] = zoomToSpan(10, 60);
  assertAlmostEquals(northLat, northLng / 2);
});

Deno.test("zoomToSpan: never exceeds the whole world", () => {
  assertEquals(zoomToSpan(0, 0), [180, 360]);
});

Deno.test("out-of-range coordinates are refused", () => {
  assertThrows(() => googleMapUrl({ latitude: 91, longitude: 0 }), RangeError);
  assertThrows(() => appleMapUrl({ latitude: 0, longitude: -181 }), RangeError);
  assertThrows(() => appleMapUrl({ latitude: NaN, longitude: 0 }), RangeError);
  assertThrows(
    () => googleMapUrl({ latitude: 0, longitude: 0, zoom: NaN }),
    RangeError,
  );
});

Deno.test("nativeMapUrl: picks the URL by user agent", () => {
  const place = { ...TOKYO, zoom: 15 };
  assertEquals(nativeMapUrl(place, USER_AGENTS.iPhone), appleMapUrl(place));
  assertEquals(
    nativeMapUrl(place, USER_AGENTS.androidChrome),
    googleMapUrl(place),
  );
});

Deno.test("nativeMapUrl: defaults to navigator.userAgent", () => {
  assertEquals(
    nativeMapUrl(TOKYO),
    nativeMapUrl(TOKYO, globalThis.navigator.userAgent),
  );
});

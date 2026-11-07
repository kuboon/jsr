/**
 * A map link that opens the platform's own map app: Apple Maps on Apple
 * devices, Google Maps everywhere else.
 *
 * Both are universal links — `https://maps.apple.com/...` and
 * `https://www.google.com/maps/...` — so the app opens where it is
 * installed, and the web version where it is not. Nothing here needs a DOM;
 * {@linkcode nativeMapUrl} only reads `navigator.userAgent` when you do not
 * pass one, so it also works on a server with the request's `User-Agent`.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { nativeMapUrl } from "@kuboon/native-map-url";
 *
 * const tokyoStation = { latitude: 35.681236, longitude: 139.767125, zoom: 16 };
 * const iphone =
 *   "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
 * assertEquals(
 *   nativeMapUrl(tokyoStation, iphone),
 *   "https://maps.apple.com/frame?center=35.681236,139.767125&span=0.008924,0.010986",
 * );
 * ```
 *
 * @module
 */

/** Where to center the map. */
export interface MapLocation {
  /** Degrees, -90 to 90. */
  latitude: number;
  /** Degrees, -180 to 180. */
  longitude: number;
  /**
   * Google Maps' zoom level: 0 is the whole world, 21 single buildings, and
   * each step halves the view. Omit it to leave the app at its default.
   */
  zoom?: number;
}

/** Which map app a link opens. */
export type MapProvider = "apple" | "google";

/** Up to six decimals (about 10 cm), without trailing zeros. */
function format(value: number): string {
  return String(Number(value.toFixed(6)));
}

function check({ latitude, longitude, zoom }: MapLocation): void {
  if (!(latitude >= -90 && latitude <= 90)) {
    throw new RangeError(`latitude must be within -90..90, got ${latitude}`);
  }
  if (!(longitude >= -180 && longitude <= 180)) {
    throw new RangeError(
      `longitude must be within -180..180, got ${longitude}`,
    );
  }
  if (zoom !== undefined && !Number.isFinite(zoom)) {
    throw new RangeError(`zoom must be a number, got ${zoom}`);
  }
}

/** Google's zoom range; it also bounds the span conversion. */
const MIN_ZOOM = 0;
const MAX_ZOOM = 21;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The area a Google-style zoom level shows, as Apple's `span`: degrees of
 * latitude and longitude.
 *
 * An approximation, by design. In Web Mercator one 256-pixel tile covers
 * `360 / 2^zoom` degrees of longitude; the span assumes a view two tiles
 * (512 px) across. A degree of latitude takes more screen the further it is
 * from the equator, so the latitude span shrinks by `cos(latitude)`. Phone
 * screens and Apple's own framing differ enough that "about the same view" is
 * as close as a link can get anyway.
 *
 * @returns `[latitudeDelta, longitudeDelta]`
 */
export function zoomToSpan(
  zoom: number,
  latitude: number,
): [number, number] {
  const longitudeDelta = Math.min(360, 720 / 2 ** clampZoom(zoom));
  const latitudeDelta = Math.min(
    180,
    longitudeDelta * Math.cos(latitude * Math.PI / 180),
  );
  return [latitudeDelta, longitudeDelta];
}

/** A link that opens Apple Maps (the app on Apple devices, the web elsewhere). */
export function appleMapUrl(location: MapLocation): string {
  check(location);
  const { latitude, longitude, zoom } = location;
  let url = `https://maps.apple.com/frame?center=${format(latitude)},${
    format(longitude)
  }`;
  if (zoom !== undefined) {
    const [latitudeDelta, longitudeDelta] = zoomToSpan(zoom, latitude);
    url += `&span=${format(latitudeDelta)},${format(longitudeDelta)}`;
  }
  return url;
}

/** A link that opens Google Maps (the app where installed, the web elsewhere). */
export function googleMapUrl(location: MapLocation): string {
  check(location);
  const { latitude, longitude, zoom } = location;
  let url = `https://www.google.com/maps/@?api=1&map_action=map&center=${
    format(latitude)
  },${format(longitude)}`;
  if (zoom !== undefined) url += `&zoom=${Math.round(clampZoom(zoom))}`;
  return url;
}

/**
 * Which map app a user agent should get: Apple Maps on iPhone, iPad, iPod and
 * Mac, Google Maps on everything else.
 *
 * `Macintosh` covers the Mac and also the iPad, whose Safari has reported a
 * Mac user agent by default since iPadOS 13.
 */
export function mapProvider(userAgent: string): MapProvider {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent) ? "apple" : "google";
}

/**
 * A link to `location` in the map app that suits `userAgent` — see
 * {@linkcode mapProvider}.
 *
 * @param userAgent Defaults to `navigator.userAgent`, or Google Maps where there is none
 */
export function nativeMapUrl(
  location: MapLocation,
  userAgent: string = globalThis.navigator?.userAgent ?? "",
): string {
  return mapProvider(userAgent) === "apple"
    ? appleMapUrl(location)
    : googleMapUrl(location);
}

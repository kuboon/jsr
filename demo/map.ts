/// <reference lib="dom" />

import {
  appleMapUrl,
  googleMapUrl,
  type MapLocation,
  mapProvider,
  nativeMapUrl,
} from "@kuboon/native-map-url";

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function setupMapDemo(): void {
  const latitude = byId<HTMLInputElement>("map-latitude");
  const longitude = byId<HTMLInputElement>("map-longitude");
  const zoom = byId<HTMLInputElement>("map-zoom");
  const zoomValue = byId("map-zoom-value");
  const native = byId<HTMLAnchorElement>("map-native");
  const apple = byId<HTMLAnchorElement>("map-apple");
  const google = byId<HTMLAnchorElement>("map-google");
  const status = byId("map-status");

  const provider = mapProvider(navigator.userAgent);
  byId("map-provider").textContent = provider === "apple"
    ? "Apple Maps"
    : "Google Maps";

  const update = () => {
    zoomValue.textContent = zoom.value;
    const location: MapLocation = {
      latitude: Number(latitude.value),
      longitude: Number(longitude.value),
      zoom: Number(zoom.value),
    };
    try {
      native.href = nativeMapUrl(location);
      apple.href = apple.textContent = appleMapUrl(location);
      google.href = google.textContent = googleMapUrl(location);
      status.textContent = "";
    } catch (error) {
      for (const link of [native, apple, google]) link.removeAttribute("href");
      status.textContent = (error as Error).message;
    }
  };
  for (const input of [latitude, longitude, zoom]) {
    input.addEventListener("input", update);
  }
  update();
}

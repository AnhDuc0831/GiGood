/** Minimal point shared by the fake-map projection (no map SDK). */
export type LatLng = { lat: number; lng: number }

/** Q1 center fallback — same coords the API seed uses. */
export const Q1_CENTER: LatLng = { lat: 10.7769, lng: 106.7009 }

/** Default geo query radius in km (API default; max 50). */
export const DEFAULT_RADIUS_KM = 30

/** Visible half-span of the demo map in degrees (~5.5km). */
export const MAP_SPAN_DEG = 0.05

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Linear projection around `center`; returns 0-100 percentages
 * (x = east, y = south) used as absolute `%` positions on the demo visual.
 */
export function projectToPercent(
  point: LatLng,
  center: LatLng = Q1_CENTER,
  span = MAP_SPAN_DEG,
): { left: number; top: number } {
  return {
    left: 50 + ((point.lng - center.lng) / span) * 50,
    top: 50 - ((point.lat - center.lat) / span) * 50,
  }
}

/** Inverse of `projectToPercent` (no clamping) — used by the post location picker. */
export function unprojectFromPercent(
  leftPercent: number,
  topPercent: number,
  center: LatLng = Q1_CENTER,
  span = MAP_SPAN_DEG,
): LatLng {
  return {
    lat: center.lat - ((topPercent - 50) / 50) * span,
    lng: center.lng + ((leftPercent - 50) / 50) * span,
  }
}

const EARTH_RADIUS_KM = 6371.0088

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Haversine distance in km, rounded to 2 decimals like the API. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  const km = EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return Math.round(km * 100) / 100
}

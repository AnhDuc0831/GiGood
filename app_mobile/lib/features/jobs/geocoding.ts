import * as Location from 'expo-location'
import { Q1_CENTER, type LatLng } from './geo'

/**
 * Chuyển đổi địa chỉ dạng chữ thành toạ độ (Latitude, Longitude).
 * Thử bằng expo-location của thiết bị trước, nếu không được sẽ fallback sang OpenStreetMap Nominatim.
 */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (!address || !address.trim()) return null
  const clean = address.trim()

  // 1. Thử qua Native Geocoder của máy (Apple Maps trên iOS / Google trên Android)
  try {
    const results = await Location.geocodeAsync(clean)
    if (results && results.length > 0) {
      return {
        lat: results[0].latitude,
        lng: results[0].longitude,
      }
    }
  } catch {
    // Bỏ qua lỗi native (thường gặp trên máy ảo hoặc khi chưa cấp quyền)
  }

  // 2. Fallback sang OpenStreetMap Nominatim API
  try {
    const query = clean.toLowerCase().includes('việt nam') || clean.toLowerCase().includes('vietnam')
      ? clean
      : `${clean}, Việt Nam`
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'GiGood-App/1.0',
      },
    })
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      }
    }
  } catch {
    // Bỏ qua nếu mất mạng
  }

  return null
}

/**
 * Chuyển toạ độ (Latitude, Longitude) thành địa chỉ chữ có thể đọc được.
 */
export async function reverseGeocodeCoords(coords: LatLng): Promise<string | null> {
  // 1. Thử qua Native Reverse Geocoder của máy
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    })
    if (results && results.length > 0) {
      const item = results[0]
      const parts = [
        item.name || item.streetNumber,
        item.street,
        item.district || item.subregion,
        item.city || item.region,
      ].filter(Boolean)
      if (parts.length > 0) {
        return parts.join(', ')
      }
    }
  } catch {
    // Fallback
  }

  // 2. Fallback sang OpenStreetMap Nominatim API
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json`
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'GiGood-App/1.0',
      },
    })
    const data = await res.json()
    if (data?.display_name) {
      const segments = data.display_name.split(',')
      return segments.slice(0, 3).join(',').trim()
    }
  } catch {
    // Bỏ qua nếu mất mạng
  }

  return null
}

export type CompletedAddressResult = {
  completedAddress: string
  coords?: LatLng | null
  found: boolean
}

/** Chuẩn hoá chuỗi tiếng Việt để so sánh (bỏ dấu, chuyển thường) */
function normalizeVi(str?: string | null): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/**
 * Kiểm tra địa chỉ qua Map API (Photon Komoot & Nominatim & Native),
 * nếu có địa chỉ đó trên bản đồ thì tự động điền các phần còn thiếu (quận/huyện, tỉnh/thành phố).
 * Ví dụ: "289, Nguyễn Hồng Ánh, Hoà Xuân" -> "289, Nguyễn Hồng Ánh, Hoà Xuân, Đà Nẵng".
 */
export async function completeAddressWithMapApi(rawAddress: string): Promise<CompletedAddressResult> {
  if (!rawAddress || !rawAddress.trim()) {
    return { completedAddress: rawAddress, coords: null, found: false }
  }

  const clean = rawAddress.trim()

  // 1. Thử gọi Photon Map API (OpenStreetMap geocoding engine nhanh, chính xác cao tại VN)
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=1`
    const res = await fetch(url)
    const data = await res.json()
    if (data?.features && data.features.length > 0) {
      const feat = data.features[0]
      const props = feat.properties || {}
      const coords: LatLng | null = feat.geometry?.coordinates
        ? { lng: feat.geometry.coordinates[0], lat: feat.geometry.coordinates[1] }
        : null

      const city = props.city || props.state
      const district = props.district || props.county

      let completed = clean
      const normInput = normalizeVi(clean)

      // Bổ sung quận/huyện nếu chưa có trong input
      if (district) {
        const cleanDist = normalizeVi(district).replace(/phuong|quan|huyen|xa/g, '').trim()
        if (cleanDist && !normInput.includes(cleanDist)) {
          completed = `${completed}, ${district}`
        }
      }

      // Bổ sung tỉnh/thành phố nếu chưa có trong input
      if (city) {
        const cleanCity = normalizeVi(city).replace(/thanh pho|tp|tinh/g, '').trim()
        if (cleanCity && !normInput.includes(cleanCity)) {
          completed = `${completed}, ${city}`
        }
      }

      return {
        completedAddress: completed,
        coords,
        found: true,
      }
    }
  } catch {
    // Bỏ qua lỗi mạng photon
  }

  // 2. Thử Native Geocoder và Reverse Geocoder của máy
  try {
    const results = await Location.geocodeAsync(clean)
    if (results && results.length > 0) {
      const coords = { lat: results[0].latitude, lng: results[0].longitude }
      const reverse = await reverseGeocodeCoords(coords)
      if (reverse) {
        let completed = clean
        const normInput = normalizeVi(clean)
        const parts = reverse.split(',').map((p) => p.trim())
        for (const p of parts) {
          const normP = normalizeVi(p)
          if (normP && !normInput.includes(normP) && !normalizeVi(completed).includes(normP)) {
            completed = `${completed}, ${p}`
          }
        }
        return { completedAddress: completed, coords, found: true }
      }
      return { completedAddress: clean, coords, found: true }
    }
  } catch {
    // Fallback
  }

  return { completedAddress: clean, coords: null, found: false }
}

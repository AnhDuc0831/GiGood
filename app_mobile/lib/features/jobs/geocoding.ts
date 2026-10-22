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

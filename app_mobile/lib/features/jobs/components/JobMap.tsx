import { useState, useMemo } from 'react'
import {
  Pressable,
  Text,
  TouchableOpacity,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
} from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { FontAwesome } from '@expo/vector-icons'
import type { JobModel } from '../types'
import { CATEGORY_META } from '../../../categories'
import { formatVnd } from '../../../format'
import {
  clamp,
  projectToPercent,
  Q1_CENTER,
  unprojectFromPercent,
  type LatLng,
} from '../geo'

type JobMapProps = {
  jobs: JobModel[]
  /** Projection center; defaults to the Q1 fallback. */
  center?: LatLng
  /** Device position — drawn as the teal "you are here" dot. */
  userPosition?: LatLng | null
  /** Highlighted job id (marker emphasis). */
  selectedId?: string | null
  /** Signed-in user id; their own jobs get an orange marker. */
  currentUserId?: string | null
  onSelectJob?: (id: string) => void
  /** Tap-to-pick mode used by the post location picker. */
  pickMode?: boolean
  onPick?: (coords: LatLng) => void
  /** Highlighted pick marker in `pickMode`. */
  pickedPoint?: LatLng | null
  height?: number
  className?: string
}

function asPercent(value: number): DimensionValue {
  return `${value}%` as DimensionValue
}

function generateLeafletHtml(
  center: LatLng,
  jobs: JobModel[],
  pickMode: boolean,
  pickedPoint?: LatLng | null,
  userPosition?: LatLng | null,
  selectedId?: string | null,
  currentUserId?: string | null,
) {
  const initialLat = pickedPoint?.lat ?? userPosition?.lat ?? center.lat
  const initialLng = pickedPoint?.lng ?? userPosition?.lng ?? center.lng
  const initialZoom = pickMode ? 15 : 13

  const validJobs = jobs.filter((j) => j.lat != null && j.lng != null)

  const jobsJson = JSON.stringify(
    validJobs.map((j) => ({
      id: j.id,
      title: j.title.replace(/'/g, "\\'"),
      price: formatVnd(j.price),
      lat: j.lat,
      lng: j.lng,
      isOwn: !!currentUserId && j.owner.id === currentUserId,
      isSelected: j.id === selectedId,
    }))
  )

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #f3f4f6; }
    #map { width: 100%; height: 100%; }
    .user-dot {
      width: 14px; height: 14px; background: #0d9488; border: 2.5px solid white; border-radius: 50%;
      box-shadow: 0 0 10px rgba(13, 148, 136, 0.8);
    }
    .job-pin {
      width: 24px; height: 24px; background: #0d9488; border: 2px solid white; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .job-pin.own { background: #f97316; }
    .job-pin.selected { background: #ef4444; transform: scale(1.25); box-shadow: 0 0 10px rgba(239, 68, 68, 0.8); }
    .pick-pin {
      width: 28px; height: 28px; background: #ef4444; border: 2.5px solid white; border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg); box-shadow: 0 3px 8px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
    }
    .pick-inner {
      width: 9px; height: 9px; background: white; border-radius: 50%;
    }
    .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .leaflet-popup-content { margin: 10px 14px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([${initialLat}, ${initialLng}], ${initialZoom});

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    var pickMode = ${pickMode ? 'true' : 'false'};
    var pickMarker = null;

    if (pickMode) {
      var pickIcon = L.divIcon({
        className: 'custom-pick-icon',
        html: '<div class="pick-pin"><div class="pick-inner"></div></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      });

      ${
        pickedPoint
          ? `pickMarker = L.marker([${pickedPoint.lat}, ${pickedPoint.lng}], { icon: pickIcon, draggable: true }).addTo(map);
             pickMarker.on('dragend', function(e) {
               var pos = e.target.getLatLng();
               sendMsg({ type: 'pick', lat: pos.lat, lng: pos.lng });
             });`
          : ''
      }

      map.on('click', function(e) {
        var lat = e.latlng.lat;
        var lng = e.latlng.lng;
        if (!pickMarker) {
          pickMarker = L.marker([lat, lng], { icon: pickIcon, draggable: true }).addTo(map);
          pickMarker.on('dragend', function(ev) {
            var pos = ev.target.getLatLng();
            sendMsg({ type: 'pick', lat: pos.lat, lng: pos.lng });
          });
        } else {
          pickMarker.setLatLng([lat, lng]);
        }
        sendMsg({ type: 'pick', lat: lat, lng: lng });
      });
    } else {
      ${
        userPosition
          ? `var userIcon = L.divIcon({
               className: 'custom-user-icon',
               html: '<div class="user-dot"></div>',
               iconSize: [14, 14],
               iconAnchor: [7, 7]
             });
             L.marker([${userPosition.lat}, ${userPosition.lng}], { icon: userIcon }).addTo(map).bindPopup('<b>Vị trí của bạn</b>');`
          : ''
      }

      var jobs = ${jobsJson};
      jobs.forEach(function(job) {
        var pinClass = 'job-pin' + (job.isOwn ? ' own' : '') + (job.isSelected ? ' selected' : '');
        var icon = L.divIcon({
          className: 'custom-job-icon',
          html: '<div class="' + pinClass + '">💼</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        var m = L.marker([job.lat, job.lng], { icon: icon }).addTo(map);
        var popupHtml = '<div style="font-size:12px;">' +
          '<b>' + job.title + '</b><br/>' +
          '<span style="color:#0d9488; font-weight:bold;">' + job.price + '</span><br/>' +
          '<button onclick="selectJob(\\'' + job.id + '\\')" style="margin-top:6px; background:#0d9488; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; cursor:pointer;">Xem chi tiết</button>' +
          '</div>';
        m.bindPopup(popupHtml);
        m.on('click', function() {
          sendMsg({ type: 'select', id: job.id });
        });
      });
    }

    function selectJob(id) {
      sendMsg({ type: 'select', id: id });
    }

    function sendMsg(obj) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    }
  </script>
</body>
</html>
`
}

export function JobMap({
  jobs,
  center = Q1_CENTER,
  userPosition,
  selectedId,
  currentUserId,
  onSelectJob,
  pickMode = false,
  onPick,
  pickedPoint,
  height = 200,
  className = '',
}: JobMapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [useRealMap, setUseRealMap] = useState(true)

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height: layoutHeight } = event.nativeEvent.layout
    setSize({ width, height: layoutHeight })
  }

  const handlePick = (x: number, y: number) => {
    if (!pickMode || !onPick || size.width <= 0 || size.height <= 0) return
    onPick(unprojectFromPercent((x / size.width) * 100, (y / size.height) * 100, center))
  }

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.type === 'pick' && typeof data.lat === 'number' && typeof data.lng === 'number') {
        onPick?.({ lat: data.lat, lng: data.lng })
      } else if (data.type === 'select' && typeof data.id === 'string') {
        onSelectJob?.(data.id)
      }
    } catch {
      // ignore
    }
  }

  const leafletHtml = useMemo(
    () =>
      generateLeafletHtml(
        center,
        jobs,
        pickMode,
        pickedPoint,
        userPosition,
        selectedId,
        currentUserId,
      ),
    [center, jobs, pickMode, pickedPoint?.lat, pickedPoint?.lng, userPosition?.lat, userPosition?.lng, selectedId, currentUserId]
  )

  const markers = jobs
    .filter((job) => job.lat != null && job.lng != null)
    .map((job) => {
      const point = projectToPercent({ lat: job.lat as number, lng: job.lng as number }, center)
      return {
        job,
        left: clamp(point.left, 6, 94),
        top: clamp(point.top, 8, 92),
      }
    })

  const you = projectToPercent(userPosition ?? center, center)
  const picked = pickedPoint ? projectToPercent(pickedPoint, center) : null

  // Khung lưới mô phỏng (Grid Canvas) dùng khi offline hoặc chuyển chế độ
  const canvas = (
    <>
      <View className="absolute inset-0 opacity-40" pointerEvents="none">
        <View className="absolute top-[25%] left-0 right-0 h-px bg-gray-300" />
        <View className="absolute top-[55%] left-0 right-0 h-px bg-gray-300" />
        <View className="absolute top-[83%] left-0 right-0 h-px bg-gray-300" />
        <View className="absolute left-[22%] top-0 bottom-0 w-px bg-gray-300" />
        <View className="absolute left-[55%] top-0 bottom-0 w-px bg-gray-300" />
        <View className="absolute left-[80%] top-0 bottom-0 w-px bg-gray-300" />
      </View>

      <View className="absolute inset-0" pointerEvents="none">
        <View
          className="absolute items-center justify-center"
          style={{
            left: asPercent(clamp(you.left, 4, 96)),
            top: asPercent(clamp(you.top, 5, 95)),
            width: 28,
            height: 28,
            marginLeft: -14,
            marginTop: -14,
          }}
        >
          <View className="absolute w-7 h-7 rounded-full bg-teal-600/30" />
          <View className="w-3.5 h-3.5 rounded-full bg-teal-600 border-2 border-white" />
        </View>

        {picked && (
          <View
            className="absolute items-center justify-center"
            style={{
              left: asPercent(picked.left),
              top: asPercent(picked.top),
              width: 26,
              height: 26,
              marginLeft: -13,
              marginTop: -13,
            }}
          >
            <View className="absolute w-6 h-6 rounded-full bg-orange-500/25" />
            <View className="w-5 h-5 rounded-full bg-orange-500 border-2 border-white items-center justify-center">
              <FontAwesome name="check" size={8} color="white" />
            </View>
          </View>
        )}
      </View>

      <View className="absolute inset-0" pointerEvents={pickMode ? 'none' : 'box-none'}>
        {markers.map(({ job, left, top }) => {
          const isOwn = !!currentUserId && job.owner.id === currentUserId
          const selected = job.id === selectedId
          return (
            <TouchableOpacity
              key={job.id}
              disabled={pickMode}
              activeOpacity={0.8}
              onPress={() => onSelectJob?.(job.id)}
              hitSlop={8}
              className="absolute items-center justify-center"
              style={{
                left: asPercent(left),
                top: asPercent(top),
                width: 36,
                height: 36,
                marginLeft: -18,
                marginTop: -18,
                zIndex: selected ? 30 : 10,
                elevation: selected ? 6 : 3,
              }}
            >
              {selected && (
                <View
                  className={`absolute rounded-full ${isOwn ? 'bg-orange-500/25' : 'bg-teal-600/25'}`}
                  style={{ width: 34, height: 34 }}
                />
              )}
              <View
                className={`rounded-full items-center justify-center border-2 border-white ${
                  isOwn ? 'bg-orange-500' : 'bg-teal-600'
                } ${selected ? 'w-8 h-8' : 'w-6 h-6'}`}
              >
                <FontAwesome
                  name={
                    (CATEGORY_META[job.category]?.icon || 'wrench') as keyof typeof FontAwesome.glyphMap
                  }
                  size={selected ? 11 : 9}
                  color="white"
                />
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      {pickMode && (
        <View className="absolute bottom-2 left-0 right-0 items-center" pointerEvents="none">
          <View className="bg-white/90 rounded-full px-2.5 py-1 shadow">
            <Text className="text-[10px] font-bold text-gray-600">Chạm lưới để chọn toạ độ</Text>
          </View>
        </View>
      )}
    </>
  )

  const containerClass = `w-full rounded-2xl overflow-hidden border border-gray-200 bg-stone-100 relative ${className}`

  return (
    <View onLayout={handleLayout} className={containerClass} style={{ height }}>
      {useRealMap ? (
        <WebView
          originWhitelist={['*']}
          source={{ html: leafletHtml }}
          onMessage={handleWebViewMessage}
          onError={() => setUseRealMap(false)}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          style={{ width: '100%', height: '100%', backgroundColor: '#f3f4f6' }}
        />
      ) : (
        pickMode ? (
          <Pressable
            onPress={(event) =>
              handlePick(event.nativeEvent.locationX, event.nativeEvent.locationY)
            }
            className="w-full h-full"
          >
            {canvas}
          </Pressable>
        ) : (
          canvas
        )
      )}

      {/* Nút chuyển đổi giữa Bản đồ thật và Lưới mô phỏng */}
      <TouchableOpacity
        onPress={() => setUseRealMap(!useRealMap)}
        activeOpacity={0.8}
        className="absolute top-2 right-2 z-30 bg-white/90 px-2 py-1 rounded-full shadow border border-gray-200 flex-row items-center"
      >
        <FontAwesome name={useRealMap ? "globe" : "th"} size={10} color="#0d9488" />
        <Text className="text-[9px] font-bold text-gray-700 ml-1">
          {useRealMap ? "Bản đồ thật" : "Lưới"}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

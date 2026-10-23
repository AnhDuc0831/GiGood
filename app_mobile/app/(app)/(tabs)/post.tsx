import { useAuth } from '../../../hooks/useAuth'
import { Redirect } from 'expo-router'
import { VTextInput } from '../../../components/ui/VTextInput';
import { useState, useEffect } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { useJobs } from '../../../hooks/useJobs'
import { useKeyboard } from '../../../hooks/useKeyboard'
import { useDeviceLocation } from '../../../hooks/useDeviceLocation'
import { useUi } from '../../../hooks/useUi'
import { Category } from '../../../types'
import { CATEGORY_META } from '../../../lib/categories'
import { JobMap } from '../../../lib/features/jobs/components/JobMap'
import { Q1_CENTER, type LatLng } from '../../../lib/features/jobs/geo'
import { geocodeAddress, reverseGeocodeCoords } from '../../../lib/features/jobs/geocoding'
import { getApiErrorMessage } from '../../../lib/features/jobs/api'
import { colors } from '../../../constants/theme'
import { useAi } from '../../../lib/features/ai/context/AiContext'

const TEMPLATES: { cat: Category; title: string; budget: number; desc: string }[] = [
  {
    cat: 'delivery',
    title: 'Giao tài liệu & đồ án gấp',
    budget: 50000,
    desc: 'Cần bạn giao nhanh tập tài liệu và bản vẽ đồ án từ trường về phòng trọ (~3km), giao cẩn thận tránh làm rách hoặc nhăn giấy tờ.',
  },
  {
    cat: 'helper',
    title: 'Phụ chuyển đồ phòng trọ',
    budget: 120000,
    desc: 'Cần 1 bạn sinh viên phụ bê vác đồ đạc nhẹ (vali quần áo, sách vở, quạt máy) sang phòng trọ mới gần trường.',
  },
  {
    cat: 'cleaning',
    title: 'Dọn dẹp phòng trọ / KTX',
    budget: 120000,
    desc: 'Cần bạn sinh viên phụ quét dọn phòng trọ, lau sàn, rửa bát và gom rác sạch sẽ, thời gian khoảng 1.5 - 2 tiếng.',
  },
  {
    cat: 'repair',
    title: 'Vệ sinh laptop & cài Win/Office',
    budget: 100000,
    desc: 'Cần bạn am hiểu máy tính hỗ trợ vệ sinh quạt tản nhiệt laptop, tra keo và cài đặt lại bộ phần mềm học tập cơ bản.',
  },
  {
    cat: 'helper',
    title: 'Đóng gói hàng & dán tem shop',
    budget: 90000,
    desc: 'Cần bạn sinh viên phụ phân loại hàng hóa, dán tem mã vận đơn và đóng gói đơn hàng Shopee tại shop trong ca 2-3 tiếng.',
  },
  {
    cat: 'delivery',
    title: 'Mua hộ & giao đồ ăn trưa',
    budget: 40000,
    desc: 'Nhờ một bạn tiện đường mua hộ 2 phần cơm trưa và trà sữa đem lên phòng KTX/phòng trọ giúp mình.',
  },
]

const MAX_IMAGES = 5

export default function PostScreen() {
  const { currentRole } = useAuth()
  if (currentRole === 'tasker') {
    return <Redirect href="/(app)/(tabs)/board" />
  }

  const { createJob, uploadImage } = useJobs()
  const { showToast } = useUi()
  const { openAi, activeDraft, clearDraft } = useAi()

  useEffect(() => {
    if (activeDraft) {
      setTitle(activeDraft.title)
      setCategory(activeDraft.category)
      setDescription(activeDraft.description)
      setBudget(String(activeDraft.estimatedPrice))
      setUrgent(activeDraft.isUrgent)
      clearDraft()
      showToast('Đã điền tự động nội dung từ GiGood AI!', 'success')
    }
  }, [activeDraft, clearDraft, showToast])
  const { position, request: requestDevicePosition } = useDeviceLocation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { keyboardHeight, isKeyboardVisible } = useKeyboard()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('repair')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [location, setLocation] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedCoords, setPickedCoords] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    void requestDevicePosition()
  }, [requestDevicePosition])

  const toggleLocationPicker = () => {
    const next = !pickerOpen
    setPickerOpen(next)
    if (next) void requestDevicePosition()
  }

  const handleUseCurrentLocation = async () => {
    setLocating(true)
    try {
      const pos = await requestDevicePosition()
      const target = pos ?? position
      if (target) {
        setPickedCoords(target)
        const addr = await reverseGeocodeCoords(target)
        if (addr) setLocation(addr)
        showToast('Đã định vị vị trí hiện tại!', 'success')
      } else {
        showToast('Chưa lấy được GPS. Vui lòng bật định vị trên thiết bị.', 'error')
      }
    } catch {
      showToast('Không thể lấy vị trí.', 'error')
    } finally {
      setLocating(false)
    }
  }

  const handlePickOnMap = async (coords: LatLng) => {
    setPickedCoords(coords)
    const addr = await reverseGeocodeCoords(coords)
    if (addr && (!location.trim() || location === 'Chưa có địa chỉ')) {
      setLocation(addr)
    }
  }

  const applyTemplate = (cat: Category, t: string, b: number, desc?: string) => {
    setCategory(cat)
    setTitle(t)
    setBudget(String(b))
    if (desc) {
      setDescription(desc)
    }
  }

  const pickImage = async () => {
    if (images.length >= MAX_IMAGES) {
      showToast(`Tối đa ${MAX_IMAGES} ảnh cho mỗi công việc.`, 'error')
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      showToast('Cần quyền truy cập thư viện ảnh để đính kèm ảnh.', 'error')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0]) return
    setImages(prev => [...prev, result.assets[0].uri].slice(0, MAX_IMAGES))
  }

  const removeImage = (uri: string) => {
    setImages(prev => prev.filter(item => item !== uri))
  }

  const handlePost = async () => {
    if (submitting) return
    if (!title.trim() || !description.trim() || !budget || !location.trim()) {
      showToast('Vui lòng điền đầy đủ thông tin bắt buộc.', 'error')
      return
    }
    if (title.trim().length < 5) {
      showToast('Tiêu đề phải có ít nhất 5 ký tự.', 'error')
      return
    }
    const price = parseInt(budget.replace(/[^0-9]/g, ''), 10)
    if (isNaN(price) || price < 10000) {
      showToast('Mức giá không hợp lệ.', 'error')
      return
    }

    setSubmitting(true)
    try {
      const uploaded: string[] = []
      for (const uri of images) {
        uploaded.push(await uploadImage(uri))
      }

      // Tự động tìm toạ độ: Ưu tiên điểm chấm trên map -> Geocode từ chữ địa chỉ -> GPS máy -> Q1_CENTER
      let finalCoords = pickedCoords
      if (!finalCoords && location.trim()) {
        finalCoords = await geocodeAddress(location.trim())
      }
      if (!finalCoords) {
        finalCoords = position ?? Q1_CENTER
      }

      const job = await createJob({
        title: title.trim(),
        description: description.trim(),
        category,
        price,
        locationText: location.trim(),
        lat: finalCoords.lat,
        lng: finalCoords.lng,
        images: uploaded,
        isUrgent: urgent,
      })
      setTitle('')
      setDescription('')
      setBudget('')
      setLocation('')
      setUrgent(false)
      setImages([])
      setPickedCoords(null)
      setPickerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      showToast('Đăng việc thành công! Đang tìm Tasker phù hợp...', 'success')
      router.push(`/(app)/job/${job.id}`)
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Không thể đăng việc. Vui lòng thử lại.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const catEntries = Object.entries(CATEGORY_META) as [Category, { label: string; icon: string }][]

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        className="flex-1 px-4 py-4"
        contentContainerStyle={{ paddingBottom: isKeyboardVisible ? keyboardHeight + 80 : 160 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4">
        <Text className="text-lg font-extrabold text-gray-800">Đăng việc mới</Text>
        <Text className="text-xs text-gray-500">Mô tả rõ để Tasker phù hợp nhất nhận việc nhanh hơn</Text>
      </View>

      {/* AI Assistant Banner */}
      <TouchableOpacity
        onPress={() => openAi()}
        className="bg-orange-50/80 border border-orange-200 rounded-2xl p-3 mb-4 flex-row items-center justify-between"
      >
        <View className="flex-row items-center space-x-2.5 flex-1 mr-2">
          <View className="w-8 h-8 rounded-xl bg-orange-500 items-center justify-center">
            <FontAwesome name="magic" size={13} color="white" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-extrabold text-orange-950">
              ✨ Trợ lý AI: Tự động viết & điền bài đăng
            </Text>
            <Text className="text-[10px] text-orange-800 mt-0.5">
              Nhập yêu cầu (ví dụ: Code bài tập Java, Python, Dọn trọ...), AI sẽ tự tạo mô tả và điền form cho bạn!
            </Text>
          </View>
        </View>
        <View className="bg-orange-500 px-3 py-1.5 rounded-xl">
          <Text className="text-white text-[11px] font-bold">Thử ngay</Text>
        </View>
      </TouchableOpacity>

      <View className="space-y-2 mb-4">
        <Text className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Mẫu việc nhanh cho học sinh, sinh viên</Text>
        <View className="flex-row flex-wrap">
          {TEMPLATES.map((t, idx) => (
            <TouchableOpacity key={idx} onPress={() => applyTemplate(t.cat, t.title, t.budget, t.desc)}
              className="p-3 rounded-xl border border-gray-200 bg-white active:border-orange-500 mb-2.5 mr-2.5"
              style={{ width: '47%' }}>
              <FontAwesome name={(CATEGORY_META[t.cat]?.icon || 'wrench') as keyof typeof FontAwesome.glyphMap} size={14} color={colors.orange} style={{ marginBottom: 6 }} />
              <Text className="text-[11px] font-bold text-gray-700 leading-tight" numberOfLines={2}>{t.title}</Text>
              <Text className="text-[11px] font-bold text-teal-600 mt-1">{t.budget.toLocaleString('vi-VN')}đ</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="space-y-4">
        <View className="space-y-1.5">
          <Text className="text-xs font-bold text-gray-700">Tên công việc <Text className="text-red-500">*</Text></Text>
          <VTextInput value={title} onChangeText={setTitle} placeholder="Ví dụ: Giao tài liệu gấp, phụ dọn phòng trọ..."
            placeholderTextColor={colors.grayMuted} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" />
        </View>

        <View className="space-y-1.5">
          <Text className="text-xs font-bold text-gray-700">Nhóm công việc</Text>
          <View className="flex-row flex-wrap gap-2">
            {catEntries.map(([key, meta]) => (
              <TouchableOpacity key={key} onPress={() => setCategory(key)}
                className="px-3 py-2 rounded-xl border border-gray-200"
                style={category === key ? { backgroundColor: colors.orangeSoft, borderColor: colors.orangeBorder } : undefined}>
                <Text className={`text-xs font-bold ${category === key ? 'text-orange-500' : 'text-gray-600'}`}>{meta.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="space-y-1.5">
          <Text className="text-xs font-bold text-gray-700">Mô tả công việc chi tiết <Text className="text-red-500">*</Text></Text>
          <VTextInput value={description} onChangeText={setDescription} placeholder="Ghi rõ yêu cầu, thời gian, địa điểm để các bạn nhận việc dễ nắm bắt..."
            placeholderTextColor={colors.grayMuted} multiline numberOfLines={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" style={{ minHeight: 80, textAlignVertical: 'top' }} />
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Mức giá đề xuất <Text className="text-red-500">*</Text></Text>
            <View className="relative">
              <VTextInput value={budget} onChangeText={setBudget} placeholder="100" placeholderTextColor={colors.grayMuted}
                keyboardType="number-pad" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" />
              <Text className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">VNĐ</Text>
            </View>
          </View>
          <View className="flex-1 space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Mức độ ưu tiên</Text>
            <TouchableOpacity onPress={() => setUrgent(!urgent)}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 items-center justify-center"
              style={[{ minHeight: 44 }, urgent ? { backgroundColor: colors.orangeSoft, borderColor: colors.orangeBorder } : undefined]}>
              <Text className={`text-xs font-bold ${urgent ? 'text-orange-500' : 'text-gray-600'}`}>
                {urgent ? 'Cần liền (15 Token)' : 'Bình thường (10 Token)'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="space-y-1.5">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-xs font-bold text-gray-700">Địa điểm thực hiện <Text className="text-red-500">*</Text></Text>
            <View className="flex-row items-center space-x-2 gap-2">
              <TouchableOpacity
                onPress={handleUseCurrentLocation}
                disabled={locating}
                hitSlop={6}
                className="flex-row items-center bg-teal-50 px-2 py-1 rounded-lg border border-teal-200"
              >
                {locating ? (
                  <ActivityIndicator size="small" color={colors.teal} style={{ transform: [{ scale: 0.6 }] }} />
                ) : (
                  <FontAwesome name="crosshairs" size={10} color={colors.teal} />
                )}
                <Text className="text-[10px] font-bold text-teal-700 ml-1">Vị trí hiện tại</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleLocationPicker} hitSlop={6} className="flex-row items-center bg-gray-50 px-2 py-1 rounded-lg border border-gray-200">
                <FontAwesome name="map-o" size={10} color={colors.teal} />
                <Text className="text-[10px] font-bold text-teal-700 ml-1">
                  {pickerOpen ? 'Ẩn bản đồ' : 'Bản đồ'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View className="relative">
            <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
              <FontAwesome name="map-marker" size={12} color={colors.grayMuted} />
            </View>
            <VTextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Số nhà, đường, quận, thành phố..."
              placeholderTextColor={colors.grayMuted}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm"
            />
          </View>
          {pickerOpen && (
            <View className="space-y-1.5 mt-2">
              <JobMap
                jobs={[]}
                center={pickedCoords ?? position ?? Q1_CENTER}
                userPosition={position}
                pickMode
                pickedPoint={pickedCoords}
                onPick={handlePickOnMap}
                height={220}
              />
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-[11px] text-gray-500">
                  {pickedCoords
                    ? `📍 Toạ độ: ${pickedCoords.lat.toFixed(5)}, ${pickedCoords.lng.toFixed(5)}`
                    : 'Chạm hoặc kéo ghim trên bản đồ để chọn toạ độ chính xác.'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View className="space-y-1.5">
          <Text className="text-xs font-bold text-gray-700">Hình ảnh đính kèm (tuỳ chọn)</Text>
          <View className="flex-row flex-wrap">
            {images.map(uri => (
              <View key={uri} className="relative mr-2.5 mb-2.5">
                <Image source={{ uri }} className="w-20 h-20 rounded-xl border border-gray-200" />
                <TouchableOpacity
                  onPress={() => removeImage(uri)}
                  accessibilityRole="button"
                  accessibilityLabel="Xoá ảnh đính kèm"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 items-center justify-center"
                >
                  <FontAwesome name="times" size={10} color="white" />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < MAX_IMAGES && (
              <TouchableOpacity
                onPress={pickImage}
                accessibilityRole="button"
                accessibilityLabel="Thêm ảnh đính kèm"
                className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 items-center justify-center"
              >
                <FontAwesome name="camera" size={16} color={colors.grayMuted} />
                <Text className="text-[10px] text-gray-400 mt-1">Thêm ảnh</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View className="bg-teal-50 border border-teal-100 rounded-xl p-3 flex-row items-start space-x-2.5">
          <FontAwesome name="shield" size={14} color={colors.teal} style={{ marginTop: 2 }} />
          <Text className="text-[11px] text-teal-800 leading-relaxed flex-1">
            Số tiền sẽ được GiGood giữ ký quỹ an toàn ngay khi có Tasker nhận việc, chỉ giải ngân khi bạn xác nhận hoàn thành.
          </Text>
        </View>

        <TouchableOpacity onPress={handlePost} disabled={submitting}
          className={`w-full bg-orange-500 py-3.5 rounded-2xl flex-row items-center justify-center space-x-2 active:opacity-90 ${submitting ? 'opacity-60' : ''}`}>
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <FontAwesome name="paper-plane" size={12} color="white" />
              <Text className="text-white text-sm font-bold">Đăng việc & Tìm Tasker ngay</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

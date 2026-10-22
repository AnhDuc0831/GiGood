import { VTextInput } from '../../components/ui/VTextInput';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FontAwesome } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../hooks/useAuth'
import { useKeyboard } from '../../hooks/useKeyboard'
import { useGiGood } from '../../lib/GiGoodContext'
import { colors } from '../../constants/theme'
import { useState } from 'react'
import { Category, Availability, Vehicle } from '../../types'
import { CATEGORY_META, AVAILABILITY_LABEL, VEHICLE_LABEL } from '../../lib/categories'

const SKILLS: { key: Category; icon: keyof typeof FontAwesome.glyphMap }[] = [
  { key: 'repair', icon: 'wrench' },
  { key: 'cleaning', icon: 'trash' },
  { key: 'delivery', icon: 'motorcycle' },
  { key: 'helper', icon: 'handshake-o' },
]

export default function SignupTaskerProfileScreen() {
  const router = useRouter()
  const { state, dispatch } = useGiGood()
  const { signUpTasker } = useAuth()
  const { keyboardHeight, isKeyboardVisible } = useKeyboard()
  const basicInfo = state.auth.pendingBasicInfo
  const [selectedSkills, setSelectedSkills] = useState<Category[]>([])
  const [bio, setBio] = useState('')
  const [availability, setAvailability] = useState<Availability>('all-day')
  const [vehicle, setVehicle] = useState<Vehicle>('motorbike')
  const [showAvailability, setShowAvailability] = useState(false)
  const [showVehicle, setShowVehicle] = useState(false)

  const toggleSkill = (sk: Category) => {
    setSelectedSkills(prev =>
      prev.includes(sk) ? prev.filter(s => s !== sk) : [...prev, sk]
    )
  }

  const handleSubmit = async () => {
    if (selectedSkills.length === 0) return
    const info = basicInfo || { name: '', phone: '', location: '', password: '' }
    try {
      await signUpTasker(info.name, info.phone, info.password, info.location, {
        skills: selectedSkills,
        bio: bio || 'Tasker mới gia nhập GiGood, sẵn sàng nhận việc trong khu vực.',
        availability,
        vehicle,
        verified: false,
      })
      dispatch({ type: 'SET_TEMP_SIGNUP_INFO', payload: null })
      router.replace('/(app)')
    } catch {
      Alert.alert('Đăng ký thất bại', 'Không thể tạo tài khoản. Vui lòng kiểm tra lại thông tin.')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pb-4 flex-row items-center space-x-3 border-b border-gray-200">
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          className="w-9 h-9 rounded-full bg-stone-100 items-center justify-center"
        >
          <FontAwesome name="arrow-left" size={14} color={colors.grayIcon} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-base text-gray-800">Hồ sơ năng lực Tasker</Text>
          <Text className="text-[11px] text-teal-600 font-bold">Bước 2/2 — Xây dựng chân dung của bạn</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          className="flex-1 px-5 py-6"
          contentContainerStyle={{ paddingBottom: isKeyboardVisible ? keyboardHeight + 40 : 120 }}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        <View className="flex-row space-x-1.5 mb-5">
          <View className="h-1.5 rounded-full flex-1 bg-teal-600" />
          <View className="h-1.5 rounded-full flex-1 bg-teal-600" />
        </View>

        <View className="bg-teal-50 border border-teal-100 rounded-2xl p-3.5 flex-row items-start space-x-2.5 mb-5">
          <FontAwesome name="info-circle" size={14} color={colors.teal} style={{ marginTop: 2 }} />
          <Text className="text-[11px] text-teal-800 leading-relaxed flex-1">
            Hồ sơ này giúp hệ thống AI gợi ý đúng việc phù hợp với bạn, và giúp Seeker tin tưởng chọn bạn hơn.
          </Text>
        </View>

        <View className="space-y-5">
          <View className="flex-row items-center space-x-3">
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150' }}
              className="w-16 h-16 rounded-2xl border-2 border-teal-600" />
            <View>
              <Text className="font-bold text-sm text-gray-700">Ảnh đại diện</Text>
              <Text className="text-xs text-gray-400">Ảnh thật giúp tăng độ tin cậy (demo: ảnh mẫu)</Text>
            </View>
          </View>

          <View className="space-y-2">
            <Text className="text-xs font-bold text-gray-700">Bạn mạnh ở lĩnh vực nào? <Text className="text-red-500">*</Text></Text>
            <Text className="text-[10px] text-gray-400">Chọn ít nhất 1 nhóm để hệ thống gợi ý việc phù hợp</Text>
            <View className="flex-row flex-wrap">
              {SKILLS.map(sk => {
                const active = selectedSkills.includes(sk.key)
                return (
                  <TouchableOpacity key={sk.key} onPress={() => toggleSkill(sk.key)}
                    className="flex-row items-center space-x-2 p-3 rounded-xl border-2 border-gray-200 mb-2.5 mr-2.5"
                    style={active ? { borderColor: colors.teal, backgroundColor: colors.tealLight } : undefined}>
                    <FontAwesome name={sk.icon} size={14} color={active ? colors.teal : colors.grayMuted} />
                    <Text className={`text-xs font-bold ${active ? 'text-teal-600' : 'text-gray-700'}`}>
                      {CATEGORY_META[sk.key].label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Giới thiệu ngắn về bạn</Text>
            <VTextInput value={bio} onChangeText={setBio} placeholder="VD: Mình có 2 năm kinh nghiệm sửa chữa điện nước..."
              placeholderTextColor={colors.grayMuted} multiline numberOfLines={3}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm" style={{ minHeight: 80, textAlignVertical: 'top' }} />
          </View>

          <View className="space-y-2">
            <Text className="text-xs font-bold text-gray-700">Bạn thường rảnh nhận việc khi nào? <Text className="text-red-500">*</Text></Text>
            <TouchableOpacity onPress={() => setShowAvailability(!showAvailability)}
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 flex-row items-center justify-between bg-white">
              <Text className="text-sm text-gray-700">{AVAILABILITY_LABEL[availability as keyof typeof AVAILABILITY_LABEL]}</Text>
              <FontAwesome name="chevron-down" size={12} color={colors.grayMuted} />
            </TouchableOpacity>
            {showAvailability && (
              <View className="border border-gray-200 rounded-2xl overflow-hidden">
                {(Object.entries(AVAILABILITY_LABEL) as [string, string][]).map(([key, label]) => (
                  <TouchableOpacity key={key} onPress={() => { setAvailability(key as Availability); setShowAvailability(false) }}
                    className="px-4 py-3 border-b border-gray-100"
                    style={availability === key ? { backgroundColor: colors.tealLight } : undefined}>
                    <Text className={`text-sm ${availability === key ? 'text-teal-600 font-bold' : 'text-gray-700'}`}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View className="space-y-2">
            <Text className="text-xs font-bold text-gray-700">Phương tiện di chuyển</Text>
            <TouchableOpacity onPress={() => setShowVehicle(!showVehicle)}
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 flex-row items-center justify-between bg-white">
              <Text className="text-sm text-gray-700">{VEHICLE_LABEL[vehicle as keyof typeof VEHICLE_LABEL]}</Text>
              <FontAwesome name="chevron-down" size={12} color={colors.grayMuted} />
            </TouchableOpacity>
            {showVehicle && (
              <View className="border border-gray-200 rounded-2xl overflow-hidden">
                {(Object.entries(VEHICLE_LABEL) as [string, string][]).map(([key, label]) => (
                  <TouchableOpacity key={key} onPress={() => { setVehicle(key as Vehicle); setShowVehicle(false) }}
                    className="px-4 py-3 border-b border-gray-100"
                    style={vehicle === key ? { backgroundColor: colors.tealLight } : undefined}>
                    <Text className={`text-sm ${vehicle === key ? 'text-teal-600 font-bold' : 'text-gray-700'}`}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View className="bg-stone-50 border border-gray-200 rounded-2xl p-3.5 flex-row items-start space-x-2.5">
            <FontAwesome name="id-card" size={14} color={colors.grayMuted} style={{ marginTop: 2 }} />
            <View className="flex-1">
              <Text className="text-xs font-bold text-gray-700">Xác thực danh tính (CCCD)</Text>
              <Text className="text-[10px] text-gray-400 mt-0.5">Có thể bổ sung sau trong phần Hồ sơ.</Text>
            </View>
            <Text className="text-[10px] font-bold text-amber-500">Chưa xác thực</Text>
          </View>

          <TouchableOpacity onPress={handleSubmit}
            className="w-full bg-teal-600 py-3.5 rounded-2xl flex-row items-center justify-center space-x-2 active:opacity-90">
            <FontAwesome name="check-circle" size={12} color="white" />
            <Text className="text-white text-sm font-bold">Hoàn tất hồ sơ & bắt đầu nhận việc</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

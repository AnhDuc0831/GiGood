import { VTextInput } from '../../components/ui/VTextInput';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
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

export default function SignupBasicScreen() {
  const router = useRouter()
  const { dispatch } = useGiGood()
  const { pendingSignupRole, signUpSeeker } = useAuth()
  const { keyboardHeight, isKeyboardVisible } = useKeyboard()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [location, setLocation] = useState('')
  const [agreed, setAgreed] = useState(false)

  const role = pendingSignupRole || 'seeker'
  const isSeeker = role === 'seeker'
  const accentColor = isSeeker ? colors.orange : colors.teal

  const handleSubmit = async () => {
    if (!name || !phone || !password || !location || !agreed) return
    try {
      if (isSeeker) {
        await signUpSeeker(name, phone, password, location)
        router.replace('/(app)')
      } else {
        dispatch({ type: 'SET_TEMP_SIGNUP_INFO', payload: { name, phone, location, password } })
        router.push('/(auth)/signup-tasker-profile')
      }
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
          <Text className="font-bold text-base text-gray-800">Thông tin tài khoản</Text>
          <Text className="text-[11px] font-bold" style={{ color: accentColor }}>
            Đăng ký: {isSeeker ? 'Người thuê (Seeker)' : 'Người nhận việc (Tasker)'}
          </Text>
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
        <View className="flex-row space-x-1.5 mb-6">
          <View className="h-1.5 rounded-full flex-1" style={{ backgroundColor: accentColor }} />
          <View className="h-1.5 rounded-full flex-1 bg-gray-200" />
        </View>

        <View className="space-y-4">
          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Họ và tên <Text className="text-red-500">*</Text></Text>
            <VTextInput value={name} onChangeText={setName} placeholder="Nguyễn Văn A" placeholderTextColor={colors.grayMuted}
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm" />
          </View>
          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Số điện thoại <Text className="text-red-500">*</Text></Text>
            <VTextInput value={phone} onChangeText={setPhone} placeholder="09xx xxx xxx" placeholderTextColor={colors.grayMuted}
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm" keyboardType="phone-pad" />
            <Text className="text-[10px] text-gray-400">Dùng để xác thực danh tính và liên hệ khi có việc.</Text>
          </View>
          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Mật khẩu <Text className="text-red-500">*</Text></Text>
            <VTextInput value={password} onChangeText={setPassword} placeholder="Tối thiểu 6 ký tự" placeholderTextColor={colors.grayMuted}
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm" secureTextEntry />
          </View>
          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Khu vực sinh sống <Text className="text-red-500">*</Text></Text>
            <View className="relative">
              <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
                <FontAwesome name="map-marker" size={12} color={colors.grayMuted} />
              </View>
              <VTextInput value={location} onChangeText={setLocation} placeholder="Quận/Phường, Thành phố" placeholderTextColor={colors.grayMuted}
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl border border-gray-200 text-sm" />
            </View>
          </View>

          <View className="flex-row items-start space-x-2.5 pt-1">
            <Switch value={agreed} onValueChange={setAgreed} trackColor={{ false: colors.grayDisabled, true: accentColor + '80' }}
              thumbColor={agreed ? accentColor : colors.grayTrack} />
            <Text className="text-[11px] text-gray-500 leading-relaxed flex-1">
              Tôi đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của GiGood, bao gồm việc xác thực số điện thoại.
            </Text>
          </View>

          <TouchableOpacity onPress={handleSubmit}
            className="w-full py-3.5 rounded-2xl items-center flex-row justify-center space-x-2 active:opacity-90"
            style={{ backgroundColor: isSeeker ? colors.stoneDark : colors.teal }}>
            <Text className="text-white text-sm font-bold">Tiếp tục</Text>
            <FontAwesome name="arrow-right" size={12} color="white" />
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

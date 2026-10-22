import { VTextInput } from '../../components/ui/VTextInput';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FontAwesome } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../hooks/useAuth'
import { useKeyboard } from '../../hooks/useKeyboard'
import { colors } from '../../constants/theme'
import { useState } from 'react'

export default function LoginScreen() {
  const router = useRouter()
  const { quickLogin, login } = useAuth()
  const { keyboardHeight, isKeyboardVisible } = useKeyboard()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async () => {
    try {
      await login(phone, password)
      router.replace('/(app)')
    } catch {
      Alert.alert('Đăng nhập thất bại', 'Số điện thoại hoặc mật khẩu không đúng.')
    }
  }

  const handleQuickLogin = async (role: 'seeker' | 'tasker') => {
    try {
      await quickLogin(role)
      router.replace('/(app)')
    } catch {
      Alert.alert('Đăng nhập thất bại', 'Không thể đăng nhập tài khoản mẫu. Vui lòng thử lại.')
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
        <Text className="font-bold text-base text-gray-800">Đăng nhập</Text>
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
        <View className="mb-6">
          <Text className="text-2xl font-extrabold text-gray-800">Chào mừng trở lại</Text>
          <Text className="text-xs text-gray-500 mt-1">Đăng nhập bằng số điện thoại hoặc dùng tài khoản mẫu để xem demo ngay.</Text>
        </View>

        <View className="space-y-3.5 mb-6">
          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Số điện thoại</Text>
            <View className="relative">
              <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
                <FontAwesome name="phone" size={12} color={colors.grayMuted} />
              </View>
              <VTextInput value={phone} onChangeText={setPhone} placeholder="09xx xxx xxx" placeholderTextColor={colors.grayMuted}
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl border border-gray-200 text-sm" keyboardType="phone-pad" />
            </View>
          </View>
          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Mật khẩu</Text>
            <View className="relative">
              <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
                <FontAwesome name="lock" size={12} color={colors.grayMuted} />
              </View>
              <VTextInput value={password} onChangeText={setPassword} placeholder="Nhập mật khẩu" placeholderTextColor={colors.grayMuted}
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl border border-gray-200 text-sm" secureTextEntry />
            </View>
          </View>
          <TouchableOpacity onPress={handleLogin} className="w-full bg-gray-900 py-3.5 rounded-2xl items-center active:opacity-90">
            <Text className="text-white text-sm font-bold">Đăng nhập</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center mb-6">
          <View className="flex-1 border-t border-gray-200" />
          <Text className="mx-3 text-gray-400 text-[11px] font-bold uppercase tracking-wider">Hoặc dùng tài khoản mẫu</Text>
          <View className="flex-1 border-t border-gray-200" />
        </View>

        <View className="space-y-2.5 mb-6">
          <TouchableOpacity onPress={() => handleQuickLogin('seeker')}
            className="flex-row items-center space-x-3 p-3 rounded-2xl border-2 border-orange-100 bg-orange-50">
            <Image source={{ uri: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150' }}
              className="w-11 h-11 rounded-full border-2 border-orange-500" />
            <View>
              <Text className="font-bold text-sm text-orange-500">Khánh Vy</Text>
              <Text className="text-xs text-gray-500 font-medium">Vai trò: Người Thuê (Seeker)</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleQuickLogin('tasker')}
            className="flex-row items-center space-x-3 p-3 rounded-2xl border-2 border-teal-100 bg-teal-50">
            <Image source={{ uri: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150' }}
              className="w-11 h-11 rounded-full border-2 border-teal-600" />
            <View>
              <Text className="font-bold text-sm text-teal-600">Minh Quân</Text>
              <Text className="text-xs text-gray-500 font-medium">Vai trò: Người Nhận Việc (Tasker)</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text className="text-center text-xs text-gray-500">
          Chưa có tài khoản?{' '}
          <Text onPress={() => router.push('/(auth)/role-select')} className="text-orange-500 font-bold">Đăng ký ngay</Text>
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

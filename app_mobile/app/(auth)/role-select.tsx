import { View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FontAwesome } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../hooks/useAuth'
import { colors } from '../../constants/theme'

export default function RoleSelectScreen() {
  const router = useRouter()
  const { setPendingRole } = useAuth()

  const selectRole = (role: 'seeker' | 'tasker') => {
    setPendingRole(role)
    router.push('/(auth)/signup-basic')
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
        <Text className="font-bold text-base text-gray-800">Tạo tài khoản</Text>
      </View>

      <View className="flex-1 px-5 py-6 space-y-5">
        <View>
          <Text className="text-2xl font-extrabold text-gray-800">Bạn muốn dùng GiGood để làm gì?</Text>
          <Text className="text-xs text-orange-500 font-bold mt-1">Đăng ký hoàn tất sẽ được tặng 20 Token. (Lưu ý: Không thể đổi vai trò sau khi chọn)</Text>
        </View>

        <TouchableOpacity onPress={() => selectRole('seeker')}
          className="flex-row items-start space-x-3 p-4 rounded-2xl border-2 border-gray-200 bg-white">
          <View className="w-12 h-12 rounded-xl bg-orange-50 items-center justify-center">
            <FontAwesome name="user" size={18} color={colors.orange} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-sm text-gray-800">Tôi là Doanh nghiệp (Người thuê)</Text>
            <Text className="text-xs text-gray-500 mt-0.5">Đăng việc vặt, tìm Tasker gần bạn</Text>
          </View>
          <FontAwesome name="chevron-right" size={12} color={colors.grayDisabled} style={{ marginTop: 12 }} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => selectRole('tasker')}
          className="flex-row items-start space-x-3 p-4 rounded-2xl border-2 border-gray-200 bg-white">
          <View className="w-12 h-12 rounded-xl bg-teal-50 items-center justify-center">
            <FontAwesome name="wrench" size={18} color={colors.teal} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-sm text-gray-800">Tôi là Sinh viên (Người nhận việc)</Text>
            <Text className="text-xs text-gray-500 mt-0.5">Tạo hồ sơ, kiếm thêm thu nhập</Text>
          </View>
          <FontAwesome name="chevron-right" size={12} color={colors.grayDisabled} style={{ marginTop: 12 }} />
        </TouchableOpacity>

        <Text className="text-center text-xs text-gray-500 pt-2">
          Đã có tài khoản?{' '}
          <Text onPress={() => router.push('/(auth)/login')} className="text-orange-500 font-bold">Đăng nhập</Text>
        </Text>
      </View>
    </SafeAreaView>
  )
}

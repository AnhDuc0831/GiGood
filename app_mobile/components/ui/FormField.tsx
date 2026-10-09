import { VTextInput } from './VTextInput';
import { View, Text, TextInput, TextInputProps } from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { colors } from '@/constants/theme'

type Props = TextInputProps & {
  label: string
  required?: boolean
  icon?: keyof typeof FontAwesome.glyphMap
  helperText?: string
}

export function FormField({ label, required, icon, helperText, className, ...inputProps }: Props) {
  return (
    <View className="space-y-1.5">
      <Text className="text-xs font-bold text-gray-700">
        {label}{required && <Text className="text-red-500"> *</Text>}
      </Text>
      <View className="relative">
        {icon && (
          <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
            <FontAwesome name={icon} size={12} color={colors.grayMuted} />
          </View>
        )}
        <VTextInput
          className={`${icon ? 'pl-10' : 'px-4'} pr-4 py-3.5 rounded-2xl border border-gray-200 text-sm bg-white ${className || ''}`}
          placeholderTextColor={colors.grayMuted}
          {...inputProps}
        />
      </View>
      {helperText && <Text className="text-[10px] text-gray-400">{helperText}</Text>}
    </View>
  )
}

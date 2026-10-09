import { View, Text } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { colors } from "../../constants/theme";
import { useAuth } from "../../hooks/useAuth";

export function RegistrationProgressBar() {
  const { profile } = useAuth();
  
  if (!profile || !profile.registrationProgress) return null;
  
  const progress = profile.registrationProgress;
  if (progress.bonusAwarded) return null; // Hide if already fully completed

  const steps = [
    { label: "Đăng ký và xác thực SĐT", completed: progress.step1_PhoneVerified },
    { label: "Hoàn thiện hồ sơ", completed: progress.step2_ProfileCompleted },
    { label: "Xác thực kỹ năng", completed: progress.step3_SkillsVerified },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const progressPercent = (completedCount / steps.length) * 100;

  return (
    <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 space-y-3">
      <Text className="text-xs font-bold text-gray-800">
        Hoàn thành các bước để nhận 20 Token
      </Text>
      
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View 
          className="h-full bg-teal-500 rounded-full" 
          style={{ width: `${progressPercent}%` }} 
        />
      </View>

      <View className="space-y-2 mt-2">
        {steps.map((step, index) => (
          <View key={index} className="flex-row items-center space-x-2">
            <FontAwesome 
              name={step.completed ? "check-circle" : "circle-o"} 
              size={14} 
              color={step.completed ? colors.teal : colors.grayMuted} 
            />
            <Text className={`text-[11px] ${step.completed ? "text-teal-700 font-bold" : "text-gray-500"}`}>
              {step.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

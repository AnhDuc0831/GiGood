import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome } from "@expo/vector-icons";
import { useWallet } from "../../hooks/useWallet";
import { useUi } from "../../hooks/useUi";
import { formatVnd } from "../../lib/format";
import { useState } from "react";
import { getApiErrorMessage } from "../../lib/features/jobs/api";

const PACKAGES = [
  {
    id: "starter",
    name: "Starter",
    price: 30000,
    tokens: 30,
    pricePerToken: "≈1000đ",
    description: "Người dùng mới, muốn trải nghiệm với chi phí thấp",
    icon: "star-o" as const,
    color: "bg-blue-500",
    textColor: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  {
    id: "standard",
    name: "Standard",
    price: 100000,
    tokens: 110,
    pricePerToken: "≈909,09đ",
    description: "Tasker sử dụng thường xuyên hơn",
    icon: "star" as const,
    color: "bg-orange-500",
    textColor: "text-orange-500",
    bgColor: "bg-orange-50",
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    price: 300000,
    tokens: 350,
    pricePerToken: "≈857,14đ",
    description: "Tasker có tần suất tìm Micro-Gig cao",
    icon: "diamond" as const,
    color: "bg-purple-600",
    textColor: "text-purple-600",
    bgColor: "bg-purple-50",
  }
];

export default function TopUpScreen() {
  const router = useRouter();
  const { topUp } = useWallet();
  const { showToast } = useUi();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleBuy = async (pkg: typeof PACKAGES[0]) => {
    if (loadingId) return;
    setLoadingId(pkg.id);
    try {
      await topUp(pkg.tokens);
      showToast(`Mua thành công gói ${pkg.name}. Đã cộng ${pkg.tokens} Token!`, "success");
      router.back();
    } catch (error) {
      showToast(getApiErrorMessage(error, "Không thể mua token lúc này."), "error");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={["top", "bottom"]}>
      <View className="flex-row items-center p-4 border-b border-gray-200 bg-white">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <FontAwesome name="angle-left" size={28} color="#374151" />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-bold text-gray-900 mr-6">
          Mua Token
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mb-6">
          <Text className="text-2xl font-extrabold text-gray-900 text-center mb-2">
            Chọn gói G-Token
          </Text>
          <Text className="text-gray-500 text-center text-sm px-4">
            G-Token được dùng để đăng việc (Seeker) và nhận việc (Tasker).
          </Text>
        </View>

        <View className="space-y-4">
          {PACKAGES.map((pkg) => (
            <TouchableOpacity
              key={pkg.id}
              activeOpacity={0.8}
              onPress={() => void handleBuy(pkg)}
              className={`bg-white rounded-2xl p-5 border ${pkg.popular ? 'border-orange-500' : 'border-gray-200'} shadow-sm relative overflow-hidden`}
            >
              {pkg.popular && (
                <View className="absolute top-0 right-0 bg-orange-500 px-3 py-1 rounded-bl-xl">
                  <Text className="text-white text-xs font-bold">PHỔ BIẾN</Text>
                </View>
              )}

              <View className="flex-row items-center mb-4">
                <View className={`w-12 h-12 rounded-full ${pkg.bgColor} items-center justify-center mr-4`}>
                  <FontAwesome name={pkg.icon} size={24} className={pkg.textColor} />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-gray-900">{pkg.name}</Text>
                  <Text className={`text-lg font-extrabold ${pkg.textColor}`}>
                    {pkg.tokens} <Text className="text-sm font-semibold">G-Token</Text>
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-lg font-bold text-gray-900">{formatVnd(pkg.price)}</Text>
                  <Text className="text-xs text-gray-500 font-medium">{pkg.pricePerToken}</Text>
                </View>
              </View>

              <View className="bg-stone-50 rounded-xl p-3 mb-4">
                <Text className="text-sm text-gray-600 leading-5">
                  <FontAwesome name="check-circle" size={14} color="#10B981" /> {pkg.description}
                </Text>
              </View>

              <View className={`py-3 rounded-xl items-center justify-center ${pkg.popular ? 'bg-orange-500' : 'bg-gray-900'}`}>
                {loadingId === pkg.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-bold text-base">Mua ngay</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

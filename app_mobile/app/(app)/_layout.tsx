import { FontAwesome } from "@expo/vector-icons";
import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { useNotifications } from "../../hooks/useNotifications";
import { useUi } from "../../hooks/useUi";
import { useWallet } from "../../hooks/useWallet";
import { SegmentedToggle } from "../../components/ui/SegmentedToggle";
import type { Role } from "../../types";
import { CartProvider } from "../../lib/features/wallet/context/CartContext";
import { AiProvider, useAi } from "../../lib/features/ai/context/AiContext";
import { connectChatHub } from "../../lib/features/chat/hub";
import { connectNotificationHub } from "../../lib/features/notifications/hub";
import { formatNotificationTime } from "../../lib/features/notifications/format";
import { formatVnd, formatToken } from "../../lib/format";
import { colors } from "../../constants/theme";
import { useGiGood } from "../../lib/GiGoodContext";
import { BonusPopup } from "../../components/modals/BonusPopup";

function AppLayoutContent() {
  const { openAi } = useAi();
  const { profile, currentRole, switchRole } = useAuth();
  const { balance, escrowHeld, isSeeker } = useWallet();
  const { notifications, unreadCount, clear } = useNotifications();
  const { showToast } = useUi();
  const [notifOpen, setNotifOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const router = useRouter();

  const { state, dispatch } = useGiGood();

  // Foreground-only realtime: connect both hubs once the session is hydrated.
  // Best effort, never blocks the shell if a hub is unreachable.
  useEffect(() => {
    if (profile) {
      void connectChatHub();
      void connectNotificationHub();
    }
  }, [profile]);

  if (!profile) {
    return <Redirect href="/(auth)" />;
  }

  const toggleNotif = () => setNotifOpen(!notifOpen);

  // Task 08: dual-role switch. Becoming a tasker without a profile is blocked
  // by the API (400) and its message is surfaced as the toast.
  const handleRoleChange = async (role: Role) => {
    if (role === currentRole || switchingRole) return;
    setSwitchingRole(true);
    try {
      const nextRole = await switchRole(role);
      router.replace(
        nextRole === "seeker" ? "/(app)/(tabs)/post" : "/(app)/(tabs)/board",
      );
      showToast(
        nextRole === "seeker"
          ? "Đã chuyển sang vai trò Người Thuê."
          : "Đã chuyển sang vai trò Người Nhận việc.",
        "success",
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Không thể chuyển vai trò. Vui lòng thử lại.",
        "error",
      );
    } finally {
      setSwitchingRole(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50">
      {/* Sticky Header */}
      <View className="bg-white border-b border-gray-200 px-4 pb-3 relative z-30">
        {/* Top row */}
        <View className="flex-row items-center justify-between pt-3">
          <View className="flex-row items-center space-x-2">
            <Text className="text-orange-500 text-xl font-extrabold tracking-tight">
              GiGood
            </Text>
            <Text
              className={`${isSeeker ? "bg-orange-50 text-orange-500" : "bg-teal-50 text-teal-600"} text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide`}
            >
              {isSeeker ? "Seeker" : "Tasker"}
            </Text>
          </View>
          <View className="flex-row items-center space-x-2">
            <TouchableOpacity
              onPress={() => openAi()}
              accessibilityRole="button"
              accessibilityLabel="Trợ lý GiGood AI"
              className="h-9 px-2.5 rounded-xl bg-orange-50 border border-orange-200 flex-row items-center space-x-1"
            >
              <FontAwesome name="magic" size={13} color={colors.orange} />
              <Text className="text-[11px] font-bold text-orange-600 ml-1">AI</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toggleNotif}
              accessibilityRole="button"
              accessibilityLabel={
                unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"
              }
              className="w-9 h-9 rounded-xl bg-stone-50 border border-gray-200 items-center justify-center relative"
            >
              <FontAwesome name="bell" size={14} color={colors.grayIcon} />
              {unreadCount > 0 && (
                <View className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-orange-500 rounded-full items-center justify-center">
                  <Text className="text-white text-[8px] font-bold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(app)/profile")}
              accessibilityRole="button"
              accessibilityLabel="Hồ sơ của tôi"
            >
              <Image
                source={{ uri: profile.avatar }}
                className="w-9 h-9 rounded-xl border border-gray-200"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Wallet card */}
        <View className="flex-row gap-2 mt-3">
          <View className="flex-1 flex-row items-center space-x-2 bg-stone-50 border border-gray-200 px-3 py-2 rounded-xl">
            <FontAwesome name="credit-card" size={14} color={colors.grayIcon} />
            <View className="flex-1 flex-row items-center justify-between">
              <View>
                <Text className="text-[9px] text-gray-500 font-medium">
                  Ví của {profile.name.split(" ").pop()}
                </Text>
                <Text className="text-[11px] text-gray-900 font-extrabold">
                  {formatToken(balance)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(app)/topup')} className="bg-orange-500 px-3 py-1.5 rounded-lg">
                <Text className="text-[10px] font-bold text-white">Mua Token</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Notification Dropdown Tray */}
        {notifOpen && (
          <View className="absolute right-3 top-[68px] w-[88%] bg-white rounded-2xl border border-gray-200 shadow-xl p-4 z-50">
            <View className="flex-row justify-between items-center border-b border-gray-100 pb-2">
              <Text className="font-extrabold text-xs text-gray-800">
                Thông báo của bạn
              </Text>
              <View className="flex-row items-center space-x-3">
                <TouchableOpacity
                  onPress={() => {
                    setNotifOpen(false);
                    router.push("/(app)/notifications");
                  }}
                >
                  <Text className="text-[10px] text-gray-400 font-bold">
                    Xem tất cả
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void clear()}>
                  <Text className="text-[10px] text-orange-500 font-bold">
                    Xóa hết
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 240 }} className="space-y-2.5">
              {notifications.length === 0 ? (
                <Text className="text-gray-400 text-center py-4 text-xs">
                  Không có thông báo mới nào.
                </Text>
              ) : (
                notifications.map((n) => (
                  <View
                    key={n.id}
                    className="flex-row items-start space-x-2.5 pb-2.5 border-b border-gray-50"
                  >
                    <View
                      className={`w-7 h-7 rounded-full items-center justify-center ${
                        n.read ? "bg-stone-100" : "bg-orange-50"
                      }`}
                    >
                      <FontAwesome
                        name="bell"
                        size={10}
                        color={n.read ? colors.grayMuted : colors.orange}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`text-xs leading-snug ${n.read ? "text-gray-500" : "text-gray-800 font-semibold"}`}
                        numberOfLines={2}
                      >
                        {n.title}
                      </Text>
                      <Text
                        className="text-[10px] text-gray-400 mt-0.5"
                        numberOfLines={2}
                      >
                        {n.body}
                      </Text>
                      <Text className="text-[10px] text-gray-400 mt-0.5">
                        {formatNotificationTime(n.createdAt)}
                      </Text>
                    </View>
                    {!n.read && (
                      <View className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5" />
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Content */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen
          name="notifications"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="job/[id]" options={{ headerShown: false }} />
      </Stack>
      <BonusPopup 
        visible={state.ui.bonusPopupOpen} 
        onClose={() => dispatch({ type: 'HIDE_BONUS_POPUP' })} 
      />
      </SafeAreaView>
  );
}

export default function AppLayout() {
  return (
    <CartProvider>
      <AiProvider>
        <AppLayoutContent />
      </AiProvider>
    </CartProvider>
  );
}

import { FontAwesome } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FormField } from "../../components/ui/FormField";
import { ModalSheet } from "../../components/ui/ModalSheet";
import { useAuth } from "../../hooks/useAuth";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useUserRating } from "../../hooks/useRatings";
import { useUi } from "../../hooks/useUi";
import { useWallet } from "../../hooks/useWallet";
import { AVAILABILITY_LABEL, CATEGORY_META, VEHICLE_LABEL } from "../../lib/categories";
import { getApiErrorMessage } from "../../lib/features/jobs/api";
import { useProfile } from "../../lib/features/profile/hooks/useProfile";
import type { ProfileUpdate } from "../../lib/features/profile/types";
import { RegistrationProgressBar } from "../../components/ui/RegistrationProgressBar";
import { formatVnd, formatToken } from "../../lib/format";
import { colors } from "../../constants/theme";
import type { Availability, Category, Vehicle } from "../../types";

type PickerKind = "availability" | "vehicle";

const sameSkills = (a: Category[], b: Category[]) => {
  if (a.length !== b.length) return false;
  const selected = new Set(b);
  return a.every((skill) => selected.has(skill));
};

export default function ProfileScreen() {
  const { profile: authProfile, signOut } = useAuth();
  const { balance, escrowHeld } = useWallet();
  const { rating } = useUserRating(authProfile?.id);
  const {
    profile: loadedProfile,
    updateProfile,
    uploadAvatar,
    isSaving,
    isUploadingAvatar,
    verifyIdentity,
    isVerifying,
  } = useProfile();
  const { showToast } = useUi();
  const router = useRouter();
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();

  const p = loadedProfile ?? authProfile;

  const [name, setName] = useState(p?.name ?? "");
  const [location, setLocation] = useState(p?.location ?? "");
  const [bio, setBio] = useState(p?.taskerProfile?.bio ?? "");
  const [skills, setSkills] = useState<Category[]>(p?.taskerProfile?.skills ?? []);
  const [availability, setAvailability] = useState<Availability | null>(
    p?.taskerProfile?.availability || null,
  );
  const [vehicle, setVehicle] = useState<Vehicle | null>(
    p?.taskerProfile?.vehicle || null,
  );
  const [picker, setPicker] = useState<PickerKind | null>(null);

  if (!p) {
    return null;
  }

  const isSeeker = p.role === "seeker";
  const tp = p.taskerProfile;
  const accent = isSeeker ? colors.orange : colors.teal;

  const toggleSkill = (skill: Category) => {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast("Cần quyền truy cập thư viện ảnh để đổi ảnh đại diện.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      await uploadAvatar(result.assets[0].uri);
      showToast("Đã cập nhật ảnh đại diện.", "success");
    } catch (error) {
      showToast(
        getApiErrorMessage(error, "Không thể tải ảnh lên. Vui lòng thử lại."),
        "error",
      );
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      showToast("Tên phải có ít nhất 2 ký tự.", "error");
      return;
    }

    const body: ProfileUpdate = {};
    if (trimmedName !== p.name) body.name = trimmedName;

    const trimmedLocation = location.trim();
    if (trimmedLocation !== p.location) body.location = trimmedLocation;

    const trimmedBio = bio.trim();
    if (tp) {
      if (trimmedBio !== tp.bio) body.bio = trimmedBio;
      if (!sameSkills(skills, tp.skills)) body.skills = skills;
      if (availability && availability !== tp.availability)
        body.availability = availability;
      if (vehicle && vehicle !== tp.vehicle) body.vehicle = vehicle;
    } else {
      if (trimmedBio) body.bio = trimmedBio;
      if (skills.length > 0) body.skills = skills;
      if (availability) body.availability = availability;
      if (vehicle) body.vehicle = vehicle;
    }

    if (Object.keys(body).length === 0) {
      showToast("Chưa có thay đổi nào để lưu.", "info");
      return;
    }

    try {
      const next = await updateProfile(body);
      setName(next.name);
      setLocation(next.location);
      setBio(next.taskerProfile?.bio ?? "");
      setSkills(next.taskerProfile?.skills ?? []);
      setAvailability(next.taskerProfile?.availability || null);
      setVehicle(next.taskerProfile?.vehicle || null);
      showToast("Đã lưu hồ sơ.", "success");
    } catch (error) {
      showToast(
        getApiErrorMessage(error, "Không thể lưu hồ sơ. Vui lòng thử lại."),
        "error",
      );
    }
  };

  const skillEntries = Object.entries(CATEGORY_META) as [
    Category,
    { label: string; icon: string },
  ][];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pb-4 flex-row items-center space-x-3 border-b border-gray-200">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-stone-100 items-center justify-center"
        >
          <FontAwesome name="arrow-left" size={14} color={colors.grayIcon} />
        </TouchableOpacity>
        <Text className="font-bold text-base text-gray-800">Hồ sơ của tôi</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          className="flex-1 px-5 py-6"
          contentContainerStyle={{ paddingBottom: isKeyboardVisible ? keyboardHeight + 80 : 160 }}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Avatar + identity */}
        <View className="items-center mb-5">
          <TouchableOpacity
            onPress={pickAvatar}
            disabled={isUploadingAvatar}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Đổi ảnh đại diện"
          >
            <Image
              source={{ uri: p.avatar }}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                borderWidth: 2,
                borderColor: accent,
              }}
              contentFit="cover"
            />
            <View
              className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full border-2 border-white items-center justify-center ${
                isSeeker ? "bg-orange-500" : "bg-teal-600"
              }`}
            >
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <FontAwesome name="camera" size={10} color={colors.white} />
              )}
            </View>
          </TouchableOpacity>
          <Text className="font-extrabold text-lg text-gray-800 mt-2">
            {p.name}
          </Text>
          <Text className="text-xs font-bold" style={{ color: accent }}>
            {isSeeker ? "Người Thuê (Seeker)" : "Người Nhận Việc (Tasker)"}
          </Text>
          <Text className="text-[11px] text-amber-500 font-bold mt-0.5">
            <FontAwesome name="star" size={11} />{" "}
            {rating && rating.count > 0
              ? `${rating.avg.toFixed(1)} · ${rating.count} việc`
              : "Thành viên Đồng"}
          </Text>
          <Text className="text-[10px] text-gray-400 mt-1">
            Chạm vào ảnh để thay đổi
          </Text>
        </View>

        {/* Wallet stats */}
        <View className="mb-5 bg-stone-50 border border-gray-200 rounded-2xl p-3 items-center flex-row justify-between">
          <View>
            <Text className="text-[10px] text-gray-500">Ví của bạn</Text>
            <Text className="text-base font-extrabold text-gray-800">
              {formatToken(balance)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(app)/topup')} className="bg-orange-500 px-4 py-2 rounded-xl">
            <Text className="text-white text-xs font-bold">Mua Token</Text>
          </TouchableOpacity>
        </View>

        <RegistrationProgressBar />

        {/* Personal info */}
        <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 space-y-3">
          <Text className="text-xs font-bold text-gray-700">Thông tin cá nhân</Text>
          <FormField
            label="Họ và tên"
            required
            value={name}
            onChangeText={setName}
            placeholder="Tên của bạn"
          />
          <FormField
            label="Khu vực"
            value={location}
            onChangeText={setLocation}
            placeholder="VD: Quận 1, TP. Hồ Chí Minh"
          />
          <View className="px-4 py-3.5 rounded-2xl bg-stone-50 border border-gray-200 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-gray-700">Số điện thoại</Text>
            <Text className="text-xs text-gray-500">{p.phone || "—"}</Text>
          </View>
        </View>

        {/* Tasker profile */}
        <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 space-y-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-gray-700">Hồ sơ Tasker</Text>
            <Text
              className={`text-[10px] font-bold ${
                tp?.verified ? "text-teal-600" : "text-amber-500"
              }`}
            >
              {tp?.verified ? "Đã xác thực" : "Chưa xác thực"}
            </Text>
          </View>

          <View className="space-y-2">
            <Text className="text-xs font-bold text-gray-700">Lĩnh vực mạnh</Text>
            <View className="flex-row flex-wrap">
              {skillEntries.map(([key, meta]) => {
                const active = skills.includes(key);
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => toggleSkill(key)}
                    className={`flex-row items-center space-x-1.5 px-3 py-2 rounded-xl border-2 mr-2 mb-2 ${
                      active
                        ? "border-teal-600 bg-teal-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <FontAwesome
                      name={meta.icon as keyof typeof FontAwesome.glyphMap}
                      size={11}
                      color={active ? colors.teal : colors.grayMuted}
                    />
                    <Text
                      className={`text-[11px] font-bold ${
                        active ? "text-teal-600" : "text-gray-600"
                      }`}
                    >
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <FormField
            label="Giới thiệu ngắn"
            value={bio}
            onChangeText={setBio}
            placeholder="VD: Mình có 2 năm kinh nghiệm sửa chữa điện nước..."
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: "top" }}
          />

          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Thời gian rảnh</Text>
            <TouchableOpacity
              onPress={() => setPicker("availability")}
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 flex-row items-center justify-between bg-white"
            >
              <Text
                className={`text-sm ${availability ? "text-gray-700" : "text-gray-400"}`}
              >
                {availability
                  ? AVAILABILITY_LABEL[availability]
                  : "Chọn thời gian rảnh"}
              </Text>
              <FontAwesome name="chevron-down" size={12} color={colors.grayMuted} />
            </TouchableOpacity>
          </View>

          <View className="space-y-1.5">
            <Text className="text-xs font-bold text-gray-700">Phương tiện</Text>
            <TouchableOpacity
              onPress={() => setPicker("vehicle")}
              className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 flex-row items-center justify-between bg-white"
            >
              <Text
                className={`text-sm ${vehicle ? "text-gray-700" : "text-gray-400"}`}
              >
                {vehicle ? VEHICLE_LABEL[vehicle] : "Chọn phương tiện di chuyển"}
              </Text>
              <FontAwesome name="chevron-down" size={12} color={colors.grayMuted} />
            </TouchableOpacity>
          </View>

          {!tp ? (
            <Text className="text-[10px] text-gray-400 leading-relaxed">
              Hoàn thiện hồ sơ Tasker để có thể chuyển sang vai trò Người Nhận việc.
            </Text>
          ) : null}
        </View>

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          className={`w-full py-3.5 rounded-2xl flex-row items-center justify-center space-x-2 mb-5 ${
            isSaving ? "opacity-70" : ""
          } ${isSeeker ? "bg-orange-500" : "bg-teal-600"}`}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <FontAwesome name="save" size={12} color={colors.white} />
              <Text className="text-white text-sm font-bold">Lưu thay đổi</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Identity verification */}
        <TouchableOpacity
          onPress={async () => {
            try {
              await verifyIdentity();
              showToast("Đã xác thực danh tính", "success");
            } catch (e) {
              showToast("Không thể xác thực. Vui lòng thử lại.", "error");
            }
          }}
          disabled={isVerifying}
          className={`bg-stone-50 border border-gray-200 rounded-2xl p-3.5 flex-row items-center justify-between mb-5 ${isVerifying ? "opacity-70" : ""}`}
        >
          <View className="flex-row items-center space-x-2.5">
            <FontAwesome name="id-card" size={14} color={colors.grayMuted} />
            <Text className="text-xs font-bold text-gray-700">
              Xác thực danh tính (Mock KYC)
            </Text>
          </View>
          {isVerifying ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <Text className={`text-[10px] font-bold ${p.registrationProgress?.step3_SkillsVerified ? "text-teal-600" : "text-amber-500"}`}>
              {p.registrationProgress?.step3_SkillsVerified ? "Đã xác thực" : "Chạm để xác thực"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void signOut()}
          className="w-full bg-red-50 py-3.5 rounded-2xl flex-row items-center justify-center space-x-2"
        >
          <FontAwesome name="sign-out" size={12} color={colors.red} />
          <Text className="text-red-500 text-sm font-bold">Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>

      <ModalSheet
        visible={picker === "availability"}
        onClose={() => setPicker(null)}
      >
        <Text className="text-sm font-extrabold text-gray-800">
          Thời gian rảnh
        </Text>
        {(Object.entries(AVAILABILITY_LABEL) as [Availability, string][]).map(
          ([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => {
                setAvailability(key);
                setPicker(null);
              }}
              className={`px-4 py-3 rounded-xl border ${
                availability === key
                  ? "border-teal-500 bg-teal-50"
                  : "border-gray-200"
              }`}
            >
              <Text
                className={`text-sm ${
                  availability === key
                    ? "text-teal-600 font-bold"
                    : "text-gray-700"
                }`}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </ModalSheet>

      <ModalSheet
        visible={picker === "vehicle"}
        onClose={() => setPicker(null)}
      >
        <Text className="text-sm font-extrabold text-gray-800">
          Phương tiện di chuyển
        </Text>
        {(Object.entries(VEHICLE_LABEL) as [Vehicle, string][]).map(
          ([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => {
                setVehicle(key);
                setPicker(null);
              }}
              className={`px-4 py-3 rounded-xl border ${
                vehicle === key ? "border-teal-500 bg-teal-50" : "border-gray-200"
              }`}
            >
              <Text
                className={`text-sm ${
                  vehicle === key ? "text-teal-600 font-bold" : "text-gray-700"
                }`}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </ModalSheet>
    </SafeAreaView>
  );
}

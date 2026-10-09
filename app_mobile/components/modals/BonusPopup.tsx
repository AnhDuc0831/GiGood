import { Modal, View, Text, TouchableOpacity, Image } from "react-native";
import { FontAwesome } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function BonusPopup({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-center items-center px-6">
        <View className="bg-white rounded-3xl w-full items-center p-6 pt-10 relative overflow-hidden">
          
          <View className="absolute -top-10 -left-10 w-32 h-32 bg-amber-100 rounded-full opacity-50" />
          <View className="absolute -bottom-10 -right-10 w-32 h-32 bg-teal-50 rounded-full opacity-50" />
          
          <View className="w-20 h-20 bg-amber-100 rounded-full items-center justify-center mb-4">
            <FontAwesome name="gift" size={40} color="#f59e0b" />
          </View>
          
          <Text className="text-2xl font-extrabold text-gray-800 text-center mb-2">Chúc mừng!</Text>
          <Text className="text-gray-600 text-base text-center mb-6 leading-6">
            Bạn đã hoàn thiện hồ sơ và nhận được <Text className="font-bold text-amber-500">20 Token</Text> thưởng vào ví!
          </Text>

          <TouchableOpacity
            onPress={onClose}
            className="bg-amber-500 rounded-2xl w-full py-4 items-center shadow-sm"
          >
            <Text className="text-white font-bold text-base">Tuyệt vời, cảm ơn!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

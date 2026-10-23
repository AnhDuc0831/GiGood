import { useState, useEffect, useRef } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../hooks/useAuth'
import { sendAiChat } from '../../lib/features/ai/api'
import type { AiChatMessage, JobDraft, JobRecommendation, TaskerRecommendation } from '../../lib/features/ai/types'
import { CATEGORY_META } from '../../lib/categories'
import { formatVnd } from '../../lib/format'
import { colors } from '../../constants/theme'

interface Props {
  visible: boolean
  initialPrompt?: string
  onClose: () => void
  onApplyDraft: (draft: JobDraft) => void
}

export function AiAssistantModal({ visible, initialPrompt, onClose, onApplyDraft }: Props) {
  const { currentRole, profile } = useAuth()
  const isSeeker = currentRole === 'seeker'
  const router = useRouter()

  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isConfigured, setIsConfigured] = useState(true)
  const listRef = useRef<FlatList>(null)

  // Initialize greeting and handle initialPrompt
  useEffect(() => {
    if (visible) {
      if (messages.length === 0) {
        const greeting: AiChatMessage = {
          role: 'assistant',
          content: isSeeker
            ? `Xin chào ${profile?.name || 'bạn'}! Tôi là Trợ lý GiGood AI.\n\nTôi có thể giúp bạn:\n• **Tự động viết & điền bài đăng việc** (ví dụ: 'Code bài tập C#', 'Dọn phòng trọ').\n• **Tìm Tasker phù hợp** từ cơ sở dữ liệu.\n• **Tư vấn mức giá & thời gian** hợp lý.\n\nBạn muốn đăng việc gì hay cần tôi hỗ trợ điều gì?`
            : `Xin chào ${profile?.name || 'bạn'}! Tôi là Trợ lý GiGood AI dành cho Tasker.\n\nTôi có thể giúp bạn:\n• **Lọc và tìm việc thông minh** từ dữ liệu các việc đang mở.\n• **Tìm việc theo kỹ năng** (máy tính, IT, giao hàng, dọn dẹp...).\n• **Tư vấn nâng cao đánh giá** để nhận việc nhanh hơn.\n\nBạn đang tìm việc gì hôm nay?`,
        }
        setMessages([greeting])
      }

      if (initialPrompt && initialPrompt.trim()) {
        void handleSend(initialPrompt)
      }
    }
  }, [visible, initialPrompt, isSeeker, profile?.name])

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim()
    if (!text || loading) return

    const userMsg: AiChatMessage = {
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!textToSend) setInput('')
    setLoading(true)

    try {
      const historyPayload = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const response = await sendAiChat(text, historyPayload)
      setIsConfigured(response.isConfigured)

      const assistantMsg: AiChatMessage = {
        role: 'assistant',
        content: response.reply,
        jobDraft: response.jobDraft,
        jobRecommendations: response.jobRecommendations,
        taskerRecommendations: response.taskerRecommendations,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages((prev) => [...prev, assistantMsg])
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Xin lỗi, tôi gặp sự cố tạm thời khi kết nối. Bạn vui lòng thử lại nhé!',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const seekerQuickPrompts = [
    '🪄 Viết bài: Code bài tập C#',
    '🧹 Viết bài: Dọn dẹp phòng trọ',
    '🔍 Tìm Tasker máy tính & IT',
    '📦 Giao tài liệu & đồ án gấp',
  ]

  const taskerQuickPrompts = [
    '💻 Tìm việc máy tính & IT',
    '🛵 Tìm việc giao hàng lương cao',
    '📍 Có việc nào đang mở gần đây?',
    '⭐ Mẹo để nhận nhiều việc hơn',
  ]

  const quickPrompts = isSeeker ? seekerQuickPrompts : taskerQuickPrompts

  const renderJobDraft = (draft: JobDraft) => {
    const meta = CATEGORY_META[draft.category]
    return (
      <View className="mt-3 bg-orange-50/60 border border-orange-200 rounded-2xl p-3.5 space-y-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center space-x-1.5">
            <FontAwesome name="magic" size={12} color={colors.orange} />
            <Text className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">
              Mẫu việc AI tự động tạo
            </Text>
          </View>
          <View className="bg-orange-100 px-2 py-0.5 rounded-full flex-row items-center space-x-1">
            <FontAwesome name={(meta?.icon || 'wrench') as any} size={9} color={colors.orange} />
            <Text className="text-[10px] font-bold text-orange-700 ml-1">
              {meta?.label ?? draft.category}
            </Text>
          </View>
        </View>

        <Text className="text-sm font-extrabold text-gray-900 leading-tight">
          {draft.title}
        </Text>

        <Text className="text-xs text-gray-600 leading-relaxed">
          {draft.description}
        </Text>

        <View className="flex-row items-center justify-between pt-1 border-t border-orange-100">
          <Text className="text-[11px] text-gray-500">Giá đề xuất:</Text>
          <Text className="text-sm font-extrabold text-teal-600">
            {formatVnd(draft.estimatedPrice)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => onApplyDraft(draft)}
          className="w-full bg-orange-500 py-2.5 rounded-xl flex-row items-center justify-center space-x-2 mt-1"
        >
          <FontAwesome name="check-circle" size={13} color="white" />
          <Text className="text-white text-xs font-bold ml-1.5">
            Áp dụng vào Đăng việc ngay
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  const renderJobRecommendations = (jobs: JobRecommendation[]) => {
    return (
      <View className="mt-3 space-y-2.5">
        <Text className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">
          Việc phù hợp tìm thấy ({jobs.length})
        </Text>
        {jobs.map((j) => (
          <TouchableOpacity
            key={j.id}
            onPress={() => {
              onClose()
              router.push(`/(app)/job/${j.id}`)
            }}
            className="bg-white border border-teal-200 rounded-2xl p-3 shadow-xs space-y-1.5"
          >
            <View className="flex-row items-start justify-between">
              <Text className="text-xs font-bold text-gray-900 flex-1 pr-2">
                {j.title}
              </Text>
              <Text className="text-xs font-extrabold text-teal-600">
                {formatVnd(j.price)}
              </Text>
            </View>
            {j.locationText && (
              <Text className="text-[10px] text-gray-400">
                <FontAwesome name="map-marker" size={10} /> {j.locationText}
              </Text>
            )}
            <Text className="text-[10px] text-teal-700 bg-teal-50 px-2 py-1 rounded-lg font-medium">
              💡 {j.matchReason}
            </Text>
            <View className="items-end pt-1">
              <Text className="text-[10px] font-bold text-teal-600">
                Xem chi tiết & nhận việc →
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    )
  }

  const renderTaskerRecommendations = (taskers: TaskerRecommendation[]) => {
    return (
      <View className="mt-3 space-y-2.5">
        <Text className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">
          Tasker gợi ý ({taskers.length})
        </Text>
        {taskers.map((t) => (
          <View
            key={t.id}
            className="bg-white border border-gray-200 rounded-2xl p-3 space-y-1.5"
          >
            <View className="flex-row items-center space-x-2.5">
              <View className="w-10 h-10 rounded-full bg-teal-50 items-center justify-center border border-teal-200">
                <Text className="text-teal-700 font-bold text-sm">
                  {t.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-900">{t.name}</Text>
                <Text className="text-[11px] text-amber-500 font-bold">
                  <FontAwesome name="star" size={10} />{' '}
                  {t.ratingAvg > 0 ? t.ratingAvg.toFixed(1) : 'Mới'}
                </Text>
              </View>
            </View>
            {t.bio && (
              <Text className="text-[11px] text-gray-500 italic">"{t.bio}"</Text>
            )}
            <Text className="text-[10px] text-teal-700 bg-teal-50 px-2 py-1 rounded-lg font-medium">
              💡 {t.matchReason}
            </Text>
          </View>
        ))}
      </View>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-stone-50">
        {/* Header */}
        <View className="bg-white border-b border-gray-200 px-4 py-3 flex-row items-center justify-between">
          <View className="flex-row items-center space-x-2.5">
            <View className="w-9 h-9 rounded-xl bg-orange-500 items-center justify-center">
              <FontAwesome name="magic" size={16} color="white" />
            </View>
            <View>
              <View className="flex-row items-center space-x-1.5">
                <Text className="font-extrabold text-base text-gray-900">GiGood AI</Text>
                <Text className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 uppercase">
                  {isSeeker ? 'Seeker Assistant' : 'Tasker Assistant'}
                </Text>
              </View>
              <Text className="text-[10px] text-gray-400">
                {isConfigured ? 'Trợ lý AI thông minh' : 'Chế độ Trợ lý Mẫu (Chưa cấu hình API Key)'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center"
          >
            <FontAwesome name="times" size={14} color={colors.grayIcon} />
          </TouchableOpacity>
        </View>

        {/* Chat message list */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const isUser = item.role === 'user'
            return (
              <View
                className={`mb-3 flex-row ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <View className="w-7 h-7 rounded-lg bg-orange-500 items-center justify-center mr-2 mt-1">
                    <FontAwesome name="magic" size={11} color="white" />
                  </View>
                )}
                <View
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? isSeeker
                        ? 'bg-orange-500 text-white rounded-tr-xs'
                        : 'bg-teal-600 text-white rounded-tr-xs'
                      : 'bg-white border border-gray-200 rounded-tl-xs'
                  }`}
                >
                  <Text
                    className={`text-xs leading-relaxed ${
                      isUser ? 'text-white font-medium' : 'text-gray-800'
                    }`}
                  >
                    {item.content}
                  </Text>

                  {/* Extra widgets attached to assistant messages */}
                  {item.jobDraft && renderJobDraft(item.jobDraft)}
                  {item.jobRecommendations &&
                    item.jobRecommendations.length > 0 &&
                    renderJobRecommendations(item.jobRecommendations)}
                  {item.taskerRecommendations &&
                    item.taskerRecommendations.length > 0 &&
                    renderTaskerRecommendations(item.taskerRecommendations)}

                  {item.time && (
                    <Text
                      className={`text-[9px] mt-1 text-right ${
                        isUser ? 'text-orange-100' : 'text-gray-400'
                      }`}
                    >
                      {item.time}
                    </Text>
                  )}
                </View>
              </View>
            )
          }}
          ListFooterComponent={
            loading ? (
              <View className="flex-row items-center space-x-2 p-2">
                <View className="w-6 h-6 rounded-lg bg-orange-500 items-center justify-center mr-2">
                  <ActivityIndicator size="small" color="white" />
                </View>
                <Text className="text-xs text-gray-400 italic">
                  AI đang đọc dữ liệu và suy nghĩ...
                </Text>
              </View>
            ) : null
          }
        />

        {/* Quick Suggestion Chips */}
        <View className="px-3 py-1.5 bg-stone-100/70 border-t border-gray-100">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {quickPrompts.map((p, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => handleSend(p.replace(/^[^\w\s]+\s*/, ''))}
                className="bg-white border border-gray-200 rounded-full px-3 py-1.5 mr-2"
              >
                <Text className="text-[11px] font-bold text-gray-700">{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Input Bar */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <View className="bg-white border-t border-gray-200 px-4 py-2.5 flex-row items-center space-x-2">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={
                isSeeker
                  ? 'Ví dụ: Code bài tập C#, Cần người dọn phòng...'
                  : 'Ví dụ: Tìm việc máy tính quanh quận 1...'
              }
              placeholderTextColor={colors.grayMuted}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-800"
              onSubmitEditing={() => void handleSend()}
              returnKeyType="send"
            />
            <TouchableOpacity
              onPress={() => void handleSend()}
              disabled={loading || !input.trim()}
              className={`w-10 h-10 rounded-xl items-center justify-center ${
                input.trim()
                  ? isSeeker
                    ? 'bg-orange-500'
                    : 'bg-teal-600'
                  : 'bg-gray-200'
              }`}
            >
              <FontAwesome name="arrow-up" size={14} color="white" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

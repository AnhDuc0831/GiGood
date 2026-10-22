import { VTextInput } from '../../../components/ui/VTextInput';
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutAnimation,
  Platform,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChatBubble } from '../../../components/ui/ChatBubble'
import { EmptyState } from '../../../components/shared/EmptyState'
import { LoadingSpinner } from '../../../components/shared/LoadingSpinner'
import { useChat, type ChatMessage } from '../../../hooks/useChat'
import { useAuth } from '../../../hooks/useAuth'
import { useUi } from '../../../hooks/useUi'
import { useKeyboard } from '../../../hooks/useKeyboard'
import { getApiErrorMessage, resolveImageUrl } from '../../../lib/features/jobs/api'
import { colors } from '../../../constants/theme'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export default function ChatDetailScreen() {
  const { id, jobId: jobIdParam } = useLocalSearchParams<{ id?: string; jobId?: string }>()
  const conversationId = typeof id === 'string' && id.length > 0 ? id : undefined
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { currentRole } = useAuth()
  const { showToast } = useUi()
  const { keyboardHeight, isKeyboardVisible } = useKeyboard()
  const {
    conversation,
    messages,
    loading,
    error,
    hasMore,
    loadingMore,
    loadMore,
    sendMessage,
    isSending,
    typing,
    notifyTyping,
  } = useChat(conversationId, typeof jobIdParam === 'string' ? jobIdParam : undefined)

  const listRef = useRef<FlatList<ChatMessage>>(null)
  const [text, setText] = useState('')

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null

  // Animate layout when keyboard appears or disappears
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
  }, [keyboardHeight, isKeyboardVisible])

  // Auto-scroll when keyboard opens
  useEffect(() => {
    if (isKeyboardVisible && messages.length > 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isKeyboardVisible, keyboardHeight, messages.length])

  // Auto-scroll 100ms after the tail changes; older pages (load more) keep the
  // last id, so reading history does not yank the list back down.
  useEffect(() => {
    if (!lastMessageId) return
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    return () => clearTimeout(timer)
  }, [lastMessageId])

  const handleSend = async () => {
    const body = text.trim()
    if (!body || isSending) return
    setText('')
    notifyTyping(false)
    try {
      await sendMessage(body)
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Không thể gửi tin nhắn.'), 'error')
      setText(body)
    }
  }

  const avatar = resolveImageUrl(conversation?.peerAvatar)
  const accent = currentRole === 'seeker' ? 'orange' : 'teal'

  if (!conversationId) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50">
        <EmptyState icon="📭" title="Không tìm thấy cuộc trò chuyện" />
      </SafeAreaView>
    )
  }

  const bottomPadding = isKeyboardVisible ? Math.max(0, keyboardHeight - insets.bottom) : 0

  return (
    <View className="flex-1 bg-stone-50" style={{ paddingBottom: bottomPadding }}>
      <View className="px-3 py-3 border-b border-gray-200 flex-row items-center bg-white">
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          className="w-8 h-8 rounded-full bg-stone-100 items-center justify-center"
        >
          <FontAwesome name="arrow-left" size={12} color={colors.grayIcon} />
        </TouchableOpacity>
        {avatar ? (
          <Image source={{ uri: avatar }} className="w-9 h-9 rounded-full border border-gray-200 ml-2.5" />
        ) : (
          <View className="w-9 h-9 rounded-full bg-orange-50 items-center justify-center ml-2.5">
            <Text className="text-orange-500 font-extrabold text-xs">
              {(conversation?.peerName || 'G').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View className="flex-1 min-w-0 ml-2.5">
          <Text className="font-bold text-xs text-gray-800" numberOfLines={1}>
            {conversation?.peerName ?? 'Trò chuyện'}
          </Text>
          <Text className="text-[10px] text-gray-400" numberOfLines={1}>
            {conversation?.jobTitle ?? ''}
          </Text>
        </View>
      </View>

      {loading ? (
        <LoadingSpinner text="Đang tải tin nhắn..." />
      ) : !loading && error && messages.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Không thể tải cuộc trò chuyện"
          subtitle={getApiErrorMessage(error, 'Vui lòng thử lại sau.')}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          className="flex-1 bg-stone-50"
          contentContainerClassName="p-4 pb-2"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            hasMore ? (
              <TouchableOpacity
                onPress={() => void loadMore()}
                disabled={loadingMore}
                className="py-3 items-center"
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.grayMuted} />
                ) : (
                  <Text className="text-xs text-gray-400">Tải tin nhắn cũ hơn</Text>
                )}
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <ChatBubble
              message={{ body: item.body, createdAt: item.createdAt }}
              isOwn={item.isOwn}
              accent={accent}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="📭"
              title="Chưa có tin nhắn"
              subtitle="Gửi lời chào để bắt đầu trò chuyện."
            />
          }
        />
      )}

      {typing && (
        <View className="px-4 pb-1 bg-white">
          <Text className="text-[11px] text-teal-600 italic">
            {conversation?.peerName ?? 'Đối phương'} đang nhập...
          </Text>
        </View>
      )}

      <View className="flex-row items-center bg-white border-t border-gray-200 px-3 py-2">
        <VTextInput
          value={text}
          onChangeText={(value) => {
            setText(value)
            notifyTyping(value.trim().length > 0)
          }}
          accessibilityLabel="Nội dung tin nhắn"
          placeholder="Nhập tin nhắn..."
          placeholderTextColor={colors.grayMuted}
          className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2 text-gray-800 text-xs"
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim() || isSending}
          accessibilityRole="button"
          accessibilityLabel="Gửi tin nhắn"
          className={`rounded-full w-10 h-10 items-center justify-center ${
            accent === 'orange' ? 'bg-orange-500' : 'bg-teal-600'
          } ${!text.trim() || isSending ? 'opacity-60' : ''}`}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <FontAwesome name="paper-plane" size={12} color="white" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

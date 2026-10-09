import { VTextInput } from '../../../../components/ui/VTextInput';
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import type { AxiosError } from 'axios'
import { StarRow } from '../../../../components/ui/StarRow'
import { useCreateRating } from '../../../../hooks/useRatings'
import { useUi } from '../../../../hooks/useUi'
import { getApiErrorMessage } from '../../jobs/api'
import { colors } from '../../../../constants/theme'
import type { Review } from '../types'

interface Props {
  visible: boolean
  onClose: () => void
  jobId: string
  /** Name shown under the title (the job's other participant). */
  revieweeName?: string | null
  onSubmitted?: (review: Review) => void
}

/**
 * Real rating modal (task 07), same card look as the demo
 * `components/modals/Rating.tsx` but backed by `POST /api/ratings`.
 * 409 (already reviewed), 400 (job not Done) and 403 (non-participant)
 * surface as an inline message + toast.
 */
export function RatingSheet({ visible, onClose, jobId, revieweeName, onSubmitted }: Props) {
  const { createRating, isSubmitting } = useCreateRating()
  const { showToast } = useUi()

  const [rate, setRate] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fresh sheet every time it opens / the target job changes.
  useEffect(() => {
    if (visible) {
      setRate(0)
      setComment('')
      setSubmitted(false)
      setDuplicate(false)
      setError(null)
    }
  }, [visible, jobId])

  const handleSubmit = async () => {
    if (!jobId || rate === 0 || submitted || isSubmitting) return
    setError(null)
    try {
      const review = await createRating({ jobId, rate, comment: comment.trim() || undefined })
      setSubmitted(true)
      showToast('Cảm ơn bạn đã gửi đánh giá!', 'success')
      onSubmitted?.(review)
    } catch (err) {
      const status = (err as AxiosError | undefined)?.response?.status
      if (status === 409) {
        setDuplicate(true)
        setSubmitted(true)
      }
      const message =
        status === 409
          ? 'Bạn đã đánh giá việc này'
          : getApiErrorMessage(err, 'Không thể gửi đánh giá.')
      setError(message)
      showToast(message, 'error')
    }
  }

  const handleClose = () => {
    if (isSubmitting) return
    onClose()
  }

  const disabled = rate === 0 || submitted || isSubmitting

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="bg-white rounded-2xl w-full p-6 items-center">
          <Text className="text-lg font-bold text-gray-800 mb-1">Đánh giá</Text>
          <Text className="text-gray-500 text-sm mb-4">
            {revieweeName || 'Người tham gia công việc'}
          </Text>

          <View className="mb-5">
            <StarRow value={rate} size={34} onChange={setRate} />
          </View>

          <VTextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Chia sẻ trải nghiệm của bạn (không bắt buộc)"
            placeholderTextColor={colors.grayMuted}
            multiline
            numberOfLines={3}
            editable={!submitted && !isSubmitting}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-stone-50 mb-3"
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />

          {error ? (
            <Text className="w-full text-center text-xs text-red-500 mb-2">{error}</Text>
          ) : null}

          <TouchableOpacity
            onPress={() => void handleSubmit()}
            disabled={disabled}
            className={`rounded-xl py-3 px-8 w-full items-center ${disabled ? 'bg-gray-300' : 'bg-orange-500'}`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">
                {duplicate
                  ? 'Bạn đã đánh giá việc này'
                  : submitted
                    ? 'Đã gửi đánh giá'
                    : 'Gửi đánh giá'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClose}
            disabled={isSubmitting}
            className="rounded-xl py-3 items-center mt-1"
          >
            <Text className="text-gray-500 font-semibold">
              {submitted ? 'Đóng' : 'Để sau'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

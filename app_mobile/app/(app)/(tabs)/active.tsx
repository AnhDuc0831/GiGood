import { Redirect } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../../hooks/useAuth'
import { useChat } from '../../../hooks/useChat'
import { useJobs } from '../../../hooks/useJobs'
import { useUi } from '../../../hooks/useUi'
import { formatVnd } from '../../../lib/format'
import { CATEGORY_META } from '../../../lib/categories'
import { getApiErrorMessage } from '../../../lib/features/jobs/api'
import { RatingSheet } from '../../../lib/features/ratings/components/RatingSheet'
import { EmptyState } from '../../../components/shared/EmptyState'
import { colors } from '../../../constants/theme'
import type { JobModel } from '../../../lib/features/jobs/types'

export default function ActiveScreen() {
  const { currentRole } = useAuth()
  if (currentRole === 'seeker') {
    return <Redirect href="/(app)/(tabs)/post" />
  }

  const { profile } = useAuth()
  const { jobs, refreshing, refetch, reportJob } = useJobs({ mine: true, status: 'Assigned' })
  const { openConversation } = useChat()
  const { showToast } = useUi()
  const router = useRouter()
  const [reportingId, setReportingId] = useState<string | null>(null)
  // Task 07: job whose "Báo hoàn thành" just succeeded -> open the rating sheet.
  const [ratingJob, setRatingJob] = useState<JobModel | null>(null)

  // `mine=true` also returns the caller's own posted jobs; this tab is the
  // accepted-tasker list, so keep only jobs owned by someone else.
  const assignedJobs = useMemo(
    () => jobs.filter((job) => job.owner.id !== profile?.id),
    [jobs, profile?.id],
  )

  const confirmReport = async (job: JobModel) => {
    if (reportingId) return
    setReportingId(job.id)
    try {
      await reportJob(job.id)
      showToast('Đã báo hoàn thành! Đang chờ khách xác nhận và giải ngân.', 'success')
      // Task 07: tasker rates the seeker. The API only accepts reviews once the
      // job is Done, so a too-early submit shows its 400 message in the sheet.
      setRatingJob(job)
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Không thể báo hoàn thành.'), 'error')
    } finally {
      setReportingId(null)
    }
  }

  const handleReportComplete = (job: JobModel) => {
    Alert.alert('Báo hoàn thành', `Xác nhận bạn đã hoàn thành "${job.title}"?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xác nhận', onPress: () => void confirmReport(job) },
    ])
  }

  const handleOpenChat = async (job: JobModel) => {
    try {
      const conversationId = await openConversation(job.id)
      router.push({
        pathname: '/(app)/chat/[id]',
        params: { id: conversationId, jobId: job.id },
      })
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Không thể mở cuộc trò chuyện.'), 'error')
    }
  }

  return (
    <ScrollView
      className="flex-1 px-4 py-4"
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refetch()} tintColor={colors.teal} />
      }
    >
      <Text className="text-lg font-extrabold text-gray-800 mb-4">Việc đã nhận</Text>

      {assignedJobs.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Chưa có việc đang làm"
          subtitle={'Vào "Bảng việc" để xem các việc gần bạn!'}
        />
      ) : (
        assignedJobs.map(job => {
          const meta = CATEGORY_META[job.category]
          const reported = job.isCompletedReported
          const reporting = reportingId === job.id
          return (
            <View key={job.id} className="bg-white border border-gray-200 rounded-2xl p-3.5 space-y-2.5 mb-3">
              <View className="flex-row items-center space-x-2">
                <View className="w-8 h-8 rounded-lg bg-teal-50 items-center justify-center">
                  <FontAwesome name={(meta?.icon || 'wrench') as keyof typeof FontAwesome.glyphMap} size={12} color={colors.teal} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="font-bold text-xs text-gray-800 leading-tight">{job.title}</Text>
                  <Text className="text-[10px] text-gray-400">Khách: {job.owner.name}</Text>
                </View>
                <Text className="font-bold text-xs text-teal-600 flex-shrink-0">{formatVnd(job.price)}</Text>
              </View>
              <Text className="text-[11px] text-gray-500">
                <FontAwesome name="map-marker" size={10} color={colors.grayMuted} /> {job.locationText || 'Chưa có địa chỉ'}
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity onPress={() => void handleOpenChat(job)}
                  className="flex-1 bg-stone-100 py-2.5 rounded-xl items-center">
                  <Text className="text-gray-600 text-xs font-bold">Trò chuyện</Text>
                </TouchableOpacity>
              </View>
              {reported ? (
                <Text className="w-full text-center text-[11px] font-bold text-amber-600 bg-amber-50 py-2 rounded-xl">
                  Đã báo hoàn thành — đang chờ khách xác nhận
                </Text>
              ) : (
                <TouchableOpacity onPress={() => handleReportComplete(job)} disabled={reporting}
                  className={`w-full bg-orange-500 py-2.5 rounded-xl items-center ${reporting ? 'opacity-60' : ''}`}>
                  {reporting ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-white text-xs font-bold">Báo đã hoàn thành</Text>
                  )}
                </TouchableOpacity>
              )}
            <TouchableOpacity onPress={() => setRatingJob(job)}
              className="mt-2 w-full bg-green-500 py-2.5 rounded-xl items-center">
              <Text className="text-white text-xs font-bold">Đánh giá</Text>
            </TouchableOpacity>
            </View>
          )
        })
      )}

      <RatingSheet
        visible={!!ratingJob}
        jobId={ratingJob?.id ?? ''}
        revieweeName={ratingJob?.owner.name ?? 'Khách'}
        onClose={() => setRatingJob(null)}
        onSubmitted={() => setRatingJob(null)}
      />
    </ScrollView>
  )
}

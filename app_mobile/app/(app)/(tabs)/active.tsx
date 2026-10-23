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
import { JobRatingBlock } from '../../../lib/features/ratings/components/JobRatingBlock'
import { RatingSheet } from '../../../lib/features/ratings/components/RatingSheet'
import { EmptyState } from '../../../components/shared/EmptyState'
import { colors } from '../../../constants/theme'
import type { JobModel } from '../../../lib/features/jobs/types'

export default function ActiveScreen() {
  const { currentRole, profile } = useAuth()
  if (currentRole === 'seeker') {
    return <Redirect href="/(app)/(tabs)/post" />
  }

  const [activeTab, setActiveTab] = useState<'assigned' | 'history'>('assigned')

  const {
    jobs: activeJobsList,
    refreshing: refreshingAssigned,
    refetch: refetchAssigned,
    reportJob,
  } = useJobs({ mine: true, status: 'Assigned' })

  const {
    jobs: doneJobsList,
    refreshing: refreshingDone,
    refetch: refetchDone,
  } = useJobs({ mine: true, status: 'Done' })

  const { openConversation } = useChat()
  const { showToast } = useUi()
  const router = useRouter()
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [ratingJob, setRatingJob] = useState<JobModel | null>(null)

  const assignedJobs = useMemo(
    () => activeJobsList.filter((job) => job.owner.id !== profile?.id),
    [activeJobsList, profile?.id],
  )

  const completedJobs = useMemo(
    () => doneJobsList.filter((job) => job.owner.id !== profile?.id),
    [doneJobsList, profile?.id],
  )

  const refreshing = refreshingAssigned || refreshingDone

  const handleRefresh = async () => {
    await Promise.all([refetchAssigned(), refetchDone()])
  }

  const confirmReport = async (job: JobModel) => {
    if (reportingId) return
    setReportingId(job.id)
    try {
      await reportJob(job.id)
      showToast('Đã báo hoàn thành! Đang chờ khách xác nhận và giải ngân.', 'success')
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
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          tintColor={colors.teal}
        />
      }
    >
      <Text className="text-lg font-extrabold text-gray-800 mb-3">Việc đã nhận</Text>

      {/* Segmented Tab Switcher */}
      <View className="flex-row bg-gray-100 p-1 rounded-xl mb-4">
        <TouchableOpacity
          onPress={() => setActiveTab('assigned')}
          className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'assigned' ? 'bg-white shadow-sm' : ''}`}
        >
          <Text
            className={`text-xs font-bold ${activeTab === 'assigned' ? 'text-teal-700' : 'text-gray-500'}`}
          >
            Đang làm {assignedJobs.length > 0 ? `(${assignedJobs.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('history')}
          className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'history' ? 'bg-white shadow-sm' : ''}`}
        >
          <Text
            className={`text-xs font-bold ${activeTab === 'history' ? 'text-teal-700' : 'text-gray-500'}`}
          >
            Lịch sử công việc {completedJobs.length > 0 ? `(${completedJobs.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'assigned' ? (
        assignedJobs.length === 0 ? (
          <EmptyState
            icon="📭"
            title="Chưa có việc đang làm"
            subtitle={'Vào "Bảng việc" để xem các việc gần bạn!'}
          />
        ) : (
          assignedJobs.map((job) => {
            const meta = CATEGORY_META[job.category]
            const reported = job.isCompletedReported
            const reporting = reportingId === job.id
            return (
              <View
                key={job.id}
                className="bg-white border border-gray-200 rounded-2xl p-3.5 space-y-2.5 mb-3"
              >
                <View className="flex-row items-center space-x-2">
                  <View className="w-8 h-8 rounded-lg bg-teal-50 items-center justify-center">
                    <FontAwesome
                      name={(meta?.icon || 'wrench') as keyof typeof FontAwesome.glyphMap}
                      size={12}
                      color={colors.teal}
                    />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="font-bold text-xs text-gray-800 leading-tight">
                      {job.title}
                    </Text>
                    <Text className="text-[10px] text-gray-400">Khách: {job.owner.name}</Text>
                  </View>
                  <Text className="font-bold text-xs text-teal-600 flex-shrink-0">
                    {formatVnd(job.price)}
                  </Text>
                </View>

                <Text className="text-[11px] text-gray-500">
                  <FontAwesome name="map-marker" size={10} color={colors.grayMuted} />{' '}
                  {job.locationText || 'Chưa có địa chỉ'}
                </Text>

                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => void handleOpenChat(job)}
                    className="flex-1 bg-stone-100 py-2.5 rounded-xl items-center"
                  >
                    <Text className="text-gray-600 text-xs font-bold">Trò chuyện</Text>
                  </TouchableOpacity>
                </View>

                {reported ? (
                  <View className="space-y-2">
                    <Text className="w-full text-center text-[11px] font-bold text-amber-600 bg-amber-50 py-2 rounded-xl">
                      Đã báo hoàn thành — đang chờ khách xác nhận
                    </Text>
                    <JobRatingBlock
                      jobId={job.id}
                      canRate={true}
                      onRate={() => setRatingJob(job)}
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleReportComplete(job)}
                    disabled={reporting}
                    className={`w-full bg-orange-500 py-2.5 rounded-xl items-center ${reporting ? 'opacity-60' : ''}`}
                  >
                    {reporting ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text className="text-white text-xs font-bold">Báo đã hoàn thành</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )
          })
        )
      ) : completedJobs.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Chưa có việc nào hoàn thành"
          subtitle="Các công việc bạn đã hoàn thành sẽ xuất hiện ở đây."
        />
      ) : (
        completedJobs.map((job) => {
          const meta = CATEGORY_META[job.category]
          return (
            <View
              key={job.id}
              className="bg-white border border-gray-200 rounded-2xl p-3.5 space-y-2.5 mb-3"
            >
              <View className="flex-row items-center space-x-2">
                <View className="w-8 h-8 rounded-lg bg-teal-50 items-center justify-center">
                  <FontAwesome
                    name={(meta?.icon || 'wrench') as keyof typeof FontAwesome.glyphMap}
                    size={12}
                    color={colors.teal}
                  />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="font-bold text-xs text-gray-800 leading-tight">{job.title}</Text>
                  <Text className="text-[10px] text-gray-400">Khách: {job.owner.name}</Text>
                </View>
                <View className="items-end">
                  <Text className="font-bold text-xs text-emerald-600">+{formatVnd(job.price)}</Text>
                  <Text className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mt-0.5">
                    Hoàn thành
                  </Text>
                </View>
              </View>

              <Text className="text-[11px] text-gray-500">
                <FontAwesome name="map-marker" size={10} color={colors.grayMuted} />{' '}
                {job.locationText || 'Chưa có địa chỉ'}
              </Text>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => void handleOpenChat(job)}
                  className="flex-1 bg-stone-100 py-2.5 rounded-xl items-center"
                >
                  <Text className="text-gray-600 text-xs font-bold">Trò chuyện</Text>
                </TouchableOpacity>
              </View>

              <JobRatingBlock
                jobId={job.id}
                canRate={true}
                onRate={() => setRatingJob(job)}
              />
            </View>
          )
        })
      )}

      <RatingSheet
        visible={!!ratingJob}
        jobId={ratingJob?.id ?? ''}
        revieweeName={ratingJob?.owner.name ?? 'Khách'}
        onClose={() => setRatingJob(null)}
        onSubmitted={() => {
          setRatingJob(null)
          void handleRefresh()
        }}
      />
    </ScrollView>
  )
}

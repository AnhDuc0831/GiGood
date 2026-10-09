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
import { useAuth } from '../../../hooks/useAuth'
import { useJobs } from '../../../hooks/useJobs'
import { useEscrows } from '../../../hooks/useWallet'
import { useUi } from '../../../hooks/useUi'
import { formatVnd } from '../../../lib/format'
import { getApiErrorMessage } from '../../../lib/features/jobs/api'
import { JobRatingBlock } from '../../../lib/features/ratings/components/JobRatingBlock'
import { RatingSheet } from '../../../lib/features/ratings/components/RatingSheet'
import { LoadingSpinner } from '../../../components/shared/LoadingSpinner'
import { EmptyState } from '../../../components/shared/EmptyState'
import { colors } from '../../../constants/theme'
import type { JobModel } from '../../../lib/features/jobs/types'

export default function HistoryScreen() {
  const { currentRole } = useAuth()
  if (currentRole === 'tasker') {
    return <Redirect href="/(app)/(tabs)/board" />
  }

  const { profile } = useAuth()
  const { jobs: doneJobs, loading, refreshing, refetch, releaseEscrow } = useJobs({
    mine: true,
    status: 'Done',
  })
  const { jobs: activeJobs, refetch: refetchActive } = useJobs({
    mine: true,
    status: 'Assigned',
  })
  const { escrows, refetch: refetchEscrows } = useEscrows()
  const { showToast } = useUi()
  const [releasingId, setReleasingId] = useState<string | null>(null)
  // Job being rated (just released as owner, or a done job the user can review).
  const [ratingJob, setRatingJob] = useState<JobModel | null>(null)

  const escrowByJob = useMemo(() => {
    const map = new Map<string, (typeof escrows)[number]>()
    for (const escrow of escrows) map.set(escrow.jobId, escrow)
    return map
  }, [escrows])

  // Owner rows whose tasker reported and whose escrow is still Held are
  // "waiting to be released", so the `Xác nhận & Giải ngân` action is reachable.
  const pendingRelease = useMemo(
    () =>
      activeJobs.filter(
        (job) =>
          job.owner.id === profile?.id &&
          job.isCompletedReported &&
          escrowByJob.get(job.id)?.status === 'Held',
      ),
    [activeJobs, escrowByJob, profile?.id],
  )

  const hasRows = pendingRelease.length > 0 || doneJobs.length > 0

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchActive(), refetchEscrows()])
  }

  const confirmRelease = async (job: JobModel) => {
    if (releasingId) return
    setReleasingId(job.id)
    try {
      await releaseEscrow(job.id)
      showToast('Đã giải ngân cho người nhận việc.', 'success')
      // Task 07: offer the seeker a review of the tasker right after release.
      setRatingJob(job)
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Không thể giải ngân.'), 'error')
    } finally {
      setReleasingId(null)
    }
  }

  const handleRelease = (job: JobModel) => {
    Alert.alert(
      'Xác nhận & Giải ngân',
      `Giải ngân ${formatVnd(job.price)} cho người nhận việc của "${job.title}"?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Giải ngân', onPress: () => void confirmRelease(job) },
      ],
    )
  }

  const renderReleaseButton = (job: JobModel) => {
    const releasing = releasingId === job.id
    return (
      <TouchableOpacity onPress={() => handleRelease(job)} disabled={releasing}
        className={`w-full bg-orange-500 py-2.5 rounded-xl items-center mt-1 ${releasing ? 'opacity-60' : ''}`}>
        {releasing ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <Text className="text-white text-xs font-bold">Xác nhận & Giải ngân</Text>
        )}
      </TouchableOpacity>
    )
  }

  if (loading) {
    return <LoadingSpinner text="Đang tải lịch sử..." />
  }

  return (
    <ScrollView
      className="flex-1 px-4 py-4"
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.orange} />
      }
    >
      <Text className="text-lg font-extrabold text-gray-800 mb-4">Lịch sử giao dịch</Text>

      {pendingRelease.length > 0 && (
        <View className="mb-4">
          <Text className="font-bold text-sm text-gray-800 mb-2">Chờ giải ngân</Text>
          {pendingRelease.map(job => (
            <View key={job.id} className="bg-white border border-amber-200 rounded-2xl p-3.5 space-y-1.5 mb-3">
              <View className="flex-row items-start justify-between">
                <Text className="font-bold text-xs text-gray-800 leading-tight flex-1 pr-2">{job.title}</Text>
                <Text className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Chờ xác nhận</Text>
              </View>
              <Text className="text-[11px] text-gray-500">Khách: {job.owner.name}</Text>
              <View className="flex-row items-center justify-between pt-1 border-t border-gray-50">
                <Text className="text-[11px] text-gray-400">Đang ký quỹ</Text>
                <Text className="font-bold text-amber-600">{formatVnd(job.price)}</Text>
              </View>
              {renderReleaseButton(job)}
            </View>
          ))}
        </View>
      )}

      <Text className="font-bold text-sm text-gray-800 mb-2">Đã hoàn thành</Text>

      {!hasRows ? (
        <EmptyState
          icon="📭"
          title="Chưa có việc nào hoàn thành"
          subtitle="Các công việc đã hoàn thành sẽ xuất hiện ở đây."
        />
      ) : doneJobs.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Chưa có việc nào hoàn thành"
          subtitle="Các công việc đã hoàn thành sẽ xuất hiện ở đây."
        />
      ) : (
        doneJobs.map(job => {
          const isOwner = job.owner.id === profile?.id
          const escrow = escrowByJob.get(job.id)
          const isPayee = !!escrow && escrow.payeeId === profile?.id
          return (
            <View key={job.id} className="bg-white border border-gray-200 rounded-2xl p-3.5 space-y-1.5 mb-3">
              <View className="flex-row items-start justify-between">
                <Text className="font-bold text-xs text-gray-800 leading-tight flex-1 pr-2">{job.title}</Text>
                <Text className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Hoàn thành</Text>
              </View>
              <Text className="text-[11px] text-gray-500">
                {isOwner ? 'Người nhận: Tasker' : `Khách: ${job.owner.name}`}
              </Text>
              <View className="flex-row items-center justify-between pt-1 border-t border-gray-50">
                <Text className="text-[11px] text-gray-400">
                  {isPayee ? 'Bạn được nhận' : 'Đã ký quỹ'}
                </Text>
                <Text className="font-bold text-emerald-600">
                  {isPayee ? '+' : ''}
                  {formatVnd(escrow?.amount ?? job.price)}
                </Text>
              </View>
              <JobRatingBlock
                jobId={job.id}
                canRate={isOwner || isPayee}
                onRate={() => setRatingJob(job)}
              />
            </View>
          )
        })
      )}

      <RatingSheet
        visible={!!ratingJob}
        jobId={ratingJob?.id ?? ''}
        revieweeName={
          ratingJob && ratingJob.owner.id !== profile?.id ? ratingJob.owner.name : 'Người nhận việc'
        }
        onClose={() => setRatingJob(null)}
        onSubmitted={() => setRatingJob(null)}
      />
    </ScrollView>
  )
}

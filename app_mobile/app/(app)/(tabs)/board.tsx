import { Redirect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View, Alert } from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../../hooks/useAuth'
import { useDeviceLocation } from '../../../hooks/useDeviceLocation'
import { useJobs } from '../../../hooks/useJobs'
import { useUi } from '../../../hooks/useUi'
import { JobCard } from '../../../components/ui/JobCard'
import { SkeletonList } from '../../../components/ui/SkeletonCard'
import { EmptyState } from '../../../components/shared/EmptyState'
import { JobMap } from '../../../lib/features/jobs/components/JobMap'
import { DEFAULT_RADIUS_KM, Q1_CENTER } from '../../../lib/features/jobs/geo'
import { getApiErrorMessage } from '../../../lib/features/jobs/api'
import { useCart } from '../../../lib/features/wallet/context/CartContext'
import { RegistrationProgressBar } from '../../../components/ui/RegistrationProgressBar'
import { colors } from '../../../constants/theme'
import { useAi } from '../../../lib/features/ai/context/AiContext'
import type { JobModel } from '../../../lib/features/jobs/types'

export default function BoardScreen() {
  const { currentRole } = useAuth()
  if (currentRole === 'seeker') {
    return <Redirect href="/(app)/(tabs)/post" />
  }

  const { profile } = useAuth()
  const { position, request } = useDeviceLocation()
  const center = position ?? Q1_CENTER
  const router = useRouter()
  const { showToast } = useUi()
  const listRef = useRef<FlatList<JobModel>>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const { count, has, toggle, clear } = useCart()
  const { openAi } = useAi()

  // GPS is best-effort: the map/list start on the Q1 center and recenter
  // (refetch by query key) as soon as the device position resolves.
  useEffect(() => {
    void request()
  }, [request])

  const params = useMemo(
    () => ({
      status: 'Open' as const,
      lat: center.lat,
      lng: center.lng,
      radius: DEFAULT_RADIUS_KM,
    }),
    [center.lat, center.lng],
  )
  const {
    jobs,
    loading,
    refreshing,
    refetch,
    acceptJob,
    releaseEscrow,
  } = useJobs(params)

  const handleSelectJob = useCallback(
    (id: string) => {
      setSelectedId(id)
      const index = jobs.findIndex((job) => job.id === id)
      if (index < 0) return
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.1 })
    },
    [jobs],
  )

  const exitSelection = useCallback(() => {
    clear()
    setSelectionMode(false)
  }, [clear])

  const handleToggle = useCallback(
    (id: string) => {
      // Toggling off the last selected card leaves selection mode.
      if (selectionMode) {
        if (has(id) && count === 1) {
          exitSelection()
          return
        }
        toggle(id)
        return
      }
      setSelectionMode(true)
      toggle(id)
    },
    [selectionMode, has, count, exitSelection, toggle],
  )

  // Board checkout: release escrows for jobs the caller owns (already reported)
  // and accept the Open jobs the caller does not own, one by one.
  const handleCheckout = useCallback(async () => {
    if (!profile || checkingOut) return
    const selectedJobs = jobs.filter((job) => has(job.id))
    if (selectedJobs.length === 0) return

    let totalTokenFee = 0
    let jobsToAccept = 0

    for (const job of selectedJobs) {
      if (job.owner.id !== profile.id && job.status === 'Open') {
        jobsToAccept += 1
        totalTokenFee += Math.ceil(job.price / 10000)
      }
    }

    const executeCheckout = async () => {
      setCheckingOut(true)
      let accepted = 0
      let released = 0
      let skipped = 0
      const failures: string[] = []

      for (const job of selectedJobs) {
        try {
          if (job.owner.id === profile.id) {
            if (job.isCompletedReported) {
              await releaseEscrow(job.id)
              released += 1
            } else {
              skipped += 1
            }
          } else if (job.status === 'Open') {
            await acceptJob(job.id)
            accepted += 1
          } else {
            skipped += 1
          }
        } catch (error) {
          failures.push(getApiErrorMessage(error, `Không xử lý được "${job.title}".`))
        }
      }

      setCheckingOut(false)
      exitSelection()

      if (failures.length > 0) {
        const done = accepted + released
        showToast(
          done > 0
            ? `Đã xử lý ${done} việc, ${failures.length} việc lỗi: ${failures[0]}`
            : failures[0],
          'error',
        )
        return
      }

      const parts = [`Đã nhận ${accepted} việc`]
      if (released > 0) parts.push(`giải ngân ${released} việc`)
      if (skipped > 0) parts.push(`bỏ qua ${skipped} việc`)
      showToast(`${parts.join(', ')}.`, 'success')
    }

    if (jobsToAccept > 0) {
      Alert.alert(
        'Xác nhận nhận việc',
        `Bạn đang chọn ${jobsToAccept} công việc mới.\nTổng phí nhận việc là ${totalTokenFee} Token sẽ bị trừ khỏi ví của bạn.`,
        [
          { text: 'Huỷ', style: 'cancel' },
          { text: 'Xác nhận', onPress: () => void executeCheckout() }
        ]
      )
    } else {
      void executeCheckout()
    }
  }, [profile, checkingOut, jobs, has, acceptJob, exitSelection, releaseEscrow, showToast])

  if (loading) {
    return <SkeletonList />
  }

  return (
    <View className="flex-1">
      <FlatList
        ref={listRef}
        className="flex-1"
        contentContainerClassName={`pt-4 grow ${selectionMode ? 'pb-28' : 'pb-6'}`}
        data={jobs}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refetch()} tintColor={colors.teal} />
        }
        onScrollToIndexFailed={(info) =>
          listRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          })
        }
        ListHeaderComponent={
          <View className="px-4">
            <RegistrationProgressBar />
            <View className="mb-4">
              <Text className="text-lg font-extrabold text-gray-800">Việc gần bạn</Text>
              <Text className="text-xs text-gray-500">
                Gợi ý theo vị trí GPS & kỹ năng phù hợp với hồ sơ của bạn
              </Text>
            </View>

            {/* AI Smart Search Banner for Tasker */}
            <TouchableOpacity
              onPress={() => openAi('Tìm việc máy tính và IT phù hợp')}
              className="bg-teal-50 border border-teal-200 rounded-2xl p-3 mb-4 flex-row items-center justify-between"
            >
              <View className="flex-row items-center space-x-2.5 flex-1 mr-2">
                <View className="w-8 h-8 rounded-xl bg-teal-600 items-center justify-center">
                  <FontAwesome name="magic" size={13} color="white" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-extrabold text-teal-900">
                    ✨ AI Gợi ý việc thông minh
                  </Text>
                  <Text className="text-[10px] text-teal-700">
                    Dùng ngôn ngữ tự nhiên để lọc việc theo kỹ năng của bạn
                  </Text>
                </View>
              </View>
              <View className="bg-teal-600 px-2.5 py-1.5 rounded-xl">
                <Text className="text-white text-[10px] font-bold">Tìm ngay</Text>
              </View>
            </TouchableOpacity>

            <JobMap
              jobs={jobs}
              center={center}
              userPosition={position}
              selectedId={selectedId}
              currentUserId={profile?.id}
              onSelectJob={handleSelectJob}
            />

            <View className="flex-row items-center justify-between mb-2 mt-4">
              <Text className="font-bold text-sm text-gray-800">Danh sách việc khả dụng</Text>
              <Text className="text-[11px] text-gray-400">
                {selectionMode ? 'Chạm để chọn nhiều việc' : `${jobs.length} việc`}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="📭"
            title="Hiện chưa có việc mới"
            subtitle="Hãy quay lại sau hoặc kéo xuống để làm mới danh sách."
          />
        }
        renderItem={({ item }) => (
          <JobCard
            job={item}
            selected={selectionMode ? has(item.id) : item.id === selectedId}
            onLongPress={() => handleToggle(item.id)}
            onPress={() => {
              if (selectionMode) {
                handleToggle(item.id)
                return
              }
              setSelectedId(item.id)
              router.push(`/(app)/job/${item.id}`)
            }}
          />
        )}
      />

      {selectionMode && (
        <View className="absolute bottom-4 left-4 right-4 bg-gray-900 rounded-2xl px-4 py-3 flex-row items-center shadow-lg">
          <View className="flex-row items-center space-x-2 flex-1">
            <FontAwesome name="check-square-o" size={14} color={colors.orangeBorder} />
            <Text className="text-white text-xs font-bold">Đã chọn {count}</Text>
          </View>
          <TouchableOpacity onPress={exitSelection} className="px-3 py-2 rounded-xl mr-1">
            <Text className="text-gray-300 text-xs font-bold">Huỷ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleCheckout()}
            disabled={count === 0 || checkingOut}
            className={`bg-orange-500 px-4 py-2 rounded-xl flex-row items-center ${
              count === 0 || checkingOut ? 'opacity-60' : ''
            }`}
          >
            {checkingOut ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <FontAwesome name="bolt" size={11} color="white" />
                <Text className="text-white text-xs font-bold ml-1.5">Xác nhận</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

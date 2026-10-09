import { Redirect } from 'expo-router'
import { useMemo } from 'react'
import { FlatList, RefreshControl, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../../hooks/useAuth'
import { useJobs } from '../../../hooks/useJobs'
import { JobCard } from '../../../components/ui/JobCard'
import { SkeletonList } from '../../../components/ui/SkeletonCard'
import { EmptyState } from '../../../components/shared/EmptyState'
import { RegistrationProgressBar } from '../../../components/ui/RegistrationProgressBar'
import { colors } from '../../../constants/theme'

export default function JobsScreen() {
  const { currentRole } = useAuth()
  if (currentRole === 'tasker') {
    return <Redirect href="/(app)/(tabs)/board" />
  }

  const { profile } = useAuth()
  const { jobs, loading, refreshing, refetch } = useJobs()
  const router = useRouter()

  const myJobs = useMemo(
    () => jobs.filter(job => job.owner.id === profile?.id),
    [jobs, profile?.id],
  )

  if (loading) {
    return <SkeletonList />
  }

  return (
    <FlatList
      contentContainerClassName="pt-4 pb-6 grow"
      data={myJobs}
      keyExtractor={item => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refetch()} tintColor={colors.orange} />
      }
      ListHeaderComponent={
        <View className="px-4 mb-2">
          <RegistrationProgressBar />
          <Text className="text-lg font-extrabold text-gray-800">Việc của tôi</Text>
          <Text className="text-xs text-gray-500">{myJobs.length} công việc đã đăng</Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="📭"
          title="Bạn chưa có việc nào"
          subtitle="Hãy đăng việc mới để Tasker phù hợp nhận giúp bạn."
        />
      }
      renderItem={({ item }) => (
        <JobCard job={item} onPress={() => router.push(`/(app)/job/${item.id}`)} />
      )}
    />
  )
}

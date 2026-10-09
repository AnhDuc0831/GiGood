import { Redirect } from 'expo-router'
import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useAuth } from '../../../hooks/useAuth'
import { useJobs } from '../../../hooks/useJobs'
import { useEscrows, useWallet } from '../../../hooks/useWallet'
import { formatVnd } from '../../../lib/format'
import { LoadingSpinner } from '../../../components/shared/LoadingSpinner'
import { EmptyState } from '../../../components/shared/EmptyState'
import { colors } from '../../../constants/theme'

function formatDate(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

export default function EarningsScreen() {
  const { currentRole } = useAuth()
  if (currentRole === 'seeker') {
    return <Redirect href="/(app)/(tabs)/post" />
  }

  const { profile } = useAuth()
  const { balance, escrowHeld, transactions, loading, refetch } = useWallet()
  const { escrows, refetch: refetchEscrows } = useEscrows({ status: 'Released' })
  const { jobs: doneJobs, refetch: refetchJobs } = useJobs({ mine: true, status: 'Done' })
  const [refreshing, setRefreshing] = useState(false)

  const myReleasedEscrows = useMemo(
    () => escrows.filter((escrow) => escrow.payeeId === profile?.id),
    [escrows, profile?.id],
  )

  const releaseTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.type === 'Release'),
    [transactions],
  )

  const totalEarnings = useMemo(
    () => releaseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    [releaseTransactions],
  )

  const jobTitles = useMemo(() => {
    const map = new Map<string, string>()
    for (const job of doneJobs) map.set(job.id, job.title)
    return map
  }, [doneJobs])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refetch(), refetchEscrows(), refetchJobs()])
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return <LoadingSpinner text="Đang tải thu nhập..." />
  }

  return (
    <ScrollView
      className="flex-1 px-4 py-4"
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.teal} />
      }
    >
      <Text className="text-lg font-extrabold text-gray-800 mb-4">Thu nhập của bạn</Text>

      {/* Wallet card */}
      <View className="bg-teal-600 rounded-2xl p-4 mb-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-teal-100 text-[11px] font-bold">Số dư khả dụng</Text>
          <FontAwesome name="credit-card" size={14} color={colors.tealSoft} />
        </View>
        <Text className="text-white text-2xl font-extrabold mt-1">{formatVnd(balance)}</Text>
        <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-teal-500">
          <Text className="text-teal-100 text-[11px] font-bold">
            <FontAwesome name="shield" size={10} color={colors.tealSoft} /> Đang giữ ký quỹ
          </Text>
          <Text className="text-teal-50 text-xs font-extrabold">{formatVnd(escrowHeld)}</Text>
        </View>
      </View>

      {/* Stat cards */}
      <View className="flex-row gap-3 mb-4">
        <View className="flex-1 bg-white border border-gray-200 rounded-2xl p-3.5">
          <FontAwesome name="money" size={14} color={colors.teal} style={{ marginBottom: 6 }} />
          <Text className="text-base font-extrabold text-gray-800">{formatVnd(totalEarnings)}</Text>
          <Text className="text-[10px] text-gray-400 font-medium">Tổng thu nhập</Text>
        </View>
        <View className="flex-1 bg-white border border-gray-200 rounded-2xl p-3.5">
          <FontAwesome name="check-circle" size={14} color={colors.orange} style={{ marginBottom: 6 }} />
          <Text className="text-base font-extrabold text-gray-800">{myReleasedEscrows.length}</Text>
          <Text className="text-[10px] text-gray-400 font-medium">Việc hoàn thành</Text>
        </View>
      </View>

      <View>
        <Text className="font-bold text-sm text-gray-800 mb-2">Lịch sử nhận tiền</Text>
        {releaseTransactions.length === 0 ? (
          <EmptyState
            icon="📭"
            title="Chưa có giao dịch nào"
            subtitle="Thu nhập từ các việc đã giải ngân sẽ hiện ở đây."
          />
        ) : (
          releaseTransactions.map(transaction => (
            <View key={transaction.id} className="bg-white border border-gray-200 rounded-2xl p-3.5 flex-row items-center justify-between mb-2.5">
              <View className="flex-1 min-w-0 pr-2">
                <Text className="font-bold text-xs text-gray-800 leading-tight truncate">
                  {transaction.refJobId ? jobTitles.get(transaction.refJobId) ?? 'Công việc' : 'Giao dịch ví'}
                </Text>
                <Text className="text-[10px] text-gray-400">
                  {formatDate(transaction.createdAt)} · Giải ngân
                </Text>
              </View>
              <Text className="font-bold text-xs text-emerald-600 flex-shrink-0">
                +{formatVnd(transaction.amount)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

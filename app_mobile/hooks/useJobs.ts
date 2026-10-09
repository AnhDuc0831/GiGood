import { useCallback } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useGiGood } from '../lib/GiGoodContext'
import { USE_MOCK } from '../lib/core/config/env'
import * as jobsApi from '../lib/features/jobs/api'
import {
  mockAcceptJob,
  mockCancelJob,
  mockCreateJob,
  mockDeleteJob,
  mockGetJob,
  mockListJobs,
  mockRefundJob,
  mockReleaseEscrowJob,
  mockReportJob,
  mockUpdateJob,
  type MockViewer,
} from '../lib/features/jobs/mock'
import type {
  CreateJobBody,
  JobModel,
  JobListParams,
  JobListResponse,
  UpdateJobBody,
} from '../lib/features/jobs/types'
import type { UserProfile } from '../types'

export const jobsQueryKey = (params?: JobListParams) => ['jobs', params ?? {}] as const
export const jobQueryKey = (id: string) => ['job', id] as const

function toViewer(profile: UserProfile | null): MockViewer {
  if (!profile) return null
  return { id: profile.id, name: profile.name, avatarUrl: profile.avatar || null, role: profile.role }
}

/** Escrow mutations touch the job lists, the detail cache, the wallet and escrows. */
function invalidateTransactionData(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['jobs'] })
  void queryClient.invalidateQueries({ queryKey: ['job'] })
  void queryClient.invalidateQueries({ queryKey: ['wallet'] })
  void queryClient.invalidateQueries({ queryKey: ['escrows'] })
}

/**
 * Jobs data source for the app. Backed by React Query; when
 * `EXPO_PUBLIC_USE_MOCK=1` every call falls back to `lib/seed.ts` via
 * `lib/features/jobs/mock.ts` so the demo still renders offline.
 */
export function useJobs(params?: JobListParams) {
  const queryClient = useQueryClient()
  const { state } = useGiGood()
  const viewer = toViewer(state.auth.profile)

  const jobsQuery = useQuery<JobListResponse>({
    queryKey: jobsQueryKey(params),
    queryFn: () =>
      USE_MOCK ? mockListJobs(params, viewer) : jobsApi.listJobs(params),
  })

  const createMutation = useMutation({
    mutationFn: (body: CreateJobBody) =>
      USE_MOCK ? Promise.resolve(mockCreateJob(body, viewer)) : jobsApi.createJob(body),
    onSuccess: (job) => {
      queryClient.setQueryData(jobQueryKey(job.id), job)
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateJobBody }) =>
      USE_MOCK ? Promise.resolve(mockUpdateJob(id, body)) : jobsApi.updateJob(id, body),
    onSuccess: (job) => {
      queryClient.setQueryData(jobQueryKey(job.id), job)
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      USE_MOCK ? Promise.resolve(mockDeleteJob(id)) : jobsApi.deleteJob(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: jobQueryKey(id) })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  // --- task 06 escrow lifecycle ------------------------------------------------

  const acceptMutation = useMutation<JobModel, unknown, string>({
    mutationFn: (id: string) =>
      USE_MOCK ? Promise.resolve(mockAcceptJob(id, viewer)) : jobsApi.acceptJob(id),
    onSuccess: () => invalidateTransactionData(queryClient),
  })

  const reportMutation = useMutation<void, unknown, string>({
    mutationFn: async (id: string) => {
      if (USE_MOCK) {
        mockReportJob(id, viewer)
        return
      }
      await jobsApi.reportJob(id)
    },
    onSuccess: () => invalidateTransactionData(queryClient),
  })

  const releaseMutation = useMutation<JobModel, unknown, string>({
    mutationFn: (id: string) =>
      USE_MOCK ? Promise.resolve(mockReleaseEscrowJob(id, viewer)) : jobsApi.releaseEscrow(id),
    onSuccess: () => invalidateTransactionData(queryClient),
  })

  const cancelMutation = useMutation<JobModel | null, unknown, string>({
    mutationFn: (id: string) =>
      USE_MOCK ? Promise.resolve(mockCancelJob(id, viewer)) : jobsApi.cancelJob(id),
    onSuccess: () => invalidateTransactionData(queryClient),
  })

  const refundMutation = useMutation<JobModel, unknown, string>({
    mutationFn: (id: string) =>
      USE_MOCK ? Promise.resolve(mockRefundJob(id, viewer)) : jobsApi.refundJob(id),
    onSuccess: () => invalidateTransactionData(queryClient),
  })

  const uploadImage = useCallback(
    async (localUri: string): Promise<string> =>
      USE_MOCK ? localUri : jobsApi.uploadImage(localUri),
    [],
  )

  return {
    jobs: jobsQuery.data?.jobs ?? [],
    nextCursor: jobsQuery.data?.nextCursor ?? null,
    loading: jobsQuery.isLoading,
    refreshing: jobsQuery.isRefetching,
    error: jobsQuery.error,
    refetch: jobsQuery.refetch,
    createJob: createMutation.mutateAsync,
    updateJob: updateMutation.mutateAsync,
    deleteJob: deleteMutation.mutateAsync,
    acceptJob: acceptMutation.mutateAsync,
    reportJob: reportMutation.mutateAsync,
    releaseEscrow: releaseMutation.mutateAsync,
    cancelJob: cancelMutation.mutateAsync,
    refundJob: refundMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isAccepting: acceptMutation.isPending,
    isReporting: reportMutation.isPending,
    isReleasing: releaseMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isRefunding: refundMutation.isPending,
    uploadImage,
  }
}

/** Detail query for a single job (`undefined` id keeps the query idle). */
export function useJob(id?: string) {
  const { state } = useGiGood()
  const viewer = toViewer(state.auth.profile)

  const query = useQuery<JobModel | null>({
    queryKey: jobQueryKey(id ?? ''),
    enabled: !!id,
    queryFn: () => {
      if (!id) return null
      if (USE_MOCK) return Promise.resolve(mockGetJob(id, viewer))
      return jobsApi.getJob(id)
    },
  })

  return {
    job: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

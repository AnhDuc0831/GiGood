import { INITIAL_JOBS } from '../../seed'
import { mockGetEscrow, mockHoldEscrow, mockRefundEscrow, mockReleaseEscrow, mockBalanceOf, mockTopUp } from '../wallet/mock'
import { haversineKm } from './geo'
import type { Job } from '../../../types'
import type {
  ApiJobStatus,
  CreateJobBody,
  
  JobListParams,
  JobListResponse,
  JobModel,
  UpdateJobBody,
} from './types'

/**
 * Offline fallback used when `EXPO_PUBLIC_USE_MOCK=1`: keeps the demo seed
 * (`lib/seed.ts`) rendering and lets the CRUD surface work without the API.
 */
export const MOCK_OWNER_ID = 'mock-owner'

export type MockViewer = {
  id: string
  name: string
  avatarUrl?: string | null
  role?: 'seeker' | 'tasker'
} | null

const STATUS_MAP: Record<Job['status'], ApiJobStatus> = {
  finding: 'Open',
  assigned: 'Assigned',
  completed: 'Done',
}

const MOCK_OWNER = {
  id: MOCK_OWNER_ID,
  name: 'Khánh Vy',
  avatarUrl: null as string | null,
  ratingAvg: 4.9,
}

function fromSeed(job: Job, index: number): JobModel {
  const createdAt = new Date(Date.now() - index * 3_600_000).toISOString()
  return {
    id: `seed-${job.id}`,
    owner: { ...MOCK_OWNER, name: job.seekerName || MOCK_OWNER.name },
    title: job.title,
    description: job.description,
    category: job.category,
    price: job.budget,
    status: STATUS_MAP[job.status],
    isCompletedReported: false,
    lat: job.lat,
    lng: job.lng,
    distanceKm: null,
    locationText: job.location,
    images: [],
    createdAt,
    updatedAt: createdAt,
    isUrgent: false,
  }
}

let mockJobs: JobModel[] = INITIAL_JOBS.map(fromSeed)
const mockJobWorkers = new Map<string, string>()
let nextMockId = 1

export function mockGetJobWorker(jobId: string): string | null {
  return mockJobWorkers.get(jobId) ?? null
}

/** Seed jobs belong to the demo seeker: stamp the signed-in user so owner actions work. */
function stampOwner(job: JobModel, viewer: MockViewer): JobModel {
  if (!viewer || viewer.role !== 'seeker' || job.owner.id !== MOCK_OWNER_ID) return job
  return {
    ...job,
    owner: {
      ...job.owner,
      id: viewer.id,
      name: viewer.name,
      avatarUrl: viewer.avatarUrl ?? job.owner.avatarUrl,
    },
  }
}

export function mockListJobs(params: JobListParams = {}, viewer: MockViewer = null): JobListResponse {
  let jobs = mockJobs.map((job) => stampOwner(job, viewer))

  if (params.mine) {
    const viewerId = viewer?.id
    jobs = viewerId
      ? jobs.filter((job) => {
          if (job.owner.id === viewerId) return true
          return mockJobWorkers.get(job.id) === viewerId
        })
      : []
  }

  if (params.status) {
    jobs = jobs.filter((job) => job.status === params.status)
  }
  if (params.category) {
    jobs = jobs.filter((job) => job.category === params.category)
  }
  if (params.q) {
    const query = params.q.trim().toLowerCase()
    jobs = jobs.filter(
      (job) =>
        job.title.toLowerCase().includes(query) ||
        job.description.toLowerCase().includes(query),
    )
  }

  const centerLat = params.lat
  const centerLng = params.lng
  if (centerLat != null && centerLng != null) {
    const radiusKm = params.radius ?? 50
    jobs = jobs
      .map((job) => {
        if (job.lat != null && job.lng != null) {
          return { ...job, distanceKm: haversineKm({ lat: centerLat, lng: centerLng }, { lat: job.lat, lng: job.lng }) }
        }
        return { ...job, distanceKm: null }
      })
      .filter((job) => job.distanceKm == null || job.distanceKm <= radiusKm)
      .sort((a, b) => {
        if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
        if (a.distanceKm != null) return -1
        if (b.distanceKm != null) return 1
        return b.createdAt.localeCompare(a.createdAt)
      })
  } else {
    jobs = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  const limit = params.limit ?? 20
  return { jobs: jobs.slice(0, limit), nextCursor: null }
}

export function mockGetJob(id: string, viewer: MockViewer = null): JobModel | null {
  const job = mockJobs.find((item) => item.id === id)
  return job ? stampOwner(job, viewer) : null
}

export function mockCreateJob(body: CreateJobBody, viewer: MockViewer = null): JobModel {
  if (viewer) {
    const cost = body.isUrgent ? 15 : 10;
    const b = mockTopUp(viewer.id, 'seeker', -cost);
    if (b.balance < 0) {
        mockTopUp(viewer.id, 'seeker', cost);
        throw new Error('Số dư không đủ. Vui lòng nạp thêm Token.');
    }
  }
  const now = new Date().toISOString()
  const owner = viewer
    ? { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl ?? null, ratingAvg: 0 }
    : { ...MOCK_OWNER }
  const job: JobModel = {
    id: `mock-${Date.now()}-${nextMockId++}`,
    owner,
    title: body.title,
    description: body.description,
    category: body.category,
    price: body.price,
    status: 'Open',
    isCompletedReported: false,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    isUrgent: body.isUrgent ?? false,
    distanceKm: null,
    locationText: body.locationText ?? null,
    images: body.images ?? [],
    createdAt: now,
    updatedAt: now,
  }
  mockJobs = [job, ...mockJobs]
  return job
}

export function mockUpdateJob(id: string, body: UpdateJobBody): JobModel {
  const current = mockJobs.find((item) => item.id === id)
  if (!current) throw new Error('Không tìm thấy công việc.')

  // Only apply fields that were actually sent (undefined = untouched).
  const patch = Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  ) as UpdateJobBody

  const updated: JobModel = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  mockJobs = mockJobs.map((item) => (item.id === id ? updated : item))
  return updated
}

export function mockDeleteJob(id: string): void {
  const exists = mockJobs.some((item) => item.id === id)
  if (!exists) throw new Error('Không tìm thấy công việc.')
  mockJobs = mockJobs.filter((item) => item.id !== id)
}

// --- task 06 escrow lifecycle (mirrors JobsEndpoints accept/report/release/cancel/refund) ---

function findJob(id: string): JobModel {
  const job = mockJobs.find((item) => item.id === id)
  if (!job) throw new Error('Không tìm thấy công việc.')
  return job
}

function requireViewer(viewer: MockViewer): NonNullable<MockViewer> {
  if (!viewer) throw new Error('Bạn cần đăng nhập để thực hiện thao tác này.')
  return viewer
}

function updateMockJob(
  id: string,
  patch: Partial<Pick<JobModel, 'status' | 'isCompletedReported'>>,
): JobModel {
  const updated = { ...findJob(id), ...patch, updatedAt: new Date().toISOString() }
  mockJobs = mockJobs.map((item) => (item.id === id ? updated : item))
  return updated
}

export function mockAcceptJob(id: string, viewer: MockViewer): JobModel {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.owner.id === me.id) throw new Error('Bạn không thể nhận việc của chính mình.')
  if (job.status !== 'Open') {
    throw new Error('Công việc đã có người nhận hoặc không còn mở.')
  }

  const tokenFee = Math.ceil(job.price / 10000);
  const b = mockTopUp(me.id, 'tasker', -tokenFee);
  if (b.balance < 0) {
      mockTopUp(me.id, 'tasker', tokenFee);
      throw new Error(`Số dư không đủ để nhận việc. Cần ${tokenFee} Token.`);
  }
  
  mockJobWorkers.set(id, me.id)
  return updateMockJob(id, { status: 'Assigned' })
}

export function mockReportJob(id: string, viewer: MockViewer): void {
  const me = requireViewer(viewer)
  const job = findJob(id)
  // Verify the tasker who accepted the job
  if (job.status !== 'Assigned' || mockJobWorkers.get(id) !== me.id) {
    throw new Error('Bạn không phải người nhận việc của công việc này.')
  }
  // Mark as reported completed
  updateMockJob(id, { isCompletedReported: true })
}


export function mockReleaseEscrowJob(id: string, viewer: MockViewer): JobModel {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.owner.id !== me.id) throw new Error('Bạn không phải người trả tiền của công việc này.')
  return updateMockJob(id, { status: 'Done' })
}

export function mockCancelJob(id: string, viewer: MockViewer): JobModel | null {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.owner.id !== me.id) throw new Error('Bạn không phải chủ công việc.')
  if (job.status === 'Cancelled') return null
  if (job.status === 'Done') throw new Error('Công việc đã hoàn thành, không thể hủy.')
  if (job.status === 'Assigned' && job.isCompletedReported) {
    throw new Error('Người nhận việc đã báo hoàn thành, hãy giải ngân thay vì hủy.')
  }

  return updateMockJob(id, { status: 'Cancelled' })
}

export function mockRefundJob(id: string, viewer: MockViewer): JobModel {
  const me = requireViewer(viewer)
  const job = findJob(id)
  if (job.status !== 'Assigned') {
    throw new Error('Công việc không hợp lệ.')
  }
  mockJobWorkers.delete(id)
  return updateMockJob(id, { status: 'Open', isCompletedReported: false })
}

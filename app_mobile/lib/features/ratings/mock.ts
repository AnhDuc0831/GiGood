import { mockGetEscrow } from '../wallet/mock'
import { mockGetJob, mockGetJobWorker, mockListJobs } from '../jobs/mock'
import type { MockViewer } from '../jobs/mock'
import type {
  CreateRatingBody,
  RatingsListParams,
  Review,
  ReviewListResponse,
  UserRating,
} from './types'

/**
 * In-memory reviews for `EXPO_PUBLIC_USE_MOCK=1`, mirroring the task 07 API
 * contract so the RatingSheet flows and history stars work without a backend.
 */

let mockReviews: Review[] = []
let nextReviewId = 1

/** Error carrying an axios-like `response` so the sheet can read the status/detail. */
function mockApiError(status: number, detail: string): Error {
  // 403 mirrors `TypedResults.Problem` (ProblemDetails); the others mirror `ErrorResponse`.
  const data = status === 403 ? { detail } : { message: detail }
  return Object.assign(new Error(detail), { response: { status, data } })
}

function activePayeeId(jobId: string): string | null {
  const escrow = mockGetEscrow(jobId)
  if (escrow && (escrow.status === 'Held' || escrow.status === 'Released')) {
    return escrow.payeeId
  }
  return mockGetJobWorker(jobId)
}

/** Mirrors `ReviewService.CreateAsync` (Done check, participant check, unique reviewer). */
export function mockCreateRating(body: CreateRatingBody, viewer: MockViewer): Review {
  if (!viewer) throw mockApiError(401, 'Bạn cần đăng nhập để đánh giá.')
  if (body.rate < 1 || body.rate > 5) {
    throw mockApiError(400, 'Số sao phải trong khoảng 1-5.')
  }

  const job = mockGetJob(body.jobId, viewer)
  if (!job) throw mockApiError(404, 'Không tìm thấy công việc.')

  const payeeId = activePayeeId(job.id)
  const isOwner = job.owner.id === viewer.id
  const isPayee = payeeId === viewer.id
  if (!isOwner && !isPayee) {
    throw mockApiError(403, 'Bạn không phải người tham gia công việc này.')
  }

  // Allow rating if job is Done, OR if tasker (isPayee) has reported completion
  if (job.status !== 'Done' && !(isPayee && job.isCompletedReported)) {
    throw mockApiError(400, 'Công việc chưa hoàn thành, chưa thể đánh giá.')
  }

  const revieweeId = isOwner ? payeeId : job.owner.id
  if (!revieweeId || revieweeId === viewer.id) {
    throw mockApiError(400, 'Bạn không thể tự đánh giá chính mình.')
  }

  if (mockReviews.some((review) => review.jobId === job.id && review.reviewer.id === viewer.id)) {
    throw mockApiError(409, 'Bạn đã đánh giá công việc này rồi.')
  }

  const review: Review = {
    id: `mock-review-${nextReviewId++}`,
    jobId: job.id,
    job: { id: job.id, title: job.title },
    reviewer: { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl ?? null },
    revieweeId,
    rate: body.rate,
    comment: body.comment?.trim() ? body.comment.trim() : null,
    createdAt: new Date().toISOString(),
  }
  mockReviews = [review, ...mockReviews]
  return review
}

/** Mirrors `GET /api/ratings`: filters, newest-first slice and `avg` of the filtered set. */
export function mockListRatings(params: RatingsListParams): ReviewListResponse {
  let reviews = [...mockReviews]
  if (params.jobId) {
    reviews = reviews.filter((review) => review.jobId === params.jobId)
  }
  if (params.userId) {
    reviews = reviews.filter((review) => review.revieweeId === params.userId)
  }
  reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const avg =
    reviews.length === 0
      ? 0
      : Math.round((reviews.reduce((sum, review) => sum + review.rate, 0) / reviews.length) * 100) /
        100

  return { reviews: reviews.slice(0, params.limit ?? 20), nextCursor: null, avg }
}

/** Mirrors `GET /api/users/{id}/rating`; a fresh demo user keeps the old profile seed. */
export function mockGetUserRating(userId: string, viewer: MockViewer = null): UserRating {
  const received = mockReviews.filter((review) => review.revieweeId === userId)
  const jobs = mockListJobs({ limit: 50 }, viewer).jobs
  const jobsDone = jobs.filter(
    (job) =>
      job.status === 'Done' &&
      (job.owner.id === userId || activePayeeId(job.id) === userId),
  ).length

  if (received.length === 0) {
    // Demo parity with the old hard-coded `★ 4.9` profile rating; real local
    // reviews override it once any exist.
    return { avg: 4.9, count: 12, jobsDone }
  }

  const avg =
    Math.round((received.reduce((sum, review) => sum + review.rate, 0) / received.length) * 100) /
    100
  return { avg, count: received.length, jobsDone }
}

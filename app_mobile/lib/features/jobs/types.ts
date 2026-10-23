import type { Category } from '../../../types'
import type { Escrow } from '../wallet/types'

/** Server status enum (`Api/Features/Jobs/Job.cs`): Open | Assigned | Done | Cancelled. */
export type ApiJobStatus = 'Open' | 'Assigned' | 'Done' | 'Cancelled'

export type JobOwner = {
  id: string
  name: string
  avatarUrl: string | null
  ratingAvg: number
}

export type JobTasker = {
  id: string
  name: string
  avatarUrl: string | null
  ratingAvg: number
}

/** Mirrors `JobDto` from `Api/Features/Jobs/Dtos.cs`. */
export type JobModel = {
  id: string
  owner: JobOwner
  tasker?: JobTasker | null
  title: string
  description: string
  category: Category
  price: number
  status: ApiJobStatus
  isCompletedReported: boolean
  lat: number | null
  lng: number | null
  /** Only set when the list is queried with `lat`/`lng`. */
  distanceKm?: number | null
  locationText: string | null
  images: string[]
  isUrgent: boolean
  createdAt: string
  updatedAt: string
}

export type JobListResponse = {
  jobs: JobModel[]
  nextCursor: string | null
}

export type JobListParams = {
  status?: ApiJobStatus
  category?: Category
  lat?: number
  lng?: number
  radius?: number
  q?: string
  cursor?: string
  limit?: number
  /** `mine=true` -> owner's jobs + jobs where the caller is the accepted payee. */
  mine?: boolean
}

export type CreateJobBody = {
  title: string
  description: string
  category: Category
  price: number
  lat?: number | null
  lng?: number | null
  locationText?: string | null
  images?: string[]
  isUrgent?: boolean
}

export type UpdateJobBody = {
  title?: string
  description?: string
  category?: Category
  price?: number
  lat?: number | null
  lng?: number | null
  locationText?: string | null
}

export type UploadResponse = {
  url: string
}

/** Task 06 escrow transitions return the updated escrow + credited/debited balance. */
export type JobEscrowResponse = {
  escrow: Escrow
  balance: number
}

/** `GET /api/meta/categories` (public). */
export type CategoryMetaDto = {
  key: Category
  label: string
  icon: string
}

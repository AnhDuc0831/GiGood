import type { AxiosError } from 'axios'
import apiClient from '../../core/api/client'
import { API_BASE_URL } from '../../core/config/env'
import type {
  CreateJobBody,
  JobEscrowResponse,
  JobListParams,
  JobListResponse,
  JobModel,
  UpdateJobBody,
  UploadResponse,
} from './types'

export async function listJobs(params: JobListParams = {}): Promise<JobListResponse> {
  const { data } = await apiClient.get<JobListResponse>('/api/jobs', { params })
  return data
}

export async function getJob(id: string): Promise<JobModel> {
  const { data } = await apiClient.get<JobModel>(`/api/jobs/${id}`)
  return data
}

export async function createJob(body: CreateJobBody): Promise<JobModel> {
  const { data } = await apiClient.post<JobModel>('/api/jobs', body)
  return data
}

export async function updateJob(id: string, body: UpdateJobBody): Promise<JobModel> {
  const { data } = await apiClient.patch<JobModel>(`/api/jobs/${id}`, body)
  return data
}

export async function deleteJob(id: string): Promise<void> {
  await apiClient.delete(`/api/jobs/${id}`)
}

// --- task 06 escrow lifecycle -------------------------------------------------

/** `POST /api/jobs/{id}/accept` (tasker) */
export async function acceptJob(id: string): Promise<JobModel> {
  const { data } = await apiClient.post<JobModel>(`/api/jobs/${id}/accept`)
  return data
}

/** `POST /api/jobs/{id}/report` (assigned tasker) -> 204. */
export async function reportJob(id: string): Promise<void> {
  await apiClient.post(`/api/jobs/${id}/report`)
}

/** `POST /api/jobs/{id}/release-escrow` (owner, Held) -> Released + payee credited. */
export async function releaseEscrow(id: string): Promise<JobModel> {
  const { data } = await apiClient.post<JobModel>(`/api/jobs/${id}/release-escrow`)
  return data
}

/** `POST /api/jobs/{id}/cancel` (owner) -> refunds Held escrow, or 204 when Open without escrow. */
export async function cancelJob(id: string): Promise<JobModel | null> {
  const { data, status } = await apiClient.post<JobModel>(`/api/jobs/${id}/cancel`)
  return status === 204 ? null : data
}

/** `POST /api/jobs/{id}/refund` (assigned tasker abandons) -> job back to Open. */
export async function refundJob(id: string): Promise<JobModel> {
  const { data } = await apiClient.post<JobModel>(`/api/jobs/${id}/refund`)
  return data
}

/**
 * Uploads a local picker uri as multipart form-data field `file`
 * (`POST /api/upload` -> `{url: "/uploads/..."}`). Returns the relative url.
 * The axios client attaches the bearer token via its request interceptor.
 */
export async function uploadImage(localUri: string): Promise<string> {
  const form = new FormData()
  form.append('file', { uri: localUri, name: 'photo.jpg', type: 'image/jpeg' } as any)
  const { data } = await apiClient.post<UploadResponse>('/api/upload', form)
  return data.url
}

/**
 * `/uploads/xxx` is relative to the API host, so it must be prefixed before
 * rendering. Absolute urls (`https://`, `file://`, `content://`, ...) pass through.
 */
export function resolveImageUrl(url?: string | null): string | null {
  if (!url) return null
  if (/^(https?:|file:|content:|data:|blob:)/i.test(url)) return url
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`
  return url
}

type ApiErrorBody = {
  detail?: string
  title?: string
  /** `ErrorResponse` from `Api.Features.Auth.Dtos` serializes as `{message}`. */
  message?: string
  errors?: Record<string, string[]>
}

/** Pulls a human-readable Vietnamese message out of an axios/API error. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as AxiosError<ApiErrorBody> | undefined)?.response
  const data = response?.data
  if (data?.errors) {
    const first = Object.values(data.errors)[0]
    if (first?.[0]) return first[0]
  }
  if (data?.detail) return data.detail
  if (data?.message) return data.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

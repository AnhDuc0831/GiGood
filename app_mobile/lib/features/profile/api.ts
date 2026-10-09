import apiClient from '../../core/api/client'
import type { Role } from '../../../types'
import type { AuthUserDto, MeResponse } from '../auth/types'
import type { AvatarResponse, ProfileUpdate, SwitchRoleResponse } from './types'

/** `GET /api/me` -> the current user (task 08 profile reload). */
export async function loadProfile(): Promise<AuthUserDto> {
  const { data } = await apiClient.get<MeResponse>('/api/me')
  return data.user
}

/** `PATCH /api/me` -> the updated user; null fields are left unchanged server-side. */
export async function updateProfile(body: ProfileUpdate): Promise<AuthUserDto> {
  const { data } = await apiClient.patch<AuthUserDto>('/api/me', body)
  return data
}

/** `POST /api/me/avatar` multipart field `file` -> `{avatarUrl}`. */
export async function uploadAvatar(localUri: string): Promise<string> {
  const form = new FormData()
  form.append('file', { uri: localUri, name: 'avatar.jpg', type: 'image/jpeg' } as any)
  const { data } = await apiClient.post<AvatarResponse>('/api/me/avatar', form)
  return data.avatarUrl
}

/** `POST /api/me/switch-role {role}` -> persisted role; 400 without a tasker profile. */
export async function switchRole(role: Role): Promise<Role> {
  const { data } = await apiClient.post<SwitchRoleResponse>('/api/me/switch-role', { role })
  return data.role
}

/** `POST /api/me/verify` -> `{verified}`. */
export async function verifyIdentity(): Promise<boolean> {
  const { data } = await apiClient.post<{ verified: boolean }>('/api/me/verify')
  return data.verified
}

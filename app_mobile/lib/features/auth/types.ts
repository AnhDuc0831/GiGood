import type {
  Availability,
  Category,
  Role,
  UserProfile,
  Vehicle,
} from '../../../types'
import { resolveImageUrl } from '../jobs/api'

export type TaskerProfileDto = {
  skills: string[]
  bio: string
  availability: string
  vehicle: string
  verified: boolean
}

export type AuthUserDto = {
  id: string
  phone: string
  name: string
  avatarUrl: string | null
  location: string | null
  ratingAvg: number
  currentRole: Role
  taskerProfile: TaskerProfileDto | null
  createdAt: string
  registrationProgress: {
    step1_PhoneVerified: boolean
    step2_ProfileCompleted: boolean
    step3_SkillsVerified: boolean
    bonusAwarded: boolean
  }
}

export type RegisterPayload = {
  name: string
  phone: string
  password: string
  location: string
  role: Role
  taskerProfile?: {
    skills: Category[]
    bio: string
    availability: Availability
    vehicle: Vehicle
  }
}

export type AuthResponse = {
  user: AuthUserDto
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export type TokenPair = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export type MeResponse = {
  user: AuthUserDto
  wallet: unknown | null
}

const ROLE_AVATARS: Record<Role, string> = {
  seeker:
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150',
  tasker:
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150',
}

export function toUserProfile(user: AuthUserDto): UserProfile {
  return {
    id: user.id,
    name: user.name,
    avatar: resolveImageUrl(user.avatarUrl) || ROLE_AVATARS[user.currentRole],
    role: user.currentRole,
    phone: user.phone,
    location: user.location ?? '',
    taskerProfile: user.taskerProfile
      ? {
          skills: user.taskerProfile.skills as Category[],
          bio: user.taskerProfile.bio,
          availability: user.taskerProfile.availability as Availability,
          vehicle: user.taskerProfile.vehicle as Vehicle,
          verified: user.taskerProfile.verified,
        }
      : null,
    registrationProgress: user.registrationProgress,
  }
}

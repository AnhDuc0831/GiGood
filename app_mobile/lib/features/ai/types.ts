import type { Category } from '../../../types'

export type AiChatMessage = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  time?: string
  jobDraft?: JobDraft | null
  jobRecommendations?: JobRecommendation[] | null
  taskerRecommendations?: TaskerRecommendation[] | null
}

export type JobDraft = {
  title: string
  category: Category
  description: string
  estimatedPrice: number
  isUrgent: boolean
}

export type JobRecommendation = {
  id: string
  title: string
  category: string
  price: number
  locationText: string | null
  matchReason: string
}

export type TaskerRecommendation = {
  id: string
  name: string
  avatarUrl: string | null
  ratingAvg: number
  skills: string[]
  bio: string | null
  matchReason: string
}

export type AiChatResponse = {
  reply: string
  jobDraft?: JobDraft | null
  jobRecommendations?: JobRecommendation[] | null
  taskerRecommendations?: TaskerRecommendation[] | null
  isConfigured: boolean
}

export type AiStatus = {
  configured: boolean
  model: string
  message: string
}

import apiClient from '../../core/api/client'
import { USE_MOCK } from '../../core/config/env'
import type { AiChatResponse, JobDraft, AiStatus } from './types'

export async function sendAiChat(
  message: string,
  history?: { role: 'user' | 'assistant'; content: string }[]
): Promise<AiChatResponse> {
  if (USE_MOCK) {
    return mockSendAiChat(message)
  }

  const { data } = await apiClient.post<AiChatResponse>('/api/ai/chat', {
    message,
    history,
  })
  return data
}

export async function draftJobWithAi(prompt: string): Promise<JobDraft> {
  if (USE_MOCK) {
    return mockDraftJob(prompt)
  }

  const { data } = await apiClient.post<JobDraft>('/api/ai/draft-job', {
    prompt,
  })
  return data
}

export async function getAiStatus(): Promise<AiStatus> {
  if (USE_MOCK) {
    return {
      configured: false,
      model: 'demo-local',
      message: 'Running in mock demo mode',
    }
  }

  const { data } = await apiClient.get<AiStatus>('/api/ai/status')
  return data
}

// Fallback mock logic for offline dev mode
function mockDraftJob(prompt: string): JobDraft {
  const lower = prompt.toLowerCase()
  if (lower.includes('c#') || lower.includes('code') || lower.includes('bài tập')) {
    return {
      title: 'Hỗ trợ giải & code bài tập C# OOP',
      category: 'helper',
      description: 'Cần bạn sinh viên am hiểu C# và OOP hỗ trợ viết code và giải thích bài tập lớn. Yêu cầu code sạch, có comment rõ ràng và chạy đúng yêu cầu đề bài.',
      estimatedPrice: 100000,
      isUrgent: false,
    }
  }
  if (lower.includes('dọn') || lower.includes('vệ sinh')) {
    return {
      title: 'Dọn dẹp phòng trọ cuối tuần',
      category: 'cleaning',
      description: 'Cần bạn phụ quét dọn phòng trọ, lau sàn, rửa chén bát và gom rác sạch sẽ, thời gian 1.5 - 2 tiếng.',
      estimatedPrice: 120000,
      isUrgent: false,
    }
  }
  return {
    title: prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt,
    category: 'helper',
    description: `Cần người hỗ trợ: ${prompt}. Yêu cầu nhiệt tình, hoàn thành đúng giờ.`,
    estimatedPrice: 90000,
    isUrgent: false,
  }
}

function mockSendAiChat(message: string): AiChatResponse {
  const lower = message.toLowerCase()
  if (lower.includes('code') || lower.includes('c#') || lower.includes('đăng việc') || lower.includes('tạo việc')) {
    const draft = mockDraftJob(message)
    return {
      reply: `Tôi đã soạn sẵn nội dung bài đăng việc **'${draft.title}'** cho bạn! Nhấn 'Áp dụng vào Đăng việc' bên dưới để điền form ngay nhé.`,
      jobDraft: draft,
      isConfigured: false,
    }
  }
  return {
    reply: `Chào bạn! Tôi là GiGood AI. Bạn có thể nhờ tôi soạn nội dung đăng việc (ví dụ: 'Code bài tập C#') hoặc tìm công việc phù hợp trong cơ sở dữ liệu.`,
    isConfigured: false,
  }
}

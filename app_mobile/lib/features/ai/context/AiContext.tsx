import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'expo-router'
import type { JobDraft } from '../types'
import { AiAssistantModal } from '../../../../components/modals/AiAssistantModal'

type AiContextValue = {
  isOpen: boolean
  openAi: (initialPrompt?: string) => void
  closeAi: () => void
  activeDraft: JobDraft | null
  applyDraftToPost: (draft: JobDraft) => void
  clearDraft: () => void
}

const AiCtx = createContext<AiContextValue | null>(null)

export function AiProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined)
  const [activeDraft, setActiveDraft] = useState<JobDraft | null>(null)
  const router = useRouter()

  const openAi = useCallback((prompt?: string) => {
    setInitialPrompt(prompt)
    setIsOpen(true)
  }, [])

  const closeAi = useCallback(() => {
    setIsOpen(false)
    setInitialPrompt(undefined)
  }, [])

  const applyDraftToPost = useCallback((draft: JobDraft) => {
    setActiveDraft(draft)
    setIsOpen(false)
    router.push('/(app)/(tabs)/post')
  }, [router])

  const clearDraft = useCallback(() => {
    setActiveDraft(null)
  }, [])

  const value = useMemo<AiContextValue>(
    () => ({
      isOpen,
      openAi,
      closeAi,
      activeDraft,
      applyDraftToPost,
      clearDraft,
    }),
    [isOpen, openAi, closeAi, activeDraft, applyDraftToPost, clearDraft]
  )

  return (
    <AiCtx.Provider value={value}>
      {children}
      <AiAssistantModal
        visible={isOpen}
        initialPrompt={initialPrompt}
        onClose={closeAi}
        onApplyDraft={applyDraftToPost}
      />
    </AiCtx.Provider>
  )
}

export function useAi() {
  const ctx = useContext(AiCtx)
  if (!ctx) {
    throw new Error('useAi must be used within AiProvider')
  }
  return ctx
}

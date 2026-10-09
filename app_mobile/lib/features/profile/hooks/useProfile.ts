import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useGiGood } from '../../../GiGoodContext'
import { toUserProfile } from '../../auth/types'
import { resolveImageUrl } from '../../jobs/api'
import { USE_MOCK } from '../../../core/config/env'
import * as profileApi from '../api'
import { profileQueryKey, type ProfileUpdate } from '../types'
import type { UserProfile } from '../../../../types'
import { mockTopUp } from '../../wallet/mock'
import { walletQueryKey } from '../../../../hooks/useWallet'

/** Applies a `PATCH /api/me` body onto the cached profile for the offline demo. */
function mergeProfile(current: UserProfile, body: ProfileUpdate): UserProfile {
  const hasTaskerEdits =
    body.skills !== undefined ||
    body.bio !== undefined ||
    body.availability !== undefined ||
    body.vehicle !== undefined

  const taskerProfile =
    current.taskerProfile || hasTaskerEdits
      ? {
          skills: body.skills ?? current.taskerProfile?.skills ?? [],
          bio: body.bio ?? current.taskerProfile?.bio ?? '',
          availability: body.availability ?? current.taskerProfile?.availability ?? 'all-day',
          vehicle: body.vehicle ?? current.taskerProfile?.vehicle ?? 'motorbike',
          verified: current.taskerProfile?.verified ?? false,
        }
      : null

  const nextLocation = body.location ?? current.location
  const nextAvatar = body.avatarUrl ?? current.avatar

  const newProfile = {
    ...current,
    name: body.name ?? current.name,
    location: nextLocation,
    avatar: nextAvatar,
    taskerProfile,
    registrationProgress: current.registrationProgress ? { ...current.registrationProgress } : undefined
  }
  
  if (newProfile.registrationProgress && !newProfile.registrationProgress.bonusAwarded) {
    if (!newProfile.registrationProgress.step2_ProfileCompleted) {
        newProfile.registrationProgress.step2_ProfileCompleted = !!(nextLocation && nextAvatar && nextAvatar !== 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150' && nextAvatar !== 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150');
    }
    
    if (newProfile.registrationProgress.step1_PhoneVerified && newProfile.registrationProgress.step2_ProfileCompleted && newProfile.registrationProgress.step3_SkillsVerified) {
        newProfile.registrationProgress.bonusAwarded = true;
    }
  }

  return newProfile;
}

/**
 * Profile data source (task 08). Seeded from the auth profile and backed by
 * `GET/PATCH /api/me` through React Query; every mutation also updates the
 * GiGood context so the header avatar/name refresh without a restart. With
 * `EXPO_PUBLIC_USE_MOCK=1` the same contract is served locally from the demo
 * context profile.
 */
export function useProfile() {
  const { state, dispatch } = useGiGood()
  const queryClient = useQueryClient()
  const contextProfile = state.auth.profile

  const query = useQuery<UserProfile | null>({
    queryKey: profileQueryKey,
    enabled: !USE_MOCK && !!contextProfile,
    initialData: contextProfile ?? undefined,
    queryFn: async () => toUserProfile(await profileApi.loadProfile()),
  })

  const applyProfile = useCallback(
    (next: UserProfile) => {
      dispatch({ type: 'SET_PROFILE', payload: next })
      queryClient.setQueryData(profileQueryKey, next)
    },
    [dispatch, queryClient],
  )

  const readCurrent = useCallback((): UserProfile | null => {
    const cached = queryClient.getQueryData<UserProfile | null>(profileQueryKey)
    return cached ?? contextProfile
  }, [queryClient, contextProfile])

  const checkAndAwardBonusLocal = useCallback((current: UserProfile, newProfile: UserProfile) => {
      const justAwarded = newProfile.registrationProgress?.bonusAwarded && !current.registrationProgress?.bonusAwarded;
      if (justAwarded) {
          if (USE_MOCK) {
              mockTopUp(newProfile.id, newProfile.role, 20);
          }
          queryClient.invalidateQueries({ queryKey: walletQueryKey });
          dispatch({ type: 'SHOW_BONUS_POPUP' });
      }
  }, [queryClient, dispatch]);

  const updateMutation = useMutation<UserProfile, unknown, ProfileUpdate>({
    mutationFn: async (body) => {
      if (USE_MOCK) {
        const current = readCurrent()
        if (!current) throw new Error('Chưa đăng nhập.')
        return mergeProfile(current, body)
      }
      return toUserProfile(await profileApi.updateProfile(body))
    },
    onSuccess: (newProfile) => {
      const current = readCurrent();
      if (current) {
          checkAndAwardBonusLocal(current, newProfile);
      }
      applyProfile(newProfile);
    },
  })

  const avatarMutation = useMutation<string, unknown, string>({
    mutationFn: (localUri) =>
      USE_MOCK ? Promise.resolve(localUri) : profileApi.uploadAvatar(localUri),
    onSuccess: (avatarUrl) => {
      const current = readCurrent()
      if (!current) return
      
      const nextAvatar = resolveImageUrl(avatarUrl) ?? avatarUrl;
      const newProfile = { 
        ...current, 
        avatar: nextAvatar,
        registrationProgress: current.registrationProgress ? { ...current.registrationProgress } : undefined
      }

      if (newProfile.registrationProgress && !newProfile.registrationProgress.bonusAwarded) {
          if (!newProfile.registrationProgress.step2_ProfileCompleted) {
              newProfile.registrationProgress.step2_ProfileCompleted = !!(newProfile.location && nextAvatar && nextAvatar !== 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150' && nextAvatar !== 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150');
          }
          if (newProfile.registrationProgress.step1_PhoneVerified && newProfile.registrationProgress.step2_ProfileCompleted && newProfile.registrationProgress.step3_SkillsVerified) {
              newProfile.registrationProgress.bonusAwarded = true;
          }
      }

      checkAndAwardBonusLocal(current, newProfile);
      applyProfile(newProfile)
    },
  })

  const verifyMutation = useMutation<boolean, unknown, void>({
    mutationFn: () => (USE_MOCK ? Promise.resolve(true) : profileApi.verifyIdentity()),
    onSuccess: (verified) => {
      const current = readCurrent()
      if (!current) return
      
      const newProfile = { 
        ...current,
        taskerProfile: current.taskerProfile ? { ...current.taskerProfile } : null,
        registrationProgress: current.registrationProgress ? { ...current.registrationProgress } : undefined
      };
      
      if (newProfile.taskerProfile) {
          newProfile.taskerProfile.verified = verified;
      }
      if (newProfile.registrationProgress) {
          newProfile.registrationProgress.step3_SkillsVerified = verified;
          if (newProfile.registrationProgress.step1_PhoneVerified && newProfile.registrationProgress.step2_ProfileCompleted && newProfile.registrationProgress.step3_SkillsVerified) {
              newProfile.registrationProgress.bonusAwarded = true;
          }
      }

      checkAndAwardBonusLocal(current, newProfile);
      applyProfile(newProfile);
      if (!USE_MOCK) {
        query.refetch(); // Refetch from backend to get bonus/progress updates
      }
    },
  })

  return {
    profile: query.data ?? contextProfile,
    loading: query.isLoading,
    refetch: query.refetch,
    updateProfile: updateMutation.mutateAsync,
    isSaving: updateMutation.isPending,
    uploadAvatar: avatarMutation.mutateAsync,
    isUploadingAvatar: avatarMutation.isPending,
    verifyIdentity: verifyMutation.mutateAsync,
    isVerifying: verifyMutation.isPending,
  }
}

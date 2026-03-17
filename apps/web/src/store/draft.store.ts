import { create } from 'zustand'
import type { ApiPick, ApiPlayer } from '../api/types'

interface DraftState {
  playerOut: ApiPick | null   // player in current squad being replaced
  playerIn: ApiPlayer | null  // candidate replacement from player list
  setPlayerOut: (player: ApiPick | null) => void
  setPlayerIn: (player: ApiPlayer | null) => void
  clearDraft: () => void
}

export const useDraftStore = create<DraftState>()((set) => ({
  playerOut: null,
  playerIn: null,
  setPlayerOut: (playerOut) => set({ playerOut }),
  setPlayerIn: (playerIn) => set({ playerIn }),
  clearDraft: () => set({ playerOut: null, playerIn: null }),
}))

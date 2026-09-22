import { create } from 'zustand';

export type LibrarySortKey = 'title' | 'authors' | 'year' | 'source' | 'updatedAt' | 'readStatus';
export type LibraryInspectorTab = 'details' | 'notes';

interface LibraryStore {
  scope: string;
  searchQuery: string;
  selectedPaperIds: string[];
  activePaperId: string | null;
  sortKey: LibrarySortKey;
  sortDirection: 'asc' | 'desc';
  inspectorTab: LibraryInspectorTab;
  refreshVersion: number;
  setScope: (scope: string) => void;
  setSearchQuery: (query: string) => void;
  setActivePaper: (paperId: string | null) => void;
  togglePaperSelection: (paperId: string, additive?: boolean) => void;
  selectPapers: (paperIds: string[]) => void;
  clearSelection: () => void;
  setSort: (key: LibrarySortKey) => void;
  setInspectorTab: (tab: LibraryInspectorTab) => void;
  requestRefresh: () => void;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  scope: 'all',
  searchQuery: '',
  selectedPaperIds: [],
  activePaperId: null,
  sortKey: 'updatedAt',
  sortDirection: 'desc',
  inspectorTab: 'details',
  refreshVersion: 0,
  setScope: (scope) => set({ scope, selectedPaperIds: [], activePaperId: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setActivePaper: (activePaperId) => set({ activePaperId }),
  togglePaperSelection: (paperId, additive = true) => set((state) => {
    if (!additive) return { selectedPaperIds: [paperId], activePaperId: paperId };
    const selected = state.selectedPaperIds.includes(paperId)
      ? state.selectedPaperIds.filter((id) => id !== paperId)
      : [...state.selectedPaperIds, paperId];
    return { selectedPaperIds: selected, activePaperId: paperId };
  }),
  selectPapers: (selectedPaperIds) => set({
    selectedPaperIds,
    activePaperId: selectedPaperIds.at(-1) || null,
  }),
  clearSelection: () => set({ selectedPaperIds: [] }),
  setSort: (sortKey) => set((state) => ({
    sortKey,
    sortDirection: state.sortKey === sortKey && state.sortDirection === 'asc' ? 'desc' : 'asc',
  })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  requestRefresh: () => set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
}));

import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useViewPersistence, ViewId } from '@/hooks/useViewPersistence';

interface ViewContextType {
  currentView: ViewId | null;
  isLoading: boolean;
  selectView: (viewId: ViewId) => Promise<void>;
  switchView: () => Promise<void>;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export function ViewContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { selectedView, isLoading, saveView, clearView } = useViewPersistence();

  const selectView = useCallback(async (viewId: ViewId) => {
    await saveView(viewId);
    router.push(`/${viewId}` as any);
  }, [saveView, router]);

  const switchView = useCallback(async () => {
    await clearView();
    router.push('/');
  }, [clearView, router]);

  return (
    <ViewContext.Provider
      value={{
        currentView: selectedView,
        isLoading,
        selectView,
        switchView,
      }}
    >
      {children}
    </ViewContext.Provider>
  );
}

export function useViewContext() {
  const context = useContext(ViewContext);
  if (context === undefined) {
    throw new Error('useViewContext must be used within a ViewContextProvider');
  }
  return context;
}

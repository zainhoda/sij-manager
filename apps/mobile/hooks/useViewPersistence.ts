import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@sij:selectedView';

export type ViewId = 'admin' | 'supervisor' | 'worker' | 'tv' | 'equipment-tablet';

export interface UseViewPersistence {
  selectedView: ViewId | null;
  isLoading: boolean;
  saveView: (viewId: ViewId) => Promise<void>;
  clearView: () => Promise<void>;
}

export function useViewPersistence(): UseViewPersistence {
  const [selectedView, setSelectedView] = useState<ViewId | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadView = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          setSelectedView(saved as ViewId);
        }
      } catch (error) {
        console.error('Failed to load saved view:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadView();
  }, []);

  const saveView = useCallback(async (viewId: ViewId) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, viewId);
      setSelectedView(viewId);
    } catch (error) {
      console.error('Failed to save view:', error);
    }
  }, []);

  const clearView = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setSelectedView(null);
    } catch (error) {
      console.error('Failed to clear view:', error);
    }
  }, []);

  return {
    selectedView,
    isLoading,
    saveView,
    clearView,
  };
}

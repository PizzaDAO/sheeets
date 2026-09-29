'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ViewMode } from '@/lib/types';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/**
 * Manages view mode (map/list/table) with localStorage persistence.
 * Returns the current mode, setter, and scroll-tracking refs.
 */
export function useViewMode() {
  // Use 'list' as the SSR-safe default (most common on mobile)
  const [viewMode, setViewModeState] = useState<ViewMode>('list');
  const [contentScrolled, setContentScrolled] = useState(false);
  const restoredRef = useRef(false);

  // Restore from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
    if (saved === 'map' || saved === 'list' || saved === 'table' || saved === 'gallery') {
      setViewModeState(saved);
    } else {
      setViewModeState(window.innerWidth >= 768 ? 'table' : 'list');
    }
    restoredRef.current = true;
  }, []);

  // Persist to localStorage on change (after initial restore)
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setContentScrolled(false);
    listScrolledRef.current = false;
    listLastScrollTopRef.current = 0;
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);
  }, []);

  // List view scroll tracking (mirrors TableView's onScrolledChange)
  const listMainRef = useRef<HTMLDivElement>(null);
  const listLastScrollTopRef = useRef(0);
  const listScrolledRef = useRef(false);

  const handleListScroll = useCallback(() => {
    const container = listMainRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const atTop = scrollTop <= 5;
    const scrollingDown = scrollTop > listLastScrollTopRef.current + 2;
    const scrollingUp = scrollTop < listLastScrollTopRef.current - 2;
    listLastScrollTopRef.current = scrollTop;

    const overflowAmount = container.scrollHeight - container.clientHeight;
    const nearBottom = scrollTop + container.clientHeight >= container.scrollHeight - 50;
    const shouldHide = !atTop && !nearBottom && scrollingDown && overflowAmount > 80;
    const shouldShow = atTop || scrollingUp;

    if (shouldHide && !listScrolledRef.current) {
      listScrolledRef.current = true;
      setContentScrolled(true);
    } else if (shouldShow && listScrolledRef.current) {
      listScrolledRef.current = false;
      setContentScrolled(false);
    }
  }, []);

  return {
    viewMode,
    setViewMode,
    contentScrolled,
    setContentScrolled,
    listMainRef,
    handleListScroll,
  };
}

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseDragReorderOptions {
  /** Called with the new ordered array when a drop completes */
  onReorder: (orderedIds: string[]) => void;
}

interface DragState {
  /** The ID of the item currently being dragged */
  dragId: string | null;
  /** The ID of the item being hovered over */
  overId: string | null;
  /** Whether the drop indicator should show above or below the hovered item */
  position: 'above' | 'below';
}

interface TouchDragState {
  /** Is a touch drag currently active? */
  active: boolean;
  /** The element being dragged */
  cloneEl: HTMLElement | null;
  /** Starting Y position */
  startY: number;
  /** ID of the dragged item */
  dragId: string | null;
  /** Current hover target */
  overId: string | null;
  /** Current hover position */
  position: 'above' | 'below';
}

export function useDragReorder({ onReorder }: UseDragReorderOptions) {
  const [dragState, setDragState] = useState<DragState>({
    dragId: null,
    overId: null,
    position: 'below',
  });

  const touchState = useRef<TouchDragState>({
    active: false,
    cloneEl: null,
    startY: 0,
    dragId: null,
    overId: null,
    position: 'below',
  });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const orderedIdsRef = useRef<string[]>([]);
  const onReorderRef = useRef(onReorder);
  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  /** Keep the ordered IDs in sync so drag handlers can access them */
  const setOrderedIds = useCallback((ids: string[]) => {
    orderedIdsRef.current = ids;
  }, []);

  /** Register a ref for an item element */
  const registerItemRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      itemRefs.current.set(id, el);
    } else {
      itemRefs.current.delete(id);
    }
  }, []);

  // --- Desktop (HTML5) drag handlers ---

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // Set a small drag image offset
    if (e.dataTransfer.setDragImage) {
      const target = e.currentTarget as HTMLElement;
      e.dataTransfer.setDragImage(target, 20, 20);
    }
    setDragState({ dragId: id, overId: null, position: 'below' });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Determine if cursor is in the top or bottom half of the element
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';

    setDragState((prev) => {
      if (prev.overId === id && prev.position === position) return prev;
      return { ...prev, overId: id, position };
    });
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the actual element, not entering a child
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && (e.currentTarget as HTMLElement).contains(relatedTarget)) {
      return;
    }
    setDragState((prev) => ({ ...prev, overId: null }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) {
      setDragState({ dragId: null, overId: null, position: 'below' });
      return;
    }

    const ids = [...orderedIdsRef.current];
    const sourceIndex = ids.indexOf(sourceId);
    if (sourceIndex === -1) {
      setDragState({ dragId: null, overId: null, position: 'below' });
      return;
    }

    // Remove source from its current position
    ids.splice(sourceIndex, 1);

    // Find where to insert
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';

    let targetIndex = ids.indexOf(targetId);
    if (targetIndex === -1) {
      setDragState({ dragId: null, overId: null, position: 'below' });
      return;
    }

    if (position === 'below') {
      targetIndex += 1;
    }

    ids.splice(targetIndex, 0, sourceId);
    onReorderRef.current(ids);
    setDragState({ dragId: null, overId: null, position: 'below' });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ dragId: null, overId: null, position: 'below' });
  }, []);

  // --- Touch drag handlers (long-press to initiate) ---

  const cleanupTouchDrag = useCallback(() => {
    const ts = touchState.current;
    if (ts.cloneEl) {
      ts.cloneEl.remove();
      ts.cloneEl = null;
    }
    ts.active = false;
    ts.dragId = null;
    ts.overId = null;
    ts.position = 'below';
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setDragState({ dragId: null, overId: null, position: 'below' });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    const touch = e.touches[0];
    touchState.current.startY = touch.clientY;
    touchState.current.dragId = id;

    // Long press: 400ms to initiate drag
    longPressTimer.current = setTimeout(() => {
      const el = itemRefs.current.get(id);
      if (!el) return;

      touchState.current.active = true;

      // Create a floating clone
      const rect = el.getBoundingClientRect();
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.zIndex = '9999';
      clone.style.opacity = '0.9';
      clone.style.pointerEvents = 'none';
      clone.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
      clone.style.borderRadius = '8px';
      clone.style.transform = 'scale(1.03)';
      clone.style.transition = 'none';
      document.body.appendChild(clone);
      touchState.current.cloneEl = clone;

      setDragState({ dragId: id, overId: null, position: 'below' });

      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }, 400);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const ts = touchState.current;

    if (!ts.active) {
      // If finger moved too much before long-press triggers, cancel
      const touch = e.touches[0];
      const dy = Math.abs(touch.clientY - ts.startY);
      if (dy > 10 && longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      return;
    }

    // Prevent scroll while dragging
    e.preventDefault();

    const touch = e.touches[0];

    // Move the clone
    if (ts.cloneEl) {
      const rect = ts.cloneEl.getBoundingClientRect();
      ts.cloneEl.style.top = `${touch.clientY - rect.height / 2}px`;
    }

    // Find which item we're hovering over
    let hoveredId: string | null = null;
    let position: 'above' | 'below' = 'below';
    for (const [id, el] of itemRefs.current.entries()) {
      if (id === ts.dragId) continue;
      const rect = el.getBoundingClientRect();
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        hoveredId = id;
        position = touch.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
        break;
      }
    }

    // Store in ref so handleTouchEnd can read the latest values
    ts.overId = hoveredId;
    ts.position = position;

    setDragState((prev) => {
      if (prev.overId === hoveredId && prev.position === position) return prev;
      return { ...prev, overId: hoveredId, position };
    });
  }, []);

  const handleTouchEnd = useCallback(() => {
    const ts = touchState.current;

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!ts.active || !ts.dragId) {
      cleanupTouchDrag();
      return;
    }

    // Read from ref (always current) instead of React state (stale closure)
    const sourceId = ts.dragId;
    const targetId = ts.overId;
    const position = ts.position;

    if (targetId && sourceId !== targetId) {
      const ids = [...orderedIdsRef.current];
      const sourceIndex = ids.indexOf(sourceId);
      if (sourceIndex !== -1) {
        ids.splice(sourceIndex, 1);
        let targetIndex = ids.indexOf(targetId);
        if (targetIndex !== -1) {
          if (position === 'below') {
            targetIndex += 1;
          }
          ids.splice(targetIndex, 0, sourceId);
          onReorderRef.current(ids);
        }
      }
    }

    cleanupTouchDrag();
  }, [cleanupTouchDrag]);

  /** Get the drag props for an individual item's drag handle */
  const getDragHandleProps = useCallback((id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, id),
    onTouchStart: (e: React.TouchEvent) => handleTouchStart(e, id),
    onTouchMove: (e: React.TouchEvent) => handleTouchMove(e),
    onTouchEnd: () => handleTouchEnd(),
  }), [handleDragStart, handleTouchStart, handleTouchMove, handleTouchEnd]);

  /** Get the drag props for an individual item's container */
  const getItemProps = useCallback((id: string) => ({
    onDragOver: (e: React.DragEvent) => handleDragOver(e, id),
    onDragLeave: (e: React.DragEvent) => handleDragLeave(e),
    onDrop: (e: React.DragEvent) => handleDrop(e, id),
    onDragEnd: handleDragEnd,
  }), [handleDragOver, handleDragLeave, handleDrop, handleDragEnd]);

  /** Get drop indicator style classes for an item */
  const getDropIndicator = useCallback((id: string): { showAbove: boolean; showBelow: boolean } => {
    if (!dragState.overId || dragState.overId !== id || dragState.dragId === id) {
      return { showAbove: false, showBelow: false };
    }
    return {
      showAbove: dragState.position === 'above',
      showBelow: dragState.position === 'below',
    };
  }, [dragState]);

  const isDragging = dragState.dragId !== null;
  const dragId = dragState.dragId;

  return {
    setOrderedIds,
    registerItemRef,
    getDragHandleProps,
    getItemProps,
    getDropIndicator,
    isDragging,
    dragId,
  };
}

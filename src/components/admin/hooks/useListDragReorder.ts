'use client';

import { useState } from 'react';
import type React from 'react';

/**
 * HTML5 drag-to-reorder for a simple index-based list (admin sponsors,
 * native ads). Dropping item `from` onto item `to` moves it to index `to`.
 *
 * (Separate from the id-based, touch-aware `@/hooks/useDragReorder` used by
 * the itinerary, which has different drop semantics.)
 *
 * Usage:
 *   const { dragIndex, dragOverIndex, getDragProps } = useListDragReorder(items, setItems);
 *   <div draggable={...} {...getDragProps(idx)} />
 */
export function useListDragReorder<T>(items: T[], setItems: (items: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const getDragProps = (idx: number) => ({
    onDragStart: (e: React.DragEvent) => {
      setDragIndex(idx);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== idx) {
        setDragOverIndex(idx);
      }
    },
    onDragLeave: () => {
      if (dragOverIndex === idx) setDragOverIndex(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== idx) {
        const updated = [...items];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(idx, 0, moved);
        setItems(updated);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    onDragEnd: () => {
      setDragIndex(null);
      setDragOverIndex(null);
    },
  });

  return { dragIndex, dragOverIndex, getDragProps };
}

'use client';

import { useState } from 'react';

/**
 * Latches to true the first time `isOpen` is true and stays true afterwards.
 * Used to defer mounting lazily-loaded modals (so their chunk isn't fetched
 * until first open) while keeping them mounted after that, preserving
 * close animations and in-progress state exactly as before.
 */
export function useHasOpened(isOpen: boolean): boolean {
  const [hasOpened, setHasOpened] = useState(isOpen);
  // Adjust state during render (React-recommended pattern) to avoid an extra
  // commit with the modal missing on first open.
  if (isOpen && !hasOpened) setHasOpened(true);
  return hasOpened || isOpen;
}

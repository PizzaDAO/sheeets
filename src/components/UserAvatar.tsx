'use client';

import { useState } from 'react';
import { getDisplayInitial } from '@/lib/user-display';

const AVATAR_COLORS = [
  '#e63946', // red
  '#f4a261', // orange
  '#e9c46a', // gold
  '#2a9d8f', // teal
  '#264653', // dark teal
  '#7b2cbf', // purple
  '#3a86ff', // blue
  '#06d6a0', // green
  '#ef476f', // pink
  '#118ab2', // ocean
];

function hashToColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface UserAvatarProps {
  avatarUrl?: string | null;
  xHandle?: string | null;
  displayName?: string | null;
  email?: string | null;
  userId?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
};

export default function UserAvatar({
  avatarUrl,
  xHandle,
  displayName,
  email,
  userId,
  size = 'sm',
  className = '',
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [unavatarError, setUnavatarError] = useState(false);

  const sizeClass = sizeClasses[size];
  const initial = getDisplayInitial({ display_name: displayName, rsvp_name: email || undefined });

  // Priority 1: Uploaded avatar
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={displayName || 'User avatar'}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  // Priority 2: X/Twitter avatar via unavatar.io
  if (xHandle && !unavatarError) {
    return (
      <img
        src={`https://unavatar.io/x/${xHandle}`}
        alt={displayName || xHandle}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
        onError={() => setUnavatarError(true)}
      />
    );
  }

  // Priority 3: Initials circle with deterministic color
  const bgColor = userId ? hashToColor(userId) : undefined;
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white shrink-0 ${className}`}
      style={{ backgroundColor: bgColor || 'var(--theme-bg-tertiary)' }}
    >
      {initial}
    </div>
  );
}

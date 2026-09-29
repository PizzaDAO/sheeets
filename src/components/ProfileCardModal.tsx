'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, UserPlus, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getDisplayName } from '@/lib/user-display';
import UserAvatar from './UserAvatar';
import { isSafeHttpUrl } from '@/lib/utils';

interface ProfileCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  displayName?: string | null;
  xHandle?: string | null;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  linkedinUrl?: string | null;
  telegramHandle?: string | null;
}

type FriendStatus = 'loading' | 'not-logged-in' | 'self' | 'friends' | 'pending-outgoing' | 'pending-incoming' | 'none';

export default function ProfileCardModal({
  isOpen,
  onClose,
  userId,
  displayName,
  xHandle,
  avatarUrl,
  jobTitle,
  company,
  linkedinUrl,
  telegramHandle,
}: ProfileCardModalProps) {
  const { user } = useAuth();
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('loading');
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Fetch friend status
  useEffect(() => {
    if (!isOpen) return;

    if (!user) {
      setFriendStatus('not-logged-in');
      return;
    }

    if (user.id === userId) {
      setFriendStatus('self');
      return;
    }

    async function checkFriendStatus() {
      setFriendStatus('loading');
      const currentUserId = user!.id;

      // Check if already friends
      const { data: friendshipA } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_a', currentUserId)
        .eq('user_b', userId)
        .maybeSingle();

      const { data: friendshipB } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_a', userId)
        .eq('user_b', currentUserId)
        .maybeSingle();

      if (friendshipA || friendshipB) {
        setFriendStatus('friends');
        return;
      }

      // Check pending requests
      const { data: outgoing } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', currentUserId)
        .eq('receiver_id', userId)
        .eq('status', 'pending')
        .maybeSingle();

      if (outgoing) {
        setFriendStatus('pending-outgoing');
        return;
      }

      const { data: incoming } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', userId)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .maybeSingle();

      if (incoming) {
        setFriendStatus('pending-incoming');
        setIncomingRequestId(incoming.id);
        return;
      }

      setFriendStatus('none');
    }

    checkFriendStatus();
  }, [isOpen, user, userId]);

  const handleSendRequest = async () => {
    setActionLoading(true);
    await supabase.rpc('send_friend_request', { receiver: userId });
    setFriendStatus('pending-outgoing');
    setActionLoading(false);
  };

  const handleAcceptRequest = async () => {
    if (!incomingRequestId) return;
    setActionLoading(true);
    await supabase.rpc('respond_to_friend_request', { request_id: incomingRequestId, accept: true });
    setFriendStatus('friends');
    setActionLoading(false);
  };

  if (!isOpen) return null;

  const name = getDisplayName({ display_name: displayName, x_handle: xHandle });
  const cleanXHandle = xHandle?.replace(/^@/, '');

  const jobLine = jobTitle && company
    ? `${jobTitle} at ${company}`
    : jobTitle || company || null;

  const renderFriendButton = () => {
    if (friendStatus === 'loading') {
      return (
        <div className="h-9 flex items-center justify-center text-xs text-[var(--theme-text-muted)]">
          Loading...
        </div>
      );
    }
    if (friendStatus === 'self') return null;
    if (friendStatus === 'not-logged-in') {
      return (
        <button
          disabled
          className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] cursor-not-allowed"
        >
          Sign in to connect
        </button>
      );
    }
    if (friendStatus === 'friends') {
      return (
        <button
          disabled
          className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/30 cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Friends
        </button>
      );
    }
    if (friendStatus === 'pending-outgoing') {
      return (
        <button
          disabled
          className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] cursor-not-allowed"
        >
          Request Sent
        </button>
      );
    }
    if (friendStatus === 'pending-incoming') {
      return (
        <button
          onClick={handleAcceptRequest}
          disabled={actionLoading}
          className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-[var(--theme-accent)] text-[var(--theme-accent-text)] hover:bg-[var(--theme-accent-hover)] transition-colors cursor-pointer disabled:opacity-50"
        >
          Accept Request
        </button>
      );
    }
    // Default: none
    return (
      <button
        onClick={handleSendRequest}
        disabled={actionLoading}
        className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-[var(--theme-accent)] text-[var(--theme-accent-text)] hover:bg-[var(--theme-accent-hover)] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Add Friend
      </button>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal content */}
      <div
        className="relative bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-2xl shadow-2xl w-[300px] max-w-[90vw] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Profile content */}
        <div className="flex flex-col items-center text-center gap-3">
          {/* Avatar */}
          <UserAvatar
            size="md"
            avatarUrl={avatarUrl}
            xHandle={xHandle}
            displayName={displayName}
            userId={userId}
          />

          {/* Name */}
          <div>
            <h3 className="text-sm font-bold text-[var(--theme-text-primary)]">{name}</h3>
            {jobLine && (
              <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{jobLine}</p>
            )}
          </div>

          {/* Social links */}
          {(cleanXHandle || linkedinUrl || telegramHandle) && (
            <div className="flex items-center gap-3">
              {cleanXHandle && (
                <a
                  href={`https://x.com/${cleanXHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{cleanXHandle}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {isSafeHttpUrl(linkedinUrl) && (
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  LinkedIn
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {telegramHandle && (
                <a
                  href={`https://t.me/${telegramHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Telegram
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Friend action button */}
          <div className="w-full mt-1">
            {renderFriendButton()}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

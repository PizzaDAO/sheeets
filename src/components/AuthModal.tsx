'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, LogOut, User, Check, Loader2, Users, Search, UserPlus, Clock, XCircle, CircleUser, Link2, ArrowRight, Send, Building2, Briefcase, Linkedin, Smartphone, Moon, Sun } from 'lucide-react';
import { ShareCardModal } from './ShareCardModal';
import { LockScreenModal } from './LockScreenModal';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { trackAuthSuccess, trackSignOut, trackFriendCodeGenerate, trackFriendCodeCopy, trackModalDismiss } from '@/lib/analytics';
import { getDisplayName } from '@/lib/user-display';
import UserAvatar from './UserAvatar';
import { getSocialLinks } from '@/lib/social-urls';

import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useXVerification } from '@/hooks/useXVerification';
import { useFriends } from '@/hooks/useFriends';
import { useFriendRequests } from '@/hooks/useFriendRequests';
import type { ETHDenverEvent, NativeAd, UserSearchResult, FriendRequest } from '@/lib/types';
import { useAdminConfig } from '@/hooks/useAdminConfig';
import { trackAdClick } from '@/lib/analytics';
import { trackAdEvent } from '@/lib/ad-tracking';
import { isSafeHttpUrl } from '@/lib/utils';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'email' | 'code' | 'success';

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signIn, verifyOtp } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const reset = useCallback(() => {
    setStep('email');
    setEmail('');
    setCode(['', '', '', '', '', '']);
    setError('');
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    trackModalDismiss('auth');
    reset();
    onClose();
  }, [reset, onClose]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email);
    setLoading(false);

    if (error) {
      setError(error);
    } else {
      setStep('code');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        submitCode(fullCode);
      }
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
      submitCode(pasted);
    }
  };

  const submitCode = async (fullCode: string) => {
    setError('');
    setLoading(true);
    const { error } = await verifyOtp(email, fullCode);
    setLoading(false);

    if (error) {
      setError(error);
      setCode(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } else {
      trackAuthSuccess();
      setStep('success');
      setTimeout(() => handleClose(), 1500);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/50" onClick={handleClose} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={handleClose}>
        <div className="bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)]">
            <h2 className="text-base font-bold text-[var(--theme-text-primary)]">
              {step === 'email' && 'Sign in'}
              {step === 'code' && 'Enter code'}
              {step === 'success' && 'Signed in!'}
            </h2>
            <button onClick={handleClose} className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-5">
            {step === 'email' && (
              <form onSubmit={handleEmailSubmit}>
                <p className="text-[var(--theme-text-secondary)] text-sm mb-4">
                  Enter your email to save your itinerary, add friends, and add points of interest to the map.
                </p>
                <div className="flex items-center gap-2 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg px-3 py-2.5 focus-within:border-[var(--theme-accent)] transition-colors">
                  <Mail className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 bg-transparent text-[var(--theme-text-primary)] text-sm outline-none placeholder:text-[var(--theme-text-muted)]"
                    required
                    autoFocus
                  />
                </div>
                {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-4 px-4 py-2.5 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] disabled:opacity-50 text-[var(--theme-accent-text)] rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  {loading ? 'Sending...' : 'Send code'}
                </button>
              </form>
            )}

            {step === 'code' && (
              <div>
                <p className="text-[var(--theme-text-secondary)] text-sm mb-4">
                  We sent a 6-digit code to <span className="text-[var(--theme-text-primary)] font-medium">{email}</span>
                </p>
                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      className="w-10 h-12 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-center text-lg font-bold outline-none focus:border-[var(--theme-accent)] transition-colors"
                    />
                  ))}
                </div>
                {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}
                {loading && <p className="text-[var(--theme-accent-link)] text-xs mt-3 text-center">Verifying...</p>}
                <button
                  onClick={() => { setStep('email'); setError(''); }}
                  className="w-full mt-4 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-xs text-center cursor-pointer"
                >
                  Use a different email
                </button>
              </div>
            )}

            {step === 'success' && (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">✓</div>
                <p className="text-[var(--theme-text-primary)] font-medium">You&apos;re signed in!</p>
                <p className="text-[var(--theme-text-secondary)] text-sm mt-1">Your itinerary will sync across devices.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// --- Search result row ---
function SearchResultRow({
  result,
  onSend,
  onAccept,
  sending,
}: {
  result: UserSearchResult;
  onSend: (userId: string) => void;
  onAccept: (userId: string) => void;
  sending: string | null;
}) {
  const displayName = getDisplayName(result);
  const secondary = result.x_handle
    ? `@${result.x_handle}`
    : result.email
      ? result.email
      : null;

  return (
    <div className="flex items-center gap-3 py-2">
      <UserAvatar size="sm" avatarUrl={result.avatar_url} xHandle={result.x_handle} displayName={result.display_name} email={result.email} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{displayName}</p>
        {secondary && result.display_name && (
          <p className="text-xs text-[var(--theme-text-muted)] truncate">{secondary}</p>
        )}
      </div>
      {result.request_status === 'pending_outgoing' ? (
        <span className="flex items-center gap-1 text-xs text-[var(--theme-text-muted)] bg-[var(--theme-bg-tertiary)] px-2.5 py-1.5 rounded-lg">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      ) : result.request_status === 'pending_incoming' ? (
        <button
          onClick={() => onAccept(result.user_id)}
          disabled={sending === result.user_id}
          className="flex items-center gap-1 text-xs font-medium bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <Check className="w-3 h-3" />
          Accept
        </button>
      ) : (
        <button
          onClick={() => onSend(result.user_id)}
          disabled={sending === result.user_id}
          className="flex items-center gap-1 text-xs font-medium bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] disabled:opacity-50 text-[var(--theme-accent-text)] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          {sending === result.user_id ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <UserPlus className="w-3 h-3" />
          )}
          Add Friend
        </button>
      )}
    </div>
  );
}

// --- Incoming request row ---
function IncomingRequestRow({
  request,
  onAccept,
  onReject,
  responding,
}: {
  request: FriendRequest;
  onAccept: () => void;
  onReject: () => void;
  responding: boolean;
}) {
  const profile = request.sender_profile;
  const displayName = profile ? getDisplayName(profile) : 'Anonymous';

  return (
    <div className="flex items-center gap-3 py-2">
      <UserAvatar size="sm" avatarUrl={profile?.avatar_url} xHandle={profile?.x_handle} displayName={profile?.display_name} email={profile?.email} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{displayName}</p>
        {profile?.display_name && profile?.email && (
          <p className="text-xs text-[var(--theme-text-muted)] truncate">{profile.email}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onAccept}
          disabled={responding}
          className="flex items-center gap-1 text-xs font-medium bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <Check className="w-3 h-3" />
          Accept
        </button>
        <button
          onClick={onReject}
          disabled={responding}
          className="flex items-center gap-1 text-xs font-medium border border-[var(--theme-border-primary)] hover:border-red-500/50 hover:bg-red-500/10 text-[var(--theme-text-secondary)] hover:text-red-400 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// --- Outgoing request row ---
function OutgoingRequestRow({
  request,
  onCancel,
  cancelling,
}: {
  request: FriendRequest;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const profile = request.receiver_profile;
  const displayName = profile ? getDisplayName(profile) : 'Anonymous';

  return (
    <div className="flex items-center gap-3 py-2">
      <UserAvatar size="sm" avatarUrl={profile?.avatar_url} xHandle={profile?.x_handle} displayName={profile?.display_name} email={profile?.email} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{displayName}</p>
        {profile?.display_name && profile?.email && (
          <p className="text-xs text-[var(--theme-text-muted)] truncate">{profile.email}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-[var(--theme-text-muted)] flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Pending
        </span>
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="p-1 text-[var(--theme-text-muted)] hover:text-red-400 disabled:opacity-50 transition-colors cursor-pointer"
          title="Cancel request"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface UserMenuProps {
  events: ETHDenverEvent[];
  itinerary: Set<string>;
  onOpenFriends: () => void;
  onSubmitEvent?: () => void;
  pendingIncomingCount?: number;
  externalRefreshFriends?: () => Promise<void>;
  activeConference?: string;
}

export function UserMenu({ events, itinerary, onOpenFriends, pendingIncomingCount: externalCount, externalRefreshFriends, activeConference }: UserMenuProps) {
  const { user, signOut } = useAuth();
  const { profile, updateProfile, uploadAvatar } = useProfile();
  const { friendCount, refreshFriends: localRefreshFriends } = useFriends();
  const { config } = useAdminConfig();
  const { theme, setTheme } = useTheme();
  const { isXVerified, linkX, unlinkX } = useXVerification();

  const refreshFriends = useCallback(async () => {
    await localRefreshFriends();
    await externalRefreshFriends?.();
  }, [localRefreshFriends, externalRefreshFriends]);
  const {
    incomingRequests,
    outgoingRequests,
    pendingIncomingCount,
    searchResults,
    searchLoading,
    searchUsers,
    sendRequest,
    respondToRequest,
    cancelRequest,
  } = useFriendRequests({ refreshFriends });

  const [open, setOpen] = useState(false);

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [rsvpName, setRsvpName] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [company, setCompany] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Avatar upload state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Friend search state
  const [searchQuery, setSearchQuery] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showOutgoing, setShowOutgoing] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Friend link state
  const [friendLinkCopied, setFriendLinkCopied] = useState(false);
  const [friendLinkLoading, setFriendLinkLoading] = useState(false);

  // Share itinerary card state
  const [showShareCard, setShowShareCard] = useState(false);
  const itineraryEvents = useMemo(
    () => events.filter((e) => itinerary.has(e.id) && (!activeConference || e.conference === activeConference)),
    [events, itinerary, activeConference]
  );
  const shareConferenceName = activeConference || 'Itinerary';
  const badgeCount = externalCount ?? pendingIncomingCount;

  // Lock screen card state
  const [showLockScreen, setShowLockScreen] = useState(false);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const socialLinks = useMemo(
    () => getSocialLinks(profile ?? {}),
    [profile]
  );

  // Ensure friend code exists (create if needed) for lock screen card
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: existing } = await supabase
        .from('friend_codes')
        .select('code')
        .eq('user_id', user.id)
        .single();

      if (existing?.code) {
        setFriendCode(existing.code);
        return;
      }

      // Generate a new code (8 char alphanumeric)
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const arr = new Uint8Array(8);
      crypto.getRandomValues(arr);
      const code = Array.from(arr, (b) => chars[b % chars.length]).join('');

      const { error } = await supabase
        .from('friend_codes')
        .insert({ user_id: user.id, code });

      if (error) {
        // Race condition — try fetching again
        const { data: retry } = await supabase
          .from('friend_codes')
          .select('code')
          .eq('user_id', user.id)
          .single();
        if (retry?.code) setFriendCode(retry.code);
      } else {
        setFriendCode(code);
      }
    })();
  }, [user]);

  // Sync form state when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setXHandle(profile.x_handle ?? '');
      setRsvpName(profile.rsvp_name ?? '');
      setTelegramHandle(profile.telegram_handle ?? '');
      setCompany(profile.company ?? '');
      setLinkedinUrl(profile.linkedin_url ?? '');
      setJobTitle(profile.job_title ?? '');
    }
  }, [profile]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchQuery.trim()) {
      return;
    }
    searchTimeout.current = setTimeout(() => {
      searchUsers(searchQuery);
    }, 400);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, searchUsers]);

  // Auto-save profile on change (debounced)
  useEffect(() => {
    if (!profile) return;
    const current = { displayName, xHandle, rsvpName, telegramHandle, company, linkedinUrl, jobTitle };
    const original = {
      displayName: profile.display_name ?? '',
      xHandle: profile.x_handle ?? '',
      rsvpName: profile.rsvp_name ?? '',
      telegramHandle: profile.telegram_handle ?? '',
      company: profile.company ?? '',
      linkedinUrl: profile.linkedin_url ?? '',
      jobTitle: profile.job_title ?? '',
    };
    if (current.displayName === original.displayName && current.xHandle === original.xHandle && current.rsvpName === original.rsvpName && current.telegramHandle === original.telegramHandle && current.company === original.company && current.linkedinUrl === original.linkedinUrl && current.jobTitle === original.jobTitle) return;

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setSaveStatus('idle');
    saveTimeout.current = setTimeout(async () => {
      await updateProfile({
        display_name: displayName.trim() || null,
        x_handle: xHandle.trim() || null,
        rsvp_name: rsvpName.trim() || null,
        telegram_handle: telegramHandle.trim() || null,
        company: company.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
        job_title: jobTitle.trim() || null,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);

    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [displayName, xHandle, rsvpName, telegramHandle, company, linkedinUrl, jobTitle, profile, updateProfile]);

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting the same file triggers onChange
    e.target.value = '';

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5MB');
      return;
    }

    setAvatarError(null);
    setAvatarUploading(true);
    try {
      await uploadAvatar(file);
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setAvatarError('Upload failed. Please try again.');
    }
    setAvatarUploading(false);
  }

  if (!user) return null;

  async function handleSendRequest(receiverId: string) {
    setSendingTo(receiverId);
    await sendRequest(receiverId);
    setSendingTo(null);
  }

  async function handleAcceptFromSearch(userId: string) {
    // Find the incoming request for this user
    const req = incomingRequests.find((r) => r.sender_id === userId);
    if (req) {
      setSendingTo(userId);
      await respondToRequest(req.id, true);
      setSendingTo(null);
      // Re-search to update results
      if (searchQuery.trim()) searchUsers(searchQuery);
    } else {
      // Fallback: send a request (will auto-accept via RPC if reverse exists)
      await handleSendRequest(userId);
    }
  }

  async function handleRespondToRequest(requestId: string, accept: boolean) {
    setRespondingTo(requestId);
    await respondToRequest(requestId, accept);
    setRespondingTo(null);
  }

  async function handleCancelRequest(requestId: string) {
    setCancellingId(requestId);
    await cancelRequest(requestId);
    setCancellingId(null);
  }

  async function handleCopyFriendLink() {
    if (!user || friendLinkLoading) return;
    setFriendLinkLoading(true);

    try {
      // Try to fetch existing code
      const { data: existing } = await supabase
        .from('friend_codes')
        .select('code')
        .eq('user_id', user.id)
        .single();

      let code = existing?.code;

      if (!code) {
        // Generate a new code (8 char alphanumeric)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const arr = new Uint8Array(8);
        crypto.getRandomValues(arr);
        code = Array.from(arr, (b) => chars[b % chars.length]).join('');

        const { error } = await supabase
          .from('friend_codes')
          .insert({ user_id: user.id, code });

        if (error) {
          // Could be a race condition — try fetching again
          const { data: retry } = await supabase
            .from('friend_codes')
            .select('code')
            .eq('user_id', user.id)
            .single();
          code = retry?.code;
          if (!code) throw error;
        }

        trackFriendCodeGenerate();
      }

      const link = `${window.location.origin}?fc=${code}`;
      await navigator.clipboard.writeText(link);
      trackFriendCodeCopy();
      setFriendLinkCopied(true);
      setTimeout(() => setFriendLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy friend link:', err);
    }

    setFriendLinkLoading(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--theme-header-control-border)] text-[var(--theme-header-text)] hover:text-[var(--theme-header-text-hover)] active:text-[var(--theme-header-text-hover)] transition-colors text-sm cursor-pointer"
        style={{ backgroundColor: 'var(--theme-header-control-bg)' }}
        title="Profile"
      >
        <CircleUser className="w-4 h-4" />
        {badgeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 border border-[var(--theme-header-badge-border)] bg-[var(--theme-header-badge-bg)] text-[var(--theme-header-badge-text)]">
            {badgeCount}
          </span>
        )}
      </button>

      {open && createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={() => {
            setOpen(false);
            setSearchQuery('');
          }}>
            <div className="bg-[var(--theme-modal-bg)] border border-[var(--theme-border-primary)] rounded-xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)] rounded-t-xl" style={{ backgroundColor: 'var(--theme-modal-header-bg)' }}>
                <h2 className="text-base font-bold truncate" style={{ color: 'var(--theme-modal-header-text)' }}>{user.email}</h2>
                <button onClick={() => {
                  setOpen(false);
                  setSearchQuery('');
                }} className="p-1 hover:opacity-80 transition-colors cursor-pointer" style={{ color: 'var(--theme-modal-header-close)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="max-h-[80vh] overflow-y-auto px-4 py-5 space-y-4">
                {/* Profile Fields */}
                <div className="space-y-3">
                  {/* Avatar + Name row */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="relative group cursor-pointer shrink-0"
                    >
                      <UserAvatar
                        size="md"
                        avatarUrl={profile?.avatar_url}
                        xHandle={profile?.x_handle}
                        displayName={profile?.display_name}
                        email={profile?.email}
                      />
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {avatarUploading ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <User className="w-4 h-4 text-white" />
                        )}
                      </div>
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarSelect}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg focus-within:border-[var(--theme-accent)]">
                        <User className="w-4 h-4 text-[var(--theme-text-muted)] ml-3 shrink-0" />
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Username"
                          className="flex-1 bg-transparent text-[var(--theme-text-primary)] text-sm px-2 py-2 focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                        />
                      </div>
                    </div>
                  </div>
                  {avatarError && (
                    <p className="text-xs text-red-400">{avatarError}</p>
                  )}

                  <div>
                    <div className="flex items-center bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg focus-within:border-[var(--theme-accent)]">
                      <Building2 className="w-4 h-4 text-[var(--theme-text-muted)] ml-3 shrink-0" />
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Organization"
                        className="flex-1 bg-transparent text-[var(--theme-text-primary)] text-sm px-2 py-2 focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg focus-within:border-[var(--theme-accent)]">
                      <Briefcase className="w-4 h-4 text-[var(--theme-text-muted)] ml-3 shrink-0" />
                      <input
                        type="text"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="Job Title"
                        className="flex-1 bg-transparent text-[var(--theme-text-primary)] text-sm px-2 py-2 focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                      />
                    </div>
                  </div>

                  {/* X Account */}
                  {profile?.x_verified ? (
                    <div className="flex items-center gap-2 bg-[var(--theme-bg-primary)] border border-green-500/30 rounded-lg px-3 py-2">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-[var(--theme-text-secondary)]" aria-hidden="true">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      <span className="text-sm text-[var(--theme-text-primary)]">@{profile.x_handle}</span>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      <button
                        onClick={unlinkX}
                        className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={linkX}
                      className="flex items-center gap-2 w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] hover:border-[var(--theme-accent)] rounded-lg px-3 py-2 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Connect X Account
                    </button>
                  )}

                  <div>
                    <div className="flex items-center bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg focus-within:border-[var(--theme-accent)]">
                      <Send className="w-4 h-4 text-[var(--theme-text-muted)] ml-3 shrink-0" />
                      <input
                        type="text"
                        value={telegramHandle}
                        onChange={(e) => setTelegramHandle(e.target.value.replace(/^@/, ''))}
                        placeholder="Telegram"
                        className="flex-1 bg-transparent text-[var(--theme-text-primary)] text-sm px-2 py-2 focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg focus-within:border-[var(--theme-accent)]">
                      <Linkedin className="w-4 h-4 text-[var(--theme-text-muted)] ml-3 shrink-0" />
                      <input
                        type="text"
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        placeholder="linkedin.com/in/yourname"
                        className="flex-1 bg-transparent text-[var(--theme-text-primary)] text-sm px-2 py-2 focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                      />
                    </div>
                  </div>

                  {saveStatus === 'saved' && (
                    <div className="flex items-center gap-1 text-green-400">
                      <Check className="w-3.5 h-3.5" />
                      <span className="text-xs">Saved</span>
                    </div>
                  )}
                </div>

                {/* Lock Screen Card */}
                {(socialLinks.length > 0 || friendCode) && (
                  <button
                    onClick={() => setShowLockScreen(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-card-hover)] text-[var(--theme-text-primary)] rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    Generate Lock Screen
                  </button>
                )}

                {/* Friends */}
                <div className="border-t border-[var(--theme-border-primary)] pt-4 space-y-3">
                  {/* Friends button + Friend Link button */}
                  <div className="flex items-center gap-2">
                    {friendCount > 0 && (
                      <button
                        onClick={() => { setOpen(false); onOpenFriends(); }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-card-hover)] text-[var(--theme-text-primary)] transition-colors cursor-pointer"
                      >
                        <Users className="w-4 h-4" />
                        Friends {friendCount}
                      </button>
                    )}
                    <button
                      onClick={handleCopyFriendLink}
                      disabled={friendLinkLoading}
                      className={`${friendCount > 0 ? '' : 'flex-1 '}flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                        friendLinkCopied
                          ? 'bg-green-600 text-white'
                          : 'bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-card-hover)] text-[var(--theme-text-primary)]'
                      } disabled:opacity-50`}
                    >
                      {friendLinkCopied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : friendLinkLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Friend Link
                        </>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4" />
                          Friend Link
                        </>
                      )}
                    </button>
                  </div>

                  {/* Incoming friend requests */}
                  {incomingRequests.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-[var(--theme-accent-link)] uppercase tracking-wide">
                        Friend Requests ({incomingRequests.length})
                      </p>
                      <div className="space-y-0.5">
                        {incomingRequests.map((req) => (
                          <IncomingRequestRow
                            key={req.id}
                            request={req}
                            onAccept={() => handleRespondToRequest(req.id, true)}
                            onReject={() => handleRespondToRequest(req.id, false)}
                            responding={respondingTo === req.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search for friends */}
                  <div className="flex items-center gap-2 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg px-3 py-2 focus-within:border-[var(--theme-accent)] transition-colors">
                    <Search className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by email, name, or @twitter..."
                      className="flex-1 bg-transparent text-[var(--theme-text-primary)] text-sm outline-none placeholder:text-[var(--theme-text-muted)]"
                    />
                    {searchLoading && <Loader2 className="w-4 h-4 text-[var(--theme-text-muted)] animate-spin shrink-0" />}
                  </div>

                  {/* Search results */}
                  {searchQuery.trim() && searchResults.length > 0 && (
                    <div className="space-y-0.5">
                      {searchResults.map((result) => (
                        <SearchResultRow
                          key={result.user_id}
                          result={result}
                          onSend={handleSendRequest}
                          onAccept={handleAcceptFromSearch}
                          sending={sendingTo}
                        />
                      ))}
                    </div>
                  )}

                  {searchQuery.trim() && !searchLoading && searchResults.length === 0 && (
                    <p className="text-xs text-[var(--theme-text-muted)] text-center py-2">
                      No users found
                    </p>
                  )}

                  {/* Outgoing requests (collapsible) */}
                  {outgoingRequests.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowOutgoing(!showOutgoing)}
                        className="text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-colors cursor-pointer"
                      >
                        {showOutgoing ? 'Hide' : 'Show'} sent requests ({outgoingRequests.length})
                      </button>
                      {showOutgoing && (
                        <div className="space-y-0.5 mt-1">
                          {outgoingRequests.map((req) => (
                            <OutgoingRequestRow
                              key={req.id}
                              request={req}
                              onCancel={() => handleCancelRequest(req.id)}
                              cancelling={cancellingId === req.id}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {friendCount === 0 && incomingRequests.length === 0 && !searchQuery.trim() && (
                    <p className="text-xs text-[var(--theme-text-muted)]">
                      Search by email, name, or @handle to find friends
                    </p>
                  )}
                </div>

                {/* Sign Out + Dark Mode Toggle */}
                <div className="border-t border-[var(--theme-border-primary)] pt-4 flex items-center gap-2">
                  <button
                    onClick={() => {
                      trackSignOut();
                      signOut();
                      setOpen(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-[var(--theme-border-primary)] hover:border-red-500/50 hover:bg-red-500/10 text-[var(--theme-text-secondary)] hover:text-red-400 rounded-lg text-sm transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                  <button
                    onClick={() => setTheme(theme === 'dark' ? 'light-blue' : 'dark')}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="shrink-0 flex items-center justify-center w-10 h-10 border border-[var(--theme-border-primary)] hover:border-[var(--theme-text-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] rounded-lg transition-colors cursor-pointer"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                </div>

                {/* Profile Ad Placement */}
                {(() => {
                  const profileAd = (config?.native_ads as NativeAd[] | undefined)?.find(ad => ad.active !== false)
                    || (config?.profile_ad as NativeAd | undefined);
                  if (!profileAd) return null;
                  return (
                    <a
                      href={isSafeHttpUrl(profileAd.link) ? profileAd.link : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-4"
                      onClick={() => {
                        trackAdClick('profile', profileAd.link);
                        trackAdEvent({ ad_id: profileAd.id || 'profile-ad', ad_name: profileAd.title, placement: 'profile', event_type: 'click', url: profileAd.link });
                      }}
                    >
                      <div className="bg-[var(--theme-bg-card)] border border-[var(--theme-border-primary)] rounded-lg p-3 transition-colors hover:border-[var(--theme-accent)]">
                        <div className="flex gap-3">
                          {profileAd.imageUrl && (
                            <div className="w-[60px] h-[60px] flex-shrink-0 rounded-lg overflow-hidden bg-[var(--theme-bg-tertiary)]">
                              <img src={profileAd.imageUrl} alt={profileAd.title} className="w-full h-full object-contain" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-[var(--theme-text-primary)] truncate">{profileAd.title}</span>
                              <span className="flex-shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--theme-accent-muted)] text-[var(--theme-accent)] border border-[var(--theme-accent-muted)]">
                                Ad
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--theme-text-secondary)] line-clamp-2 mb-1.5">{profileAd.description}</p>
                            <span className="inline-flex items-center gap-1 text-[var(--theme-accent)] text-[11px] font-medium">
                              {profileAd.badge || 'Learn more'}
                              <ArrowRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </a>
                  );
                })()}
              </div>
            </div>
          </div>,
          document.body
      )}
      <ShareCardModal
        isOpen={showShareCard}
        onClose={() => setShowShareCard(false)}
        events={itineraryEvents}
        conferenceName={shareConferenceName}
        displayName={profile?.display_name ?? null}
        avatarUrl={profile?.avatar_url}
      />
      <LockScreenModal
        isOpen={showLockScreen}
        onClose={() => setShowLockScreen(false)}
        displayName={profile?.display_name ?? null}
        company={profile?.company ?? null}
        jobTitle={profile?.job_title ?? null}
        avatarUrl={profile?.avatar_url ?? null}
        xHandle={profile?.x_handle ?? null}
        socialLinks={socialLinks}
        friendCode={friendCode}
      />
    </>
  );
}

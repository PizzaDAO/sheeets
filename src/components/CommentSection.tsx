'use client';

import { useState, useEffect } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { createPortal } from 'react-dom';
import { Send, Trash2, MessageCircle, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEventComments } from '@/hooks/useEventComments';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/time-parse';
import { getDisplayName } from '@/lib/user-display';
import UserAvatar from './UserAvatar';
import ProfileCardModal from './ProfileCardModal';
import { trackCommentExpand, trackCommentAdd, trackCommentDelete, trackCommentVisibilityToggle } from '@/lib/analytics';
import { useXVerification } from '@/hooks/useXVerification';

interface CommentSectionProps {
  eventId: string;
  commentCount?: number;
  eventName?: string;
}

export function CommentSection({ eventId, commentCount = 0, eventName }: CommentSectionProps) {
  const { user } = useAuth();
  const { isXVerified, linkX } = useXVerification();
  const [expanded, setExpanded] = useState(false);
  const isMobile = useMediaQuery('(max-width: 639px)');
  const { comments, loading, addComment, deleteComment } = useEventComments(
    expanded ? eventId : null
  );
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<{
    userId: string;
    displayName?: string | null;
    xHandle?: string | null;
    avatarUrl?: string | null;
    jobTitle?: string | null;
    company?: string | null;
    linkedinUrl?: string | null;
    telegramHandle?: string | null;
  } | null>(null);

  // Body scroll lock when modal is open on mobile
  useEffect(() => {
    if (expanded && isMobile) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [expanded, isMobile]);

  // Escape key to close
  useEffect(() => {
    if (!expanded || !isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expanded, isMobile]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    await addComment(text, visibility);
    trackCommentAdd(eventId, visibility);
    setText('');
  };

  if (!expanded) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          trackCommentExpand(eventId);
          setExpanded(true);
        }}
        className="flex items-center gap-1.5 text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-colors cursor-pointer"
      >
        <MessageCircle className="w-5 h-5" />
        {commentCount > 0 && <span>{commentCount}</span>}
      </button>
    );
  }

  // Shared comment list content
  const commentListContent = (
    <>
      {loading ? (
        <div className="text-xs text-[var(--theme-text-muted)] py-2">Loading...</div>
      ) : (
        <>
          {comments.map((comment) => {
            const name = getDisplayName(comment);

            return (
              <div key={comment.id} className="flex gap-2 group/comment">
                <button
                  className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProfile({
                      userId: comment.user_id,
                      displayName: comment.display_name,
                      xHandle: comment.x_handle,
                      avatarUrl: comment.avatar_url,
                      jobTitle: comment.job_title,
                      company: comment.company,
                      linkedinUrl: comment.linkedin_url,
                      telegramHandle: comment.telegram_handle,
                    });
                  }}
                >
                  <UserAvatar size="xs" avatarUrl={comment.avatar_url} xHandle={comment.x_handle} displayName={comment.display_name} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      className="text-[11px] font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-accent)] transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProfile({
                          userId: comment.user_id,
                          displayName: comment.display_name,
                          xHandle: comment.x_handle,
                          avatarUrl: comment.avatar_url,
                          jobTitle: comment.job_title,
                          company: comment.company,
                          linkedinUrl: comment.linkedin_url,
                          telegramHandle: comment.telegram_handle,
                        });
                      }}
                    >
                      {name}
                    </button>
                    <span className="text-[10px] text-[var(--theme-text-faint)]">{timeAgo(comment.created_at)}</span>
                    {comment.visibility === 'friends' && (
                      <span className="text-[9px] rounded px-1" style={{ color: 'var(--friend-blue)', opacity: 0.6, borderWidth: '1px', borderColor: 'color-mix(in srgb, var(--friend-blue) 30%, transparent)' }}>friends</span>
                    )}
                    {user && comment.user_id === user.id && (
                      <button
                        onClick={() => { trackCommentDelete(eventId); deleteComment(comment.id); }}
                        className="opacity-0 group-hover/comment:opacity-100 p-0.5 text-[var(--theme-text-faint)] hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--theme-text-secondary)] leading-relaxed break-words">{comment.text}</p>
                </div>
              </div>
            );
          })}
          {comments.length === 0 && !loading && (
            <p className="text-xs text-[var(--theme-text-faint)] py-1">No comments yet</p>
          )}
        </>
      )}
    </>
  );

  // Handle email sign-up then X OAuth link
  const handleEmailThenLinkX = async () => {
    if (!email.trim()) return;
    setEmailLoading(true);
    setEmailError(null);

    // Sign up with a random password — auto-confirms since enable_confirmations = false
    // Next login they'll use OTP
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: crypto.randomUUID(),
    });

    if (error) {
      // If account exists, they need to sign in properly
      if (error.message?.includes('already registered') || error.status === 422) {
        setEmailError('Account exists — sign in from the menu first');
      } else {
        setEmailError(error.message);
      }
      setEmailLoading(false);
      return;
    }

    // Account created + session active, now start X OAuth
    setEmailLoading(false);
    linkX();
  };

  // Shared input content
  const inputContent = user && isXVerified ? (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center gap-1 bg-[var(--theme-bg-tertiary)]/50 border border-[var(--theme-border-primary)] rounded-lg px-2 py-1.5">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Add a comment..."
          maxLength={500}
          className="flex-1 bg-transparent text-xs text-[var(--theme-text-primary)] placeholder-slate-500 outline-none min-w-0"
        />
        <button
          onClick={() => { const next = visibility === 'public' ? 'friends' : 'public'; trackCommentVisibilityToggle(next); setVisibility(next); }}
          className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 cursor-pointer transition-colors ${
            visibility === 'friends'
              ? ''
              : 'border-[var(--theme-border-primary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]'
          }`}
          style={visibility === 'friends' ? { borderColor: 'color-mix(in srgb, var(--friend-blue) 40%, transparent)', color: 'var(--friend-blue)', backgroundColor: 'color-mix(in srgb, var(--friend-blue) 10%, transparent)' } : undefined}
          title={visibility === 'public' ? 'Visible to everyone' : 'Visible to friends only'}
        >
          {visibility === 'public' ? 'public' : 'friends'}
        </button>
      </div>
      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        className="p-1.5 rounded-lg bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] disabled:bg-[var(--theme-bg-tertiary)] disabled:text-[var(--theme-text-muted)] text-[var(--theme-accent-text)] transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : user && !isXVerified ? (
    // Logged in but X not verified — go straight to X OAuth
    <button
      onClick={(e) => {
        e.stopPropagation();
        linkX();
      }}
      className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-tertiary)]/50 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-accent)] transition-colors cursor-pointer"
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Connect X to comment
    </button>
  ) : showEmailPrompt ? (
    // Not logged in — email prompt before X OAuth
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEmailThenLinkX();
            }
          }}
          placeholder="Enter your email..."
          className="flex-1 bg-[var(--theme-bg-tertiary)]/50 border border-[var(--theme-border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--theme-text-primary)] placeholder-slate-500 outline-none min-w-0"
          autoFocus
        />
        <button
          onClick={handleEmailThenLinkX}
          disabled={!email.trim() || emailLoading}
          className="px-3 py-2 rounded-lg bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] disabled:bg-[var(--theme-bg-tertiary)] disabled:text-[var(--theme-text-muted)] text-[var(--theme-accent-text)] text-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {emailLoading ? '...' : 'Go'}
        </button>
      </div>
      {emailError && (
        <p className="text-xs text-red-400">{emailError}</p>
      )}
    </div>
  ) : (
    // Not logged in — show connect CTA
    <button
      onClick={(e) => {
        e.stopPropagation();
        setShowEmailPrompt(true);
      }}
      className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-tertiary)]/50 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-accent)] transition-colors cursor-pointer"
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Connect X to comment
    </button>
  );

  // Mobile: render bottom-sheet modal via portal
  if (isMobile) {
    return (
      <>
        {/* Keep the button visible so the user knows comments are active */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className="flex items-center gap-1.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
        >
          <MessageCircle className="w-5 h-5" />
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>
        {createPortal(
          <div
            className="fixed inset-0 z-[80] flex flex-col justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setExpanded(false)}
            />

            {/* Bottom sheet panel */}
            <div className="relative bg-[var(--theme-bg-secondary)] rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)]">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-[var(--theme-text-primary)]">
                    {comments.length > 0 ? `${comments.length} Comment${comments.length !== 1 ? 's' : ''}` : 'Comments'}
                  </h3>
                  {eventName && (
                    <p className="text-xs text-[var(--theme-text-secondary)] truncate">{eventName}</p>
                  )}
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer shrink-0 ml-2"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable comment list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {commentListContent}
              </div>

              {/* Sticky input at bottom */}
              <div className="border-t border-[var(--theme-border-primary)] px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                {inputContent}
              </div>
            </div>
          </div>,
          document.body
        )}
        {selectedProfile && (
          <ProfileCardModal
            isOpen={!!selectedProfile}
            onClose={() => setSelectedProfile(null)}
            userId={selectedProfile.userId}
            displayName={selectedProfile.displayName}
            xHandle={selectedProfile.xHandle}
            avatarUrl={selectedProfile.avatarUrl}
            jobTitle={selectedProfile.jobTitle}
            company={selectedProfile.company}
            linkedinUrl={selectedProfile.linkedinUrl}
            telegramHandle={selectedProfile.telegramHandle}
          />
        )}
      </>
    );
  }

  // Desktop: inline expansion (existing behavior)
  return (
    <div className="mt-2 border-t border-[var(--theme-border-primary)]/50 pt-2" onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-1.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer mb-2"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        <span>
          {comments.length > 0 ? `${comments.length} comment${comments.length !== 1 ? 's' : ''}` : 'Comments'}
        </span>
      </button>

      {/* Comments list */}
      <div className="max-h-[200px] overflow-y-auto space-y-2 mb-2">
        {commentListContent}
      </div>

      {/* Input */}
      {inputContent}

      {/* Profile card modal */}
      {selectedProfile && (
        <ProfileCardModal
          isOpen={!!selectedProfile}
          onClose={() => setSelectedProfile(null)}
          userId={selectedProfile.userId}
          displayName={selectedProfile.displayName}
          xHandle={selectedProfile.xHandle}
          avatarUrl={selectedProfile.avatarUrl}
          jobTitle={selectedProfile.jobTitle}
          company={selectedProfile.company}
          linkedinUrl={selectedProfile.linkedinUrl}
          telegramHandle={selectedProfile.telegramHandle}
        />
      )}
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  );
}

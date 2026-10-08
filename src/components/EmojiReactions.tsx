'use client';

import { useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { REACTION_EMOJIS } from '@/lib/constants';
import type { ReactionEmoji } from '@/lib/types';
import { trackReactionToggle, trackReactionPickerOpen } from '@/lib/analytics';

interface ReactionSummary {
  emoji: ReactionEmoji;
  count: number;
  reacted: boolean;
}

interface EmojiReactionsProps {
  eventId: string;
  reactions?: ReactionSummary[];
  onToggle: (eventId: string, emoji: ReactionEmoji) => void;
  compact?: boolean;
}

export function EmojiReactions({
  eventId,
  reactions = [],
  onToggle,
  compact = false,
}: EmojiReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);

  const gap = compact ? 'gap-1' : 'gap-1.5';

  return (
    <div className={`flex flex-wrap items-center ${gap}`}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={(e) => {
            e.stopPropagation();
            trackReactionToggle(eventId, r.emoji, !r.reacted);
            onToggle(eventId, r.emoji);
          }}
          className="py-0.5 transition-colors cursor-pointer inline-flex items-center gap-0.5"
        >
          <span className="text-[18px] leading-none">{r.emoji}</span>
          <span className={`text-xs ${r.reacted ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)]'}`}>{r.count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!showPicker) trackReactionPickerOpen();
            setShowPicker(!showPicker);
          }}
          className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer inline-flex items-center"
        >
          <ThumbsUp className="w-5 h-5 translate-y-[3px]" />
        </button>

        {showPicker && (
          <>
            <div
              className="fixed inset-0 z-[40]"
              onClick={(e) => {
                e.stopPropagation();
                setShowPicker(false);
              }}
            />
            <div className="absolute bottom-full left-0 mb-1 z-[41] bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-lg shadow-xl p-1.5 grid grid-cols-4 gap-1 min-w-[160px]">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    trackReactionToggle(eventId, emoji, true);
                    onToggle(eventId, emoji as ReactionEmoji);
                    setShowPicker(false);
                  }}
                  className="p-1.5 rounded hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer text-base"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

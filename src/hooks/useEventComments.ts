'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { EventComment } from '@/lib/types';

/**
 * Per-event hook for managing comments.
 * Returns comments list, addComment, and deleteComment functions.
 */
export function useEventComments(eventId: string | null) {
  const { user } = useAuth();
  const [comments, setComments] = useState<EventComment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setComments([]);
      return;
    }

    setLoading(true);

    async function fetchComments() {
      const { data, error } = await supabase
        .from('event_comments')
        .select('id, event_id, user_id, text, visibility, created_at')
        .eq('event_id', eventId!)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to fetch comments:', error);
        setLoading(false);
        return;
      }

      // Fetch display names for comment authors
      const userIds = [...new Set((data ?? []).map((c: { user_id: string }) => c.user_id))];
      let profileMap = new Map<string, { display_name: string | null; x_handle: string | null; rsvp_name: string | null; avatar_url: string | null; job_title: string | null; company: string | null; linkedin_url: string | null; telegram_handle: string | null }>();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, x_handle, rsvp_name, avatar_url, job_title, company, linkedin_url, telegram_handle')
          .in('user_id', userIds);

        if (profiles) {
          profileMap = new Map(
            profiles.map((p: { user_id: string; display_name: string | null; x_handle: string | null; rsvp_name: string | null; avatar_url: string | null; job_title: string | null; company: string | null; linkedin_url: string | null; telegram_handle: string | null }) => [
              p.user_id,
              { display_name: p.display_name, x_handle: p.x_handle, rsvp_name: p.rsvp_name, avatar_url: p.avatar_url, job_title: p.job_title, company: p.company, linkedin_url: p.linkedin_url, telegram_handle: p.telegram_handle },
            ])
          );
        }
      }

      setComments(
        (data ?? []).map((c: { id: string; event_id: string; user_id: string; text: string; visibility: string; created_at: string }) => {
          const profile = profileMap.get(c.user_id);
          return {
            ...c,
            visibility: c.visibility as 'public' | 'friends',
            display_name: profile?.display_name ?? undefined,
            x_handle: profile?.x_handle ?? undefined,
            rsvp_name: profile?.rsvp_name ?? undefined,
            avatar_url: profile?.avatar_url ?? undefined,
            job_title: profile?.job_title ?? undefined,
            company: profile?.company ?? undefined,
            linkedin_url: profile?.linkedin_url ?? undefined,
            telegram_handle: profile?.telegram_handle ?? undefined,
          };
        })
      );
      setLoading(false);
    }

    fetchComments();
  }, [eventId, user]);

  const addComment = useCallback(
    async (text: string, visibility: 'public' | 'friends' = 'public') => {
      if (!user || !eventId || !text.trim()) return;

      const { data, error } = await supabase
        .from('event_comments')
        .insert({
          event_id: eventId,
          user_id: user.id,
          text: text.trim().slice(0, 500),
          visibility,
        })
        .select('id, event_id, user_id, text, visibility, created_at')
        .single();

      if (error) {
        console.error('Failed to add comment:', error);
        return;
      }

      if (data) {
        // Fetch own profile for display
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, x_handle, rsvp_name, avatar_url, job_title, company, linkedin_url, telegram_handle')
          .eq('user_id', user.id)
          .single();

        setComments((prev) => [
          ...prev,
          {
            ...data,
            visibility: data.visibility as 'public' | 'friends',
            display_name: profile?.display_name ?? undefined,
            x_handle: profile?.x_handle ?? undefined,
            rsvp_name: profile?.rsvp_name ?? undefined,
            avatar_url: profile?.avatar_url ?? undefined,
            job_title: profile?.job_title ?? undefined,
            company: profile?.company ?? undefined,
            linkedin_url: profile?.linkedin_url ?? undefined,
            telegram_handle: profile?.telegram_handle ?? undefined,
          },
        ]);
      }
    },
    [user, eventId]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!user) return;

      // Optimistic remove
      setComments((prev) => prev.filter((c) => c.id !== commentId));

      const { error } = await supabase
        .from('event_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Failed to delete comment:', error);
        // Refetch to restore
        if (eventId) {
          const { data } = await supabase
            .from('event_comments')
            .select('id, event_id, user_id, text, visibility, created_at')
            .eq('event_id', eventId)
            .order('created_at', { ascending: true });
          if (data) setComments(data.map((c: { id: string; event_id: string; user_id: string; text: string; visibility: string; created_at: string }) => ({
            ...c,
            visibility: c.visibility as 'public' | 'friends',
          })));
        }
      }
    },
    [user, eventId]
  );

  return { comments, loading, addComment, deleteComment };
}

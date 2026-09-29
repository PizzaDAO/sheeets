'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { FriendInfo } from '@/lib/types';
import { StarButton } from './StarButton';
import { isSafeHttpUrl } from '@/lib/utils';

interface OGImageProps {
  url: string;
  eventId?: string;
  rsvpUrl?: string;
  /** If provided, clicking the thumbnail calls this instead of opening the built-in lightbox */
  onOpenLightbox?: (imageUrl: string, rsvpUrl?: string) => void;
  /** Props for built-in lightbox (used when onOpenLightbox is not provided, e.g. map view) */
  isInItinerary?: boolean;
  onItineraryToggle?: (eventId: string) => void;
  friendsGoing?: FriendInfo[];
}

export const imageCache = new Map<string, string | null>();

export function OGImage({ url, eventId, rsvpUrl, onOpenLightbox, isInItinerary, onItineraryToggle, friendsGoing }: OGImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    imageCache.get(url) ?? null
  );
  const [loaded, setLoaded] = useState(imageCache.has(url));
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (imageCache.has(url)) {
      setImageUrl(imageCache.get(url) ?? null);
      setLoaded(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const params = new URLSearchParams({ url });
        if (eventId) params.set('eventId', eventId);

        fetch(`/api/og?${params.toString()}`)
          .then((res) => res.json())
          .then((data) => {
            imageCache.set(url, data.imageUrl);
            setImageUrl(data.imageUrl);
            setLoaded(true);
          })
          .catch(() => {
            imageCache.set(url, null);
            setLoaded(true);
          });
      },
      { rootMargin: '200px' }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [url, eventId]);

  // Built-in lightbox keyboard/scroll handling (only used when no external lightbox)
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [lightboxOpen]);

  if (loaded && !imageUrl) return null;
  if (error) return null;

  return (
    <>
      <div
        ref={ref}
        className="shrink-0 w-[88px] sm:w-[106px] rounded-lg overflow-hidden bg-stone-800/30 self-center cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          if (!imageUrl) return;
          if (onOpenLightbox) {
            onOpenLightbox(imageUrl, rsvpUrl);
          } else {
            setLightboxOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="View image fullscreen"
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-auto rounded-lg"
            loading="lazy"
            decoding="async"
            onError={() => setError(true)}
          />
        )}
        {!loaded && (
          <div className="w-full h-[88px] sm:h-[106px] animate-pulse bg-stone-800/50" />
        )}
      </div>

      {/* Built-in lightbox (used when no external lightbox handler) */}
      {lightboxOpen && imageUrl && !onOpenLightbox && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer z-10"
            aria-label="Close lightbox"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageUrl}
              alt=""
              className="max-w-[60vw] max-h-[60vh] object-contain rounded-lg"
            />
            <div className="flex items-center gap-3">
              {eventId && onItineraryToggle && (
                <StarButton
                  eventId={eventId}
                  isStarred={isInItinerary ?? false}
                  onToggle={onItineraryToggle}
                />
              )}
              {isSafeHttpUrl(rsvpUrl) && (
                <a
                  href={rsvpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Event Page &rarr;
                </a>
              )}
              {friendsGoing && friendsGoing.length > 0 && (
                <div className="flex items-center">
                  {friendsGoing.slice(0, 3).map((friend, i) => (
                    <div
                      key={friend.userId}
                      className={`w-6 h-6 rounded-full border-2 border-white/30 shrink-0 overflow-hidden ${i > 0 ? '-ml-2' : ''}`}
                      style={{ zIndex: 3 - i }}
                      title={friend.displayName}
                    >
                      {friend.avatarUrl ? (
                        <img src={friend.avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ backgroundColor: `hsl(${Math.abs(friend.userId.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)) % 360}, 60%, 45%)` }}
                        >
                          {(friend.displayName || '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Standalone Lightbox — used by ListView for prev/next navigation    */
/* ------------------------------------------------------------------ */

interface FlyerLightboxProps {
  imageUrl: string;
  rsvpUrl?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  eventId?: string;
  isInItinerary?: boolean;
  onItineraryToggle?: (eventId: string) => void;
  friendsGoing?: FriendInfo[];
}

export function FlyerLightbox({ imageUrl, rsvpUrl, onClose, onPrev, onNext, eventId, isInItinerary, onItineraryToggle, friendsGoing }: FlyerLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && onPrev) { e.preventDefault(); onPrev(); }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && onNext) { e.preventDefault(); onNext(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer z-10"
        aria-label="Close lightbox"
      >
        <X className="w-6 h-6" />
      </button>
      {onPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer z-10"
          aria-label="Previous flyer"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {onNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer z-10"
          aria-label="Next flyer"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
      <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <img
          src={imageUrl}
          alt=""
          className="max-w-[60vw] max-h-[60vh] object-contain rounded-lg"
        />
        <div className="flex items-center gap-3">
          {eventId && onItineraryToggle && (
            <StarButton
              eventId={eventId}
              isStarred={isInItinerary ?? false}
              onToggle={onItineraryToggle}
            />
          )}
          {isSafeHttpUrl(rsvpUrl) && (
            <a
              href={rsvpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Event Page &rarr;
            </a>
          )}
          {friendsGoing && friendsGoing.length > 0 && (
            <div className="flex items-center">
              {friendsGoing.slice(0, 3).map((friend, i) => (
                <div
                  key={friend.userId}
                  className={`w-6 h-6 rounded-full border-2 border-white/30 shrink-0 overflow-hidden ${i > 0 ? '-ml-2' : ''}`}
                  style={{ zIndex: 3 - i }}
                  title={friend.displayName}
                >
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: `hsl(${Math.abs(friend.userId.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)) % 360}, 60%, 45%)` }}
                    >
                      {(friend.displayName || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

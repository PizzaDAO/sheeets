/**
 * REST API client wrapper for the sheeets Agent API.
 *
 * Base URL: https://qsiukfwuwbpwyujfahtz.supabase.co/functions/v1/agent-api
 */

const DEFAULT_BASE_URL =
  "https://qsiukfwuwbpwyujfahtz.supabase.co/functions/v1/agent-api";

export interface SheeetsEvent {
  id: string;
  conference: string;
  date: string;
  dateISO: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  organizer: string;
  name: string;
  address: string;
  cost: string;
  isFree: boolean;
  tags: string[];
  link: string;
  hasFood: boolean;
  hasBar: boolean;
  note: string;
  lat: number | null;
  lng: number | null;
}

export interface Conference {
  name: string;
  count: number;
}

export interface Tag {
  name: string;
  count: number;
}

export interface DateCount {
  date: string;
  count: number;
}

export type ItineraryEvent = SheeetsEvent;

export interface Friend {
  user_id: string;
  display_name: string | null;
  x_handle: string | null;
  email: string | null;
  farcaster_username: string | null;
}

export interface FriendGoing {
  eventId: string;
  friends: Friend[];
}

export interface Rsvp {
  id: string;
  event_id: string;
  status: string;
  created_at: string;
}

export interface Recommendation extends SheeetsEvent {
  score: number;
  reasons: string[];
}

export interface ApiError {
  error: string;
}

export class SheeetsAPI {
  private baseUrl: string;
  private apiKey?: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });

    if (!res.ok) {
      let errorMessage: string;
      try {
        const body = (await res.json()) as ApiError;
        errorMessage = body.error || `API error: ${res.status} ${res.statusText}`;
      } catch {
        errorMessage = `API error: ${res.status} ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return (await res.json()) as T;
  }

  // ---------------------------------------------------------------------------
  // Events (public, no auth required)
  // ---------------------------------------------------------------------------

  async searchEvents(params: {
    conference?: string;
    date?: string;
    tags?: string;
    search?: string;
    free?: boolean;
    now?: boolean;
  } = {}): Promise<{ data: SheeetsEvent[]; count: number }> {
    const qs = new URLSearchParams();
    if (params.conference) qs.set("conference", params.conference);
    if (params.date) qs.set("date", params.date);
    if (params.tags) qs.set("tags", params.tags);
    if (params.search) qs.set("search", params.search);
    if (params.free !== undefined) qs.set("free", String(params.free));
    if (params.now !== undefined) qs.set("now", String(params.now));

    const query = qs.toString();
    const path = query ? `/events?${query}` : "/events";
    return this.request(path);
  }

  async getEvent(eventId: string): Promise<{ data: SheeetsEvent }> {
    return this.request(`/events/${encodeURIComponent(eventId)}`);
  }

  async listConferences(): Promise<{ data: Conference[] }> {
    return this.request("/events/conferences");
  }

  async listTags(): Promise<{ data: Tag[] }> {
    return this.request("/events/tags");
  }

  async listDates(): Promise<{ data: DateCount[] }> {
    return this.request("/events/dates");
  }

  // ---------------------------------------------------------------------------
  // Itinerary (auth required)
  // ---------------------------------------------------------------------------

  async getItinerary(): Promise<{ data: ItineraryEvent[] }> {
    return this.request("/itinerary");
  }

  async addToItinerary(
    eventIds: string[]
  ): Promise<{ success: boolean; added: number }> {
    return this.request("/itinerary/add", {
      method: "POST",
      body: JSON.stringify({ eventIds }),
    });
  }

  async removeFromItinerary(
    eventIds: string[]
  ): Promise<{ success: boolean; removed: number }> {
    return this.request("/itinerary/remove", {
      method: "POST",
      body: JSON.stringify({ eventIds }),
    });
  }

  // ---------------------------------------------------------------------------
  // Friends (auth required, read-only)
  // ---------------------------------------------------------------------------

  async getFriends(): Promise<{ data: Friend[] }> {
    return this.request("/friends");
  }

  async friendsGoing(
    eventId?: string
  ): Promise<{ data: FriendGoing[] }> {
    const path = eventId
      ? `/friends/going?eventId=${encodeURIComponent(eventId)}`
      : "/friends/going";
    return this.request(path);
  }

  // ---------------------------------------------------------------------------
  // RSVPs (auth required)
  // ---------------------------------------------------------------------------

  async listRsvps(): Promise<{ data: Rsvp[] }> {
    return this.request("/rsvps");
  }

  async rsvpEvent(
    eventId: string
  ): Promise<{ success: boolean; rsvp: Rsvp }> {
    return this.request("/rsvps", {
      method: "POST",
      body: JSON.stringify({ eventId }),
    });
  }

  // ---------------------------------------------------------------------------
  // Recommendations (auth required)
  // ---------------------------------------------------------------------------

  async getRecommendations(): Promise<{ data: Recommendation[] }> {
    return this.request("/recommendations");
  }
}

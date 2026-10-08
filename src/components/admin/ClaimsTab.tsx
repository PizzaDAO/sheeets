'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, X, Ban, Link2, ChevronDown, ChevronUp, ExternalLink, AlertTriangle, BadgeCheck } from 'lucide-react';
import type { TabConfig } from '@/lib/conferences';
import { inputClass } from './styles';
import { isSafeHttpUrl } from '@/lib/utils';

interface HostSnapshot {
  api_id: string;
  name: string | null;
  username: string | null;
  twitter_handle: string | null;
}

interface AdminClaim {
  id: string;
  user_id: string;
  event_id: string;
  event_ids: string[];
  conference: string;
  event_name: string;
  event_link: string | null;
  luma_event_api_id: string | null;
  method: 'luma_code' | 'luma_host' | 'manual' | 'admin_grant';
  status: 'pending' | 'verified' | 'rejected' | 'revoked' | 'withdrawn';
  verification_code: string | null;
  verify_attempts: number;
  claimant_note: string | null;
  evidence: Record<string, unknown>;
  host_api_id: string | null;
  derived_from_claim_id: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  verified_at: string | null;
  created_at: string;
  claimant: { email: string | null; display_name: string | null; x_handle: string | null } | null;
  hosts: HostSnapshot[];
  handle_match: { host_name: string | null; twitter_handle: string | null } | null;
  other_verified_count: number;
  host_grant: { host_api_id: string; host_name: string | null; revoked_at: string | null } | null;
  orphaned: boolean | null;
}

interface Props {
  allConferenceTabs: TabConfig[];
  password: string;
}

type StatusFilter = 'pending' | 'verified' | 'rejected' | 'revoked' | 'withdrawn' | 'all';
type Action = 'approve' | 'reject' | 'revoke' | 'relink';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  verified: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
  revoked: 'bg-red-500/20 text-red-400',
  withdrawn: 'bg-stone-700 text-stone-300',
};

const METHOD_LABEL: Record<string, string> = {
  luma_code: 'Luma code',
  luma_host: 'Verified Luma host',
  manual: 'Manual review',
  admin_grant: 'Admin grant',
};

function timeAgo(date: string, now: number): string {
  const seconds = Math.floor((now - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ClaimsTab({ allConferenceTabs, password }: Props) {
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [conferenceFilter, setConferenceFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ id: string; action: Action } | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [relinkId, setRelinkId] = useState('');
  const [fetchedAt, setFetchedAt] = useState(0);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ password, status: statusFilter });
      if (conferenceFilter) params.set('conference', conferenceFilter);
      const res = await fetch(`/api/admin/claims?${params}`);
      const json = await res.json();
      setClaims(json.claims ?? []);
      setNote(json.note ?? (json.error ? `Error: ${json.error}` : null));
      setFetchedAt(Date.now());
    } catch (err) {
      setNote(`Error: ${err instanceof Error ? err.message : 'Failed to load'}`);
    } finally {
      setLoading(false);
    }
  }, [password, statusFilter, conferenceFilter]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const runAction = async (id: string, action: Action) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/claims/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action,
          note: actionNote.trim() || undefined,
          eventId: action === 'relink' ? relinkId.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPendingAction(null);
        setActionNote('');
        setRelinkId('');
        if (action === 'revoke' && json.derived_revoked > 0) {
          alert(`Revoked. ${json.derived_revoked} claim(s) auto-verified through this host were revoked too.`);
        }
        await fetchClaims();
      } else {
        alert(`Failed: ${json.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = claims.filter((c) => c.status === 'pending').length;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 bg-stone-900 rounded-lg p-1">
          {(['pending', 'verified', 'rejected', 'revoked', 'withdrawn', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                statusFilter === s ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-white'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s === 'pending' && statusFilter === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
        <select
          value={conferenceFilter}
          onChange={(e) => setConferenceFilter(e.target.value)}
          className="bg-stone-800 border border-stone-600 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="">All conferences</option>
          {allConferenceTabs.map((t) => (
            <option key={t.gid} value={t.name}>{t.name}</option>
          ))}
        </select>
        <span className="text-xs text-stone-500">Manual claims: we promise a review within 48 hours.</span>
      </div>

      {note && <p className="text-sm text-amber-400">{note}</p>}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
        </div>
      )}

      {!loading && claims.length === 0 && (
        <div className="text-center py-12 text-stone-500">
          <p className="text-lg">No {statusFilter === 'all' ? '' : statusFilter} claims</p>
          <p className="text-sm mt-1">Host claims from &quot;Claim this event&quot; appear here.</p>
        </div>
      )}

      {!loading && claims.map((c) => {
        const isExpanded = expandedId === c.id;
        const isActioning = actionLoading === c.id;
        const active = pendingAction?.id === c.id ? pendingAction.action : null;
        const matchedIn = typeof c.evidence?.matched_in === 'string' ? (c.evidence.matched_in as string) : null;

        return (
          <div key={c.id} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <button
              onClick={() => {
                setExpandedId(isExpanded ? null : c.id);
                setPendingAction(null);
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-stone-800/50 transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-white truncate">{c.event_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                  <span className="text-xs bg-stone-700 text-stone-300 px-2 py-0.5 rounded-full">{c.conference}</span>
                  <span className="text-xs bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full">{METHOD_LABEL[c.method] ?? c.method}</span>
                  {c.handle_match && (
                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full" title="Claimant's self-entered X handle matches a Luma host — a hint, not proof">
                      handle matches host
                    </span>
                  )}
                  {c.other_verified_count > 0 && (
                    <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {c.other_verified_count} other verified
                    </span>
                  )}
                  {c.orphaned && (
                    <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full">orphaned</span>
                  )}
                  {c.host_grant && !c.host_grant.revoked_at && (
                    <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <BadgeCheck className="w-3 h-3" /> host-wide
                    </span>
                  )}
                </div>
                <div className="text-sm text-stone-400 truncate">
                  {c.claimant?.email || c.user_id}
                  {c.claimant?.display_name ? ` · ${c.claimant.display_name}` : ''}
                  {c.claimant?.x_handle ? ` · @${c.claimant.x_handle.replace(/^@/, '')}` : ''}
                </div>
              </div>
              <span className="text-xs text-stone-500 whitespace-nowrap">{fetchedAt ? timeAgo(c.created_at, fetchedAt) : ''}</span>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-stone-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-stone-500 shrink-0" />}
            </button>

            {isExpanded && (
              <div className="border-t border-stone-800 px-4 py-4 space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Event ID">
                    <span className="font-mono text-xs">{c.event_id}</span>
                    {c.event_ids.length > 1 && <span className="text-stone-500 text-xs"> (aliases: {c.event_ids.filter((x) => x !== c.event_id).join(', ')})</span>}
                  </Field>
                  <Field label="Link">
                    {c.event_link && isSafeHttpUrl(c.event_link) ? (
                      <a href={c.event_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 break-all">
                        {c.event_link} <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (c.event_link || '--')}
                  </Field>
                  <Field label="Evidence">
                    {matchedIn ? matchedIn.replace('_', ' ') : '--'}
                    {c.verify_attempts > 0 && <span className="text-stone-500"> · {c.verify_attempts} verify attempts</span>}
                    {typeof c.evidence?.host_name === 'string' && <span className="text-stone-500"> · host {c.evidence.host_name as string}</span>}
                    {c.derived_from_claim_id && <span className="text-stone-500 block text-xs">from claim {c.derived_from_claim_id}</span>}
                  </Field>
                  <Field label="Code">
                    <span className="font-mono text-xs">{c.verification_code || '--'}</span>
                  </Field>
                </div>

                {c.claimant_note && (
                  <Field label="Claimant note">
                    <p className="whitespace-pre-wrap text-white">{c.claimant_note}</p>
                  </Field>
                )}

                <Field label="Luma hosts">
                  {c.hosts.length === 0 ? '--' : (
                    <ul className="space-y-0.5">
                      {c.hosts.map((h) => (
                        <li key={h.api_id} className="text-stone-300">
                          {h.name || h.username || h.api_id}
                          {h.twitter_handle && <span className="text-stone-500"> · @{h.twitter_handle}</span>}
                          <span className="text-stone-600 font-mono text-xs"> {h.api_id}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Field>

                {c.review_note && (
                  <Field label="Review note"><p className="text-stone-300">{c.review_note}</p></Field>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-800">
                  {c.status === 'pending' && (
                    <>
                      <ActionBtn onClick={() => runAction(c.id, 'approve')} disabled={isActioning} className="bg-green-600 hover:bg-green-700">
                        {isActioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                      </ActionBtn>
                      <ActionBtn onClick={() => setPendingAction({ id: c.id, action: 'reject' })} className="bg-red-600 hover:bg-red-700">
                        <X className="w-4 h-4" /> Reject
                      </ActionBtn>
                    </>
                  )}
                  {c.status === 'verified' && (
                    <ActionBtn onClick={() => setPendingAction({ id: c.id, action: 'revoke' })} className="bg-red-600 hover:bg-red-700">
                      <Ban className="w-4 h-4" /> Revoke
                    </ActionBtn>
                  )}
                  {(c.status === 'pending' || c.status === 'verified') && (
                    <ActionBtn onClick={() => setPendingAction({ id: c.id, action: 'relink' })} className="bg-stone-700 hover:bg-stone-600">
                      <Link2 className="w-4 h-4" /> Relink
                    </ActionBtn>
                  )}
                </div>

                {active && (
                  <div className="space-y-2">
                    {active === 'relink' && (
                      <input
                        type="text"
                        value={relinkId}
                        onChange={(e) => setRelinkId(e.target.value)}
                        placeholder="New event id (evt-…) in the same conference"
                        className={inputClass}
                      />
                    )}
                    <input
                      type="text"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      placeholder={active === 'reject' ? 'Reason (shown to the claimant, optional)' : 'Note (optional)'}
                      className={inputClass}
                      autoFocus
                    />
                    {active === 'revoke' && c.host_grant && !c.host_grant.revoked_at && (
                      <p className="text-xs text-orange-300">
                        This claim verified Luma host {c.host_grant.host_name || c.host_grant.host_api_id}. Revoking also removes that host-wide grant and every claim auto-verified through it.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <ActionBtn onClick={() => runAction(c.id, active)} disabled={isActioning || (active === 'relink' && !relinkId.trim())} className="bg-blue-600 hover:bg-blue-700">
                        {isActioning && <Loader2 className="w-4 h-4 animate-spin" />} Confirm {active}
                      </ActionBtn>
                      <ActionBtn onClick={() => { setPendingAction(null); setActionNote(''); setRelinkId(''); }} className="bg-stone-700 hover:bg-stone-600">
                        Cancel
                      </ActionBtn>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-stone-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-stone-200">{children}</div>
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  className,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${className}`}
    >
      {children}
    </button>
  );
}

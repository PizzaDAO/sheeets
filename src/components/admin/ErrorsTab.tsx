'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Check, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface AppError {
  id: string;
  fingerprint: string;
  source: 'client' | 'server';
  message: string;
  stack: string | null;
  url: string | null;
  route: string | null;
  user_agent: string | null;
  release: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
  resolved: boolean;
}

interface Props {
  password: string;
}

type StatusFilter = 'unresolved' | 'resolved' | 'all';
type SourceFilter = 'all' | 'client' | 'server';

const selectClass = 'bg-stone-800 border border-stone-600 rounded-lg px-3 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none cursor-pointer';
const btnSmall = 'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50';

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SOURCE_BADGE: Record<AppError['source'], string> = {
  client: 'bg-blue-500/20 text-blue-300',
  server: 'bg-purple-500/20 text-purple-300',
};

export default function ErrorsTab({ password }: Props) {
  const [errors, setErrors] = useState<AppError[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<StatusFilter>('unresolved');
  const [source, setSource] = useState<SourceFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ password, status, source });
      const res = await fetch(`/api/admin/errors?${params}`);
      const json = await res.json();
      setErrors(json.errors ?? []);
      setNote(json.note ?? json.error ?? '');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [password, status, source]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const setResolved = async (ids: string[], resolved: boolean) => {
    setActionId(ids.length === 1 ? ids[0] : 'bulk');
    try {
      const res = await fetch('/api/admin/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, ids, resolved }),
      });
      const json = await res.json();
      if (!json.success) alert(`Failed: ${json.error}`);
      await fetchErrors();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setActionId(null);
    }
  };

  const unresolvedIds = errors.filter((e) => !e.resolved).map((e) => e.id);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-base font-semibold mr-2">Errors</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectClass}>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value as SourceFilter)} className={selectClass}>
          <option value="all">All sources</option>
          <option value="client">Client</option>
          <option value="server">Server</option>
        </select>
        <button onClick={fetchErrors} disabled={loading} className={`${btnSmall} bg-stone-800 hover:bg-stone-700 text-stone-200`}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        {unresolvedIds.length > 1 && (
          <button
            onClick={() => setResolved(unresolvedIds, true)}
            disabled={actionId !== null}
            className={`${btnSmall} bg-green-700 hover:bg-green-600 text-white ml-auto`}
          >
            <Check className="w-3.5 h-3.5" /> Resolve all shown ({unresolvedIds.length})
          </button>
        )}
      </div>

      {note && <p className="text-xs text-amber-400 mb-3">{note}</p>}

      {loading && errors.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
        </div>
      ) : errors.length === 0 ? (
        <p className="text-sm text-stone-500 py-12 text-center">No errors.</p>
      ) : (
        <div className="space-y-2">
          {errors.map((err) => {
            const expanded = expandedId === err.id;
            return (
              <div key={err.id} className={`bg-stone-900 border border-stone-800 rounded-lg p-3 ${err.resolved ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-red-300 min-w-[3ch] text-right" title="Occurrences">
                    {err.count}×
                  </span>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setExpandedId(expanded ? null : err.id)}
                      className="text-left w-full text-sm text-white break-words cursor-pointer flex items-start gap-1"
                    >
                      <span className="flex-1">{err.message}</span>
                      {expanded ? <ChevronUp className="w-4 h-4 shrink-0 text-stone-500" /> : <ChevronDown className="w-4 h-4 shrink-0 text-stone-500" />}
                    </button>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-stone-500">
                      <span className={`px-1.5 py-0.5 rounded ${SOURCE_BADGE[err.source]}`}>{err.source}</span>
                      {err.route && <span className="font-mono truncate max-w-[24rem]">{err.route}</span>}
                      <span title={new Date(err.last_seen).toLocaleString()}>last {timeAgo(err.last_seen)}</span>
                      <span title={new Date(err.first_seen).toLocaleString()}>first {timeAgo(err.first_seen)}</span>
                      {err.release && <span className="font-mono">{err.release.slice(0, 7)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setResolved([err.id], !err.resolved)}
                    disabled={actionId !== null}
                    className={`${btnSmall} shrink-0 ${err.resolved ? 'bg-stone-800 hover:bg-stone-700 text-stone-200' : 'bg-green-700 hover:bg-green-600 text-white'}`}
                  >
                    {actionId === err.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : err.resolved ? (
                      <RotateCcw className="w-3.5 h-3.5" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    {err.resolved ? 'Reopen' : 'Resolve'}
                  </button>
                </div>
                {expanded && (
                  <div className="mt-3 space-y-2 text-xs">
                    {err.url && (
                      <p className="text-stone-400 break-all">
                        <span className="text-stone-500">URL:</span> {err.url}
                      </p>
                    )}
                    {err.user_agent && (
                      <p className="text-stone-400 break-all">
                        <span className="text-stone-500">UA:</span> {err.user_agent}
                      </p>
                    )}
                    {err.stack ? (
                      <pre className="bg-stone-950 border border-stone-800 rounded p-2 overflow-x-auto text-stone-300 whitespace-pre max-h-80">
                        {err.stack}
                      </pre>
                    ) : (
                      <p className="text-stone-500">No stack trace.</p>
                    )}
                    <p className="text-stone-600 font-mono">fp {err.fingerprint.slice(0, 12)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

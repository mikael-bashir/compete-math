import type { Notice, Prefs, DriverBlock } from '@/app/lib/leak-memory/notices-core';

// Client side of the intake notices: what became of the theorems this account put forward (a pull request opened, a check that failed, a change a reviewer
// asked for, a theorem the bar returned, a merge), the settings that decide what the driver hears, and the block the driver is handed. The logic and the
// SQL are in src/app/lib/leak-memory/notices-core.ts; the routes under /api/leak/notices.

export type { Notice, Prefs, DriverBlock };

export type NoticeApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(url: string, init?: RequestInit): Promise<NoticeApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: String(j?.error ?? res.statusText) };
    return { ok: true, data: j as T };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

export interface NoticeCounts {
  open: number;
  errors: number;
  warns: number;
  unseen: number;
}

export interface NoticesState {
  /** whether the intake is open to this account (the owner lists the accounts on the host) */
  allowed: boolean;
  notices: Notice[];
  counts: Record<string, NoticeCounts>;
  prefs: Prefs;
  codes: { code: string; title: string }[];
  kinds: Record<string, string>;
}

export const loadNotices = (target?: string, all = false) =>
  call<NoticesState>(`/api/leak/notices?${new URLSearchParams({ ...(target ? { target } : {}), ...(all ? { all: '1' } : {}) })}`);

export const actOnNotice = (id: string, action: 'ignore' | 'unignore' | 'seen') =>
  call<{ changed: number }>('/api/leak/notices', { method: 'PATCH', body: JSON.stringify({ id, action }) });

export const markAllSeen = (target?: string) => call<{ changed: number }>('/api/leak/notices', { method: 'PATCH', body: JSON.stringify({ action: 'seen-all', target }) });

export const savePrefs = (prefs: Partial<Prefs> | Record<string, unknown>) => call<{ prefs: Prefs }>('/api/leak/notices', { method: 'PUT', body: JSON.stringify({ prefs }) });

/** what the driver would read for this target, with the account's settings applied */
export const loadDriverBlock = (target: string) => call<DriverBlock>(`/api/leak/notices/driver?target=${encodeURIComponent(target)}`);

/** how often a long attempt is checked for new notices */
export const NOTICE_POLL_MS = 10 * 60_000;

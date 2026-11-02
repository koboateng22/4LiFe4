/**
 * Emergency incidents: the state machine, and the controller the SOS screen uses.
 *
 * 4Life has no connection to emergency services. There is deliberately no
 * "submitted to EMS" or "dispatched" state: nothing here can reach one.
 * Only a phone call to 112 or 193 reaches emergency services (see EMERGENCY.md).
 *
 * What each word means:
 *   submitting  this phone is sending the alert; the server hasn't answered
 *   unknown     the answer was lost (timeout, dropped connection): it may or may not
 *               be saved, so we ask the server before trying again
 *   failed      the server refused it: it was not saved
 *   initiated   the server saved the incident (no person has seen it yet)
 *   contact_notified  the person told us they sent a message from their own phone
 *   acknowledged      a counsellor pressed "I've seen this"
 *
 * Keep the statuses in step with supabase/migrations/…_emergency_incidents.sql.
 */
import { db, hasRemote, newId } from './supabase';
import type { Fix } from './ems';

export type IncidentStatus = 'initiated' | 'contact_notified' | 'acknowledged' | 'resolved' | 'cancelled' | 'expired';
export type LocationStatus = 'pending' | 'fresh' | 'manual' | 'denied' | 'timeout' | 'unavailable' | 'unsupported';
export type Channel = 'counsellor_in_app' | 'sms_handoff' | 'whatsapp_handoff' | 'contact_call_handoff' | 'emergency_call_handoff';
export type NotificationStatus = 'recorded' | 'opened' | 'reported_sent' | 'reported_not_sent' | 'acknowledged';
export type HandoffAction = 'opened' | 'reported_sent' | 'reported_not_sent';

export interface IncidentNotification {
  channel: Channel;
  recipient_key: string;
  recipient_name?: string | null;
  contact_id?: string | null;
  status: NotificationStatus;
  updated_at: string;
  acknowledged_at?: string | null;
}

export interface Incident {
  id: string;
  client_request_id: string;
  status: IncidentStatus;
  location_status: LocationStatus;
  location_at?: string | null;
  accuracy_m?: number | null;
  location_shared: boolean;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  notifications: IncidentNotification[];
}

export const OPEN_STATUSES: IncidentStatus[] = ['initiated', 'contact_notified', 'acknowledged'];
export const isOpen = (s: IncidentStatus) => OPEN_STATUSES.includes(s);

/** Allowed moves. Same table as the emergency_guard_status trigger in the database. */
export const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  initiated: ['contact_notified', 'acknowledged', 'resolved', 'cancelled', 'expired'],
  contact_notified: ['acknowledged', 'resolved', 'cancelled', 'expired'],
  acknowledged: ['resolved', 'cancelled', 'expired'],
  resolved: [],
  cancelled: [],
  expired: [],
};
export const canMove = (from: IncidentStatus, to: IncidentStatus) => TRANSITIONS[from].includes(to);

/* ---------- Location ---------- */

/** After this long a position is "from N minutes ago", not "where you are". */
export const FRESH_MS = 2 * 60_000;
export const isFreshFix = (f: Pick<Fix, 'at'> | null | undefined, now = Date.now()) => !!f && now - new Date(f.at).getTime() < FRESH_MS;

export type LocationProblem = 'denied' | 'timeout' | 'unavailable' | 'unsupported';

/** The browser's error codes in plain terms: 1 permission, 2 no position, 3 timeout. */
export function locationProblem(err: unknown): LocationProblem {
  if ((err as Error)?.message === 'unsupported') return 'unsupported';
  const code = (err as GeolocationPositionError)?.code;
  return code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable';
}

/* ---------- Talking to the server ---------- */

export type FailureKind = 'uncertain' | 'auth' | 'rate_limited' | 'rejected';

export class IncidentError extends Error {
  constructor(public kind: FailureKind, message: string = kind) {
    super(message);
  }
}

/**
 * Which errors leave us unsure. A timeout, a dropped connection or a 5xx may have
 * happened after the server saved the incident, so they never count as "not saved".
 */
export function classifyRpcError(status: number | undefined, error: { message?: string; code?: string } | null): FailureKind {
  const msg = error?.message || '';
  if (/emergency_rate_limited/.test(msg)) return 'rate_limited';
  if (status === 401 || error?.code === '42501' || error?.code === 'PGRST301' || error?.code === 'PGRST303' || /sign_in_required|JWT expired/i.test(msg)) return 'auth';
  if (!status || status >= 500) return 'uncertain';
  return 'rejected';
}

export interface LocationReport {
  status: Exclude<LocationStatus, 'pending'>;
  /** Coordinates are left out when the person hasn't agreed to share them */
  fix?: Omit<Fix, 'lat' | 'lng'> & { lat: number | null; lng: number | null };
  note?: string;
}

/** Where incidents are kept: the server, or this phone when there is no account. */
export interface IncidentBackend {
  mode: 'server' | 'device';
  open(requestId: string): Promise<Incident>;
  byRequest(requestId: string): Promise<Incident | null>;
  active(): Promise<Incident | null>;
  get(id: string): Promise<Incident | null>;
  attachLocation(id: string, report: LocationReport): Promise<Incident>;
  record(id: string, channel: Channel, recipient: string, action: HandoffAction): Promise<Incident>;
  close(id: string, outcome: 'resolved' | 'cancelled'): Promise<Incident>;
}

const RPC_TIMEOUT_MS = 10_000;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
  let res: { data: any; error: any; status?: number };
  try {
    res = await db().rpc(fn, args).abortSignal(AbortSignal.timeout(timeoutMs));
  } catch {
    throw new IncidentError('uncertain');
  }
  if (res.error) throw new IncidentError(classifyRpcError(res.status, res.error), res.error.message);
  return res.data as T;
}

export const serverBackend = (): IncidentBackend => ({
  mode: 'server',
  open: requestId => rpc('emergency_open_incident', { p_request_id: requestId }),
  byRequest: requestId => rpc('emergency_by_request', { p_request_id: requestId }),
  active: () => rpc('emergency_active'),
  get: id => rpc('emergency_get', { p_incident: id }),
  attachLocation: (id, r) =>
    rpc('emergency_attach_location', {
      p_incident: id,
      p_status: r.status,
      p_lat: r.fix?.lat ?? null,
      p_lng: r.fix?.lng ?? null,
      p_accuracy_m: r.fix ? Math.round(r.fix.accuracyM) : null,
      p_located_at: r.fix?.at ?? null,
      p_note: r.note ?? null,
    }),
  record: (id, channel, recipient, action) => rpc('emergency_record_action', { p_incident: id, p_channel: channel, p_recipient: recipient, p_action: action }),
  close: (id, outcome) => rpc('emergency_close', { p_incident: id, p_outcome: outcome }),
});

/** No account or no server: kept on this phone only, and no one else is told anything. */
export function deviceBackend(storageKey = '4life_incident_device_v1'): IncidentBackend {
  const read = (): Incident | null => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null');
    } catch {
      return null;
    }
  };
  const write = (i: Incident) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(i));
    } catch {
      /* storage blocked: the screen still works until it is closed */
    }
    return i;
  };
  const stamp = (i: Incident) => ({ ...i, updated_at: new Date().toISOString() });
  const need = (id: string) => {
    const i = read();
    if (!i || i.id !== id) throw new IncidentError('rejected', 'emergency_not_found');
    return i;
  };
  return {
    mode: 'device',
    async open(requestId) {
      const cur = read();
      if (cur && (cur.client_request_id === requestId || isOpen(cur.status))) return cur;
      const now = new Date().toISOString();
      return write({ id: newId(), client_request_id: requestId, status: 'initiated', location_status: 'pending', location_shared: false, created_at: now, updated_at: now, notifications: [] });
    },
    async byRequest(requestId) {
      const cur = read();
      return cur?.client_request_id === requestId ? cur : null;
    },
    async active() {
      const cur = read();
      return cur && isOpen(cur.status) && Date.now() - new Date(cur.created_at).getTime() < 24 * 3_600_000 ? cur : null;
    },
    async get(id) {
      const cur = read();
      return cur?.id === id ? cur : null;
    },
    async attachLocation(id, r) {
      const i = need(id);
      if (r.status !== 'fresh' && r.status !== 'manual' && (i.location_status === 'fresh' || i.location_status === 'manual')) return i;
      return write(stamp({ ...i, location_status: r.status, location_at: r.status === 'fresh' ? r.fix?.at : r.status === 'manual' ? new Date().toISOString() : null, accuracy_m: r.status === 'fresh' ? r.fix?.accuracyM : null }));
    },
    async record(id, channel, recipient, action) {
      const i = need(id);
      const now = new Date().toISOString();
      const others = i.notifications.filter(n => !(n.channel === channel && n.recipient_key === recipient));
      const prev = i.notifications.find(n => n.channel === channel && n.recipient_key === recipient);
      const status: NotificationStatus = prev?.status === 'reported_sent' && action === 'opened' ? 'reported_sent' : action;
      return write(stamp({
        ...i,
        status: action === 'reported_sent' && i.status === 'initiated' ? 'contact_notified' : i.status,
        notifications: [...others, { channel, recipient_key: recipient, status, updated_at: now }],
      }));
    },
    async close(id, outcome) {
      const i = need(id);
      if (!isOpen(i.status)) return i;
      const now = new Date().toISOString();
      return write({ ...i, status: outcome, closed_at: now, updated_at: now });
    },
  };
}

/* ---------- The controller ---------- */

export type Phase = 'idle' | 'submitting' | 'unknown' | 'offline' | 'active' | 'closed' | 'failed';
export type LocationState =
  | { state: 'idle' }
  | { state: 'finding' }
  | { state: 'found'; fix: Fix }
  | { state: 'manual'; note: string }
  | { state: 'problem'; problem: LocationProblem };

export interface IncidentView {
  phase: Phase;
  mode: 'server' | 'device';
  incident: Incident | null;
  /** too_old: we never got an answer, and it's too late to send it now */
  failure: Exclude<FailureKind, 'uncertain'> | 'too_old' | null;
  location: LocationState;
  /** Last time the server (or this phone's record) confirmed the status */
  checkedAt: string | null;
  /** The last check failed, so the status shown may be out of date */
  stale: boolean;
  /** Cancel or "I'm safe" didn't reach the server */
  closeFailed: boolean;
  /** A location or action is still waiting to reach the server */
  syncing: boolean;
}

export interface ControllerOptions {
  /** Waits between attempts while unsure. The last one repeats. */
  retryDelaysMs?: number[];
  pollMs?: number;
  /** An alert that hasn't reached the server by then is dropped rather than sent long after the moment has passed */
  pendingMaxAgeMs?: number;
  locate?: () => Promise<Fix>;
  isOnline?: () => boolean;
  shareLocation?: () => boolean;
  /** Runs once when an alert is first saved (device-mode counsellor demo) */
  onOpened?: (incident: Incident) => void;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now?: () => number;
}

const memoryStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

interface PendingRequest {
  id: string;
  at: number;
}

export class IncidentController {
  private view: IncidentView;
  private listeners = new Set<() => void>();
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private attempt = 0;
  private busy = false;
  private stopped = false;
  private flushing = false;
  private openedOnce = new Set<string>();
  /** Things still to tell the server, kept in order and retried (each one is safe to repeat). */
  private outbox: Array<(id: string) => Promise<Incident>> = [];
  private readonly opts: Required<Omit<ControllerOptions, 'onOpened'>> & Pick<ControllerOptions, 'onOpened'>;

  constructor(private backend: IncidentBackend, private userKey: string, opts: ControllerOptions = {}) {
    this.opts = {
      retryDelaysMs: [2000, 5000, 10000, 20000, 30000],
      pollMs: 15000,
      pendingMaxAgeMs: 30 * 60_000,
      locate: () => Promise.reject(new Error('unsupported')),
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
      shareLocation: () => false,
      storage: typeof localStorage === 'undefined' ? memoryStore() : localStorage,
      now: () => Date.now(),
      ...opts,
    };
    this.view = { phase: 'idle', mode: backend.mode, incident: null, failure: null, location: { state: 'idle' }, checkedAt: null, stale: false, closeFailed: false, syncing: false };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getView = () => this.view;

  private set(patch: Partial<IncidentView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach(l => l());
  }

  private get pendingKey() {
    return `4life_incident_pending_v1_${this.userKey}`;
  }
  private readPending(): PendingRequest | null {
    try {
      return JSON.parse(this.opts.storage.getItem(this.pendingKey) || 'null');
    } catch {
      return null;
    }
  }
  private writePending(p: PendingRequest | null) {
    try {
      if (p) this.opts.storage.setItem(this.pendingKey, JSON.stringify(p));
      else this.opts.storage.removeItem(this.pendingKey);
    } catch {
      /* storage blocked: a refresh can't resume, but the server still removes duplicates */
    }
  }

  /** On page load: pick up an alert in progress. Asks the server; nothing is assumed from this phone. */
  async resume() {
    const pending = this.readPending();
    if (pending) {
      this.set({ phase: 'unknown' });
      await this.reconcile();
      return;
    }
    try {
      const active = await this.backend.active();
      if (active) this.adopt(active);
    } catch {
      /* can't reach it now; pressing the button still works */
    }
  }

  /** The person pressed the button. Safe to press twice. */
  start() {
    if (this.view.phase === 'submitting' || this.view.phase === 'unknown' || this.view.phase === 'offline' || this.view.phase === 'active') return;
    this.writePending({ id: newId(), at: this.opts.now() });
    this.attempt = 0;
    this.outbox = [];
    this.set({ phase: 'submitting', incident: null, failure: null, stale: false, closeFailed: false, syncing: false, location: { state: 'idle' }, checkedAt: null });
    this.findLocation();
    void this.reconcile();
  }

  /** Send the pending request, or find out what happened to it. The same id is used every time, so retries can't duplicate. */
  private async reconcile() {
    if (this.busy || this.stopped) return;
    const pending = this.readPending();
    if (!pending) return;
    if (this.opts.now() - pending.at > this.opts.pendingMaxAgeMs) {
      // Tell the truth about a request we never got an answer for; don't raise an alarm hours later
      try {
        const late = await this.backend.byRequest(pending.id);
        if (late) return this.adopt(late);
      } catch {
        /* still no answer: said plainly below */
      }
      this.writePending(null);
      this.set({ phase: 'failed', failure: 'too_old' });
      return;
    }
    if (!this.opts.isOnline()) {
      this.set({ phase: 'offline' });
      return;
    }
    this.busy = true;
    try {
      // After a lost answer, ask first. A retry with the same id is safe either way.
      const found = this.attempt > 0 ? await this.backend.byRequest(pending.id) : null;
      this.adopt(found ?? (await this.backend.open(pending.id)));
    } catch (e) {
      const kind = e instanceof IncidentError ? e.kind : 'uncertain';
      if (kind === 'uncertain') {
        this.set({ phase: this.opts.isOnline() ? 'unknown' : 'offline' });
        this.scheduleRetry();
      } else {
        this.writePending(null);
        this.set({ phase: 'failed', failure: kind });
      }
    } finally {
      this.busy = false;
    }
  }

  private scheduleRetry() {
    clearTimeout(this.retryTimer);
    const d = this.opts.retryDelaysMs;
    const wait = d[Math.min(this.attempt, d.length - 1)];
    this.attempt++;
    this.retryTimer = setTimeout(() => void this.reconcile(), wait);
  }

  /** The connection came back. */
  online() {
    if (this.view.phase === 'offline' || this.view.phase === 'unknown') {
      clearTimeout(this.retryTimer);
      this.attempt = Math.max(this.attempt, 1);
      void this.reconcile();
    } else if (this.view.phase === 'active') {
      void this.refresh();
    }
  }

  private adopt(incident: Incident) {
    clearTimeout(this.retryTimer);
    this.writePending(null);
    const closed = !isOpen(incident.status);
    this.set({ phase: closed ? 'closed' : 'active', incident, failure: null, checkedAt: new Date(this.opts.now()).toISOString(), stale: false });
    if (closed) return this.stopPolling();
    if (!this.openedOnce.has(incident.id)) {
      this.openedOnce.add(incident.id);
      this.opts.onOpened?.(incident);
    }
    this.startPolling();
    // After a refresh this phone has lost its position, and the message needs one
    if (this.view.location.state === 'idle') return this.findLocation(), void this.flush();
    // A location found while the request was on its way
    const loc = this.view.location;
    if (loc.state === 'found') this.queueLocation({ status: 'fresh', fix: loc.fix });
    else if (loc.state === 'problem') this.queueLocation({ status: loc.problem });
    else if (loc.state === 'manual') this.queueLocation({ status: 'manual', note: loc.note });
    else void this.flush();
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.refresh(), this.opts.pollMs);
  }
  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  /** Ask for the true status (for example, has the counsellor seen it?). */
  async refresh() {
    const id = this.view.incident?.id;
    if (!id || this.view.phase !== 'active') return;
    await this.flush();
    try {
      const i = await this.backend.get(id);
      if (this.view.incident?.id !== id || this.view.phase !== 'active') return;
      if (i) this.applyIncident(i);
      else this.set({ stale: true });
    } catch {
      this.set({ stale: true });
    }
  }

  private applyIncident(i: Incident) {
    this.set({ incident: i, checkedAt: new Date(this.opts.now()).toISOString(), stale: false });
    if (!isOpen(i.status)) {
      this.set({ phase: 'closed' });
      this.stopPolling();
    }
  }

  private async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.outbox.length) {
        const id = this.view.incident?.id;
        if (!id || this.view.phase !== 'active') return;
        this.set({ syncing: true });
        try {
          const i = await this.outbox[0](id);
          this.outbox.shift();
          this.applyIncident(i);
        } catch (e) {
          const kind = e instanceof IncidentError ? e.kind : 'uncertain';
          // Refused for good: retrying won't help. Otherwise keep it for the next check.
          if (kind === 'uncertain' || kind === 'auth') {
            this.set({ stale: true });
            return;
          }
          this.outbox.shift();
        }
      }
      this.set({ syncing: false });
    } finally {
      this.flushing = false;
      if (!this.outbox.length && this.view.syncing) this.set({ syncing: false });
    }
  }

  private queueLocation(report: LocationReport) {
    // Consent is checked on the server as well; this keeps coordinates off the wire when it is off
    const safe: LocationReport = this.opts.shareLocation() ? report : { status: report.status, fix: report.fix && { ...report.fix, lat: null, lng: null } };
    this.outbox.push(id => this.backend.attachLocation(id, safe));
    void this.flush();
  }

  /** Try for the phone's position. Never holds up the alert or the call buttons. */
  findLocation() {
    const cur = this.view.location;
    if (cur.state === 'finding') return;
    this.set({ location: { state: 'finding' } });
    this.opts.locate().then(
      fix => {
        this.set({ location: { state: 'found', fix } });
        if (this.view.phase === 'active') this.queueLocation({ status: 'fresh', fix });
      },
      err => {
        const problem = locationProblem(err);
        this.set({ location: { state: 'problem', problem } });
        if (this.view.phase === 'active') this.queueLocation({ status: problem });
      }
    );
  }

  /** The person typed a landmark instead. */
  setManualLocation(note: string) {
    const clean = note.trim().slice(0, 120);
    if (!clean) return;
    this.set({ location: { state: 'manual', note: clean } });
    if (this.view.phase === 'active') this.queueLocation({ status: 'manual', note: clean });
  }

  /** Called as the phone's own app opens, or when the person says what happened. Works offline: it is sent later. */
  record(channel: Channel, recipient: string, action: HandoffAction) {
    // Show it straight away, marked as not yet confirmed by the server
    const i = this.view.incident;
    if (!i) return;
    const now = new Date(this.opts.now()).toISOString();
    const others = i.notifications.filter(n => !(n.channel === channel && n.recipient_key === recipient));
    const prev = i.notifications.find(n => n.channel === channel && n.recipient_key === recipient);
    const status: NotificationStatus = prev?.status === 'reported_sent' && action === 'opened' ? 'reported_sent' : action;
    this.set({ incident: { ...i, notifications: [...others, { channel, recipient_key: recipient, status, updated_at: now }] } });
    this.outbox.push(id => this.backend.record(id, channel, recipient, action));
    void this.flush();
  }

  async close(outcome: 'resolved' | 'cancelled') {
    const id = this.view.incident?.id;
    if (!id) return;
    this.set({ closeFailed: false });
    await this.flush();
    try {
      const i = await this.backend.close(id, outcome);
      this.applyIncident(i);
    } catch {
      this.set({ closeFailed: true, stale: true });
    }
  }

  /** Back to the start after a closed or failed alert. */
  reset() {
    if (this.view.phase !== 'closed' && this.view.phase !== 'failed') return;
    this.set({ phase: 'idle', incident: null, failure: null, location: { state: 'idle' }, checkedAt: null, stale: false, closeFailed: false });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.stopPolling();
  }
}

const isUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** The right place to keep incidents for this person. */
export function backendFor(userId?: string, isGuest?: boolean): IncidentBackend {
  return hasRemote() && isUuid(userId) && !isGuest ? serverBackend() : deviceBackend();
}

/** A counsellor can only answer a location request while the person's own alert is open. */
export async function hasOpenAlert(): Promise<boolean> {
  try {
    return !!(await serverBackend().active());
  } catch {
    return false;
  }
}

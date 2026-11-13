/**
 * The admin dashboard's calls. Every one is a database function that checks public.is_admin() itself
 * (supabase/migrations/20261113000012_admin.sql), so nothing here relies on the app's own role check:
 * a non-admin who calls these gets "Admins only" from the database.
 */
import { db, supabase } from '../supabase';

const call = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw error;
  return data as T;
};

/** Who is signed in, and are they an admin (a hint for the interface only; the database decides) */
export async function adminSession(): Promise<{ signedIn: boolean; isAdmin: boolean; nickname?: string }> {
  if (!supabase) return { signedIn: false, isAdmin: false };
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return { signedIn: false, isAdmin: false };
  const { data: row } = await db().from('profiles').select('role,nickname').eq('id', uid).maybeSingle();
  return { signedIn: true, isAdmin: row?.role === 'admin', nickname: row?.nickname };
}

export interface Overview {
  generated_at: string;
  users: { total: number; clients: number; therapists: number; admins: number; new_7d: number; new_30d: number; deletion_requested: number; suspended: number; active_30d: number };
  therapists: { verified: number; pending: number; rejected: number; accepting: number };
  sessions: { total: number; upcoming: number; overdue: number; completed: number; cancelled: number; no_show: number };
  requests: { pending: number; accepted: number; declined: number; withdrawn: number; pending_over_48h: number };
  village: { posts_7d: number; replies_7d: number; posts_total: number; hidden: number; open_reports: number };
  sos: { active: number; last_30d: number; acknowledged_30d: number; resolved_30d: number; cancelled_30d: number; expired_30d: number };
  series: { days: string[]; signups: number[]; sessions: number[]; posts: number[]; sos: number[] };
  recent_actions: ActionRow[];
}
export interface UserRow {
  id: string; nickname: string; display_name: string; role: 'client' | 'therapist' | 'admin'; created_at: string; deletion_requested_at: string | null;
  email: string | null; last_sign_in_at: string | null; suspension_reason: string | null; suspended_at: string | null; verification: string | null;
}
export interface UserDetail {
  id: string; nickname: string; display_name: string; role: string; age: number | null; region: string | null; language: string; created_at: string;
  deletion_requested_at: string | null; email: string | null; last_sign_in_at: string | null;
  suspension: { suspended_at: string; suspended_by: string; reason: string } | null;
  activity: Record<string, number | string | null>;
  history: Array<{ at: string; action: string; reason: string | null; admin: string | null }>;
}
export interface TherapistRow {
  id: string; title: string; full_name: string; nickname: string; email: string | null; profession: string; years_experience: number; verification: 'pending' | 'verified' | 'rejected';
  verified_at: string | null; specialties: string[]; approaches: string[]; languages: string[]; formats: string[]; region: string | null; practice_location: string | null;
  fee_ghs: number; accepting_clients: boolean; bio: string; created_at: string; suspended: boolean;
  licence: { license_body: string; license_number: string; agreed_confidentiality_at: string; agreed_crisis_protocol_at: string; agreed_accuracy_at: string; reviewed_at: string | null; review_note: string | null; reviewer: string | null } | null;
  services: Array<{ name: string; duration_min: number; fee_ghs: number; formats: string[]; active: boolean }>;
  active_clients: number; upcoming_sessions: number; completed_sessions: number; pending_requests: number;
}
export interface Appointments {
  sessions: Array<{ id: string; starts_at: string; duration_min: number; status: string; format: string; type: string; created_at: string; therapist: string; therapist_id: string; client: string; service: string | null }>;
  requests: Array<{ id: string; created_at: string; status: string; preferred_time: string; format: string; responded_at: string | null; decline_reason: string | null; therapist: string; client: string; service: string | null; waiting_long: boolean }>;
  conflicts: Array<{ therapist: string; a: string; a_start: string; b: string; b_start: string }>;
  overdue: number;
}
export interface ReportItem {
  target_type: 'post' | 'reply' | 'circle_message'; target_id: string; reports: number; open: boolean; reasons: string[]; notes: string[];
  first_at: string; last_at: string; resolved_at: string | null; title: string | null; body: string | null; author: string | null; author_id: string | null;
  hidden: boolean | null; posted_at: string | null; removed: boolean; author_suspended: boolean;
}
export interface SosRow {
  id: string; ref: string; created_at: string; status: string; location_status: string; location_shared: boolean; closed_at: string | null; active: boolean;
  counsellor_notified: boolean; acknowledged_at: string | null; contact_handoffs: number; reported_sent: number; emergency_call_opened: boolean;
}
export interface SosDetail {
  id: string; created_at: string; status: string; client: string; client_id: string; location_status: string; location_shared: boolean; closed_at: string | null;
  counsellors: Array<{ therapist: string; status: string; acknowledged_at: string | null }>;
  handoffs: Array<{ channel: string; status: string; at: string }>;
  timeline: Array<{ at: string; kind: string; from: string | null; to: string | null }>;
}
export interface Content {
  circles: Array<{ id: string; title: string; topic: string; host_name: string; host_role: string; description: string; weekday: number; start_time: string; duration_min: number; active: boolean; rsvps: number }>;
  hotlines: Array<{ id: string; label: string; number: string; description: string; verified_at: string | null; source: string | null }>;
  centres: Array<{ id: string; name: string; type: string; region: string; phone: string; verified_at: string | null }>;
}
export interface SystemStatus {
  cron_available: boolean;
  jobs: Array<{ name: string; schedule: string; active: boolean; command: string }>;
  cleanups: Array<{ name: string; function: string; scheduled: boolean }>;
  migrations: Array<{ name: string; present: boolean }>;
  unverified_hotlines: number; unverified_centres: number; database_time: string;
}
export interface ActionRow { id?: number; at: string; action: string; target_type: string | null; target_id: string | null; reason: string | null; details?: Record<string, unknown>; admin: string | null; target_name?: string | null }

export const adminApi = {
  overview: () => call<Overview>('admin_overview'),
  users: (q: { query?: string; role?: string; status?: string; limit?: number; offset?: number }) =>
    call<{ total: number; rows: UserRow[] }>('admin_list_users', { p_query: q.query || null, p_role: q.role || null, p_status: q.status || null, p_limit: q.limit ?? 50, p_offset: q.offset ?? 0 }),
  user: (id: string) => call<UserDetail>('admin_user_detail', { p_user: id }),
  setSuspension: (id: string, suspend: boolean, reason: string) => call<void>('admin_set_suspension', { p_user: id, p_suspend: suspend, p_reason: reason }),
  setAdmin: (id: string, admin: boolean, reason: string) => call<void>('admin_set_admin', { p_user: id, p_admin: admin, p_reason: reason }),
  therapists: (status?: string, query?: string) => call<TherapistRow[]>('admin_list_therapists', { p_status: status || null, p_query: query || null }),
  reviewTherapist: (id: string, verified: boolean, note: string) => call<void>('review_therapist', { p_therapist: id, p_verified: verified, p_note: note || null }),
  appointments: (status?: string, days = 30) => call<Appointments>('admin_appointments', { p_status: status || null, p_days: days }),
  reports: (state: 'open' | 'resolved' | 'all') => call<ReportItem[]>('admin_reports', { p_state: state }),
  moderate: (type: string, id: string, action: 'keep' | 'hide' | 'delete', reason: string) => call<void>('admin_moderate', { p_type: type, p_id: id, p_action: action, p_reason: reason || null }),
  sos: (days = 30) => call<SosRow[]>('admin_sos', { p_days: days }),
  sosDetail: (id: string, reason: string) => call<SosDetail>('admin_sos_detail', { p_id: id, p_reason: reason }),
  content: () => call<Content>('admin_content'),
  setCircle: (id: string, active: boolean, reason: string) => call<void>('admin_set_circle_active', { p_id: id, p_active: active, p_reason: reason || null }),
  verifyContact: (kind: 'hotline' | 'centre', id: string, verified: boolean, source: string) => call<void>('admin_verify_contact', { p_kind: kind, p_id: id, p_verified: verified, p_source: source || null }),
  system: () => call<SystemStatus>('admin_system'),
  actions: (q: { limit?: number; offset?: number; action?: string; target?: string } = {}) =>
    call<{ total: number; rows: ActionRow[] }>('admin_list_actions', { p_limit: q.limit ?? 100, p_offset: q.offset ?? 0, p_action: q.action || null, p_target: q.target || null }),
};

/** My own suspension, if any (for the notice in the app; the database enforces it either way) */
export async function mySuspension(): Promise<{ reason: string; suspended_at: string } | null> {
  if (!supabase) return null;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return null;
  const { data, error } = await db().from('account_suspensions').select('reason,suspended_at').eq('user_id', s.session.user.id).maybeSingle();
  if (error) return null; // the table may not exist until migration 0012 is applied
  return data;
}

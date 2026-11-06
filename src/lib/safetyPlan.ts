/**
 * My safety plan — a short, personal plan for hard moments, based on the
 * widely used safety-planning approach in crisis care:
 * warning signs → things I can do on my own → safe places →
 * people I can call → reasons to keep going → professional help.
 *
 * With Supabase it is saved to `safety_plans`, where the person's linked
 * counsellor can see it and help improve it. Otherwise it stays on this phone.
 */
import type { UserProfile } from '../types';
import { db, hasRemote } from './supabase';
import { msg } from '../i18n';

export interface MySafetyPlan {
  warningSigns: string;
  copingSteps: string;
  safePlaces: string;
  supportPeople: string;
  reasons: string;
  updatedAt?: string;
}

export const EMPTY_PLAN: MySafetyPlan = { warningSigns: '', copingSteps: '', safePlaces: '', supportPeople: '', reasons: '' };

export const PLAN_LIMITS: Record<keyof Omit<MySafetyPlan, 'updatedAt'>, number> = {
  warningSigns: 1500,
  copingSteps: 1500,
  safePlaces: 600,
  supportPeople: 600,
  reasons: 1000,
};

/** Gentle examples people can tap to add */
export const PLAN_IDEAS: Record<keyof Omit<MySafetyPlan, 'updatedAt'>, string[]> = {
  warningSigns: [msg('Feeling lonely at night'), msg('After an argument at home'), msg('Passing the drinking spot'), msg('When money comes in'), msg('Not sleeping'), msg('Hiding things from people')],
  copingSteps: [msg('Slow breathing for 2 minutes'), msg('Go for a walk'), msg('Take a cold shower'), msg('Music or a game'), msg('Write a thought record'), msg('Pray or sit quietly')],
  safePlaces: [msg('The library'), msg('A friend’s home'), msg('Church or mosque'), msg('The gym or pitch'), msg('Family home')],
  supportPeople: [],
  reasons: [msg('My family'), msg('My studies and future'), msg('My faith'), msg('Feeling clear in the morning'), msg('People who believe in me')],
};

const isUuid = (id?: string) => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const remote = (p: UserProfile) => hasRemote() && isUuid(p.id);
const key = (p: UserProfile) => `4life_safety_plan_v1_${p.id || 'guest'}`;

export const planIsEmpty = (p: MySafetyPlan) => !p.warningSigns.trim() && !p.copingSteps.trim() && !p.safePlaces.trim() && !p.supportPeople.trim() && !p.reasons.trim();

export async function loadSafetyPlan(profile: UserProfile): Promise<MySafetyPlan> {
  if (remote(profile)) {
    const { data, error } = await db().from('safety_plans').select('*').eq('client_id', profile.id).maybeSingle();
    if (error) throw error;
    if (!data) return { ...EMPTY_PLAN };
    return {
      warningSigns: data.warning_signs || '',
      copingSteps: data.coping_steps || '',
      safePlaces: data.safe_places || '',
      supportPeople: data.support_people || '',
      reasons: data.reasons || '',
      updatedAt: data.updated_at,
    };
  }
  try {
    const raw = localStorage.getItem(key(profile));
    if (raw) return { ...EMPTY_PLAN, ...JSON.parse(raw) };
  } catch {
    /* fall through */
  }
  return { ...EMPTY_PLAN };
}

export async function saveSafetyPlan(profile: UserProfile, plan: MySafetyPlan): Promise<MySafetyPlan> {
  const clean = Object.fromEntries(
    (Object.keys(PLAN_LIMITS) as Array<keyof typeof PLAN_LIMITS>).map(k => [k, (plan[k] || '').trim().slice(0, PLAN_LIMITS[k])])
  ) as Omit<MySafetyPlan, 'updatedAt'>;
  const saved: MySafetyPlan = { ...clean, updatedAt: new Date().toISOString() };
  if (remote(profile)) {
    const { error } = await db()
      .from('safety_plans')
      .upsert({
        client_id: profile.id,
        warning_signs: clean.warningSigns,
        coping_steps: clean.copingSteps,
        safe_places: clean.safePlaces,
        support_people: clean.supportPeople,
        reasons: clean.reasons,
        updated_by: profile.id,
      });
    if (error) throw error;
    return saved;
  }
  try {
    localStorage.setItem(key(profile), JSON.stringify(saved));
  } catch {
    /* storage blocked */
  }
  return saved;
}

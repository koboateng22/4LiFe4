import type { ThoughtRecord } from '../lib/cbt';
/**
 * Types for the therapist side of 4Life.
 * A therapist signs up, is verified, sets availability, accepts session requests
 * from people in recovery, runs sessions and writes session notes.
 */

export type Profession =
  | 'Clinical psychologist'
  | 'Counselling psychologist'
  | 'Psychiatrist'
  | 'Addiction counsellor'
  | 'Mental health nurse'
  | 'Social worker';

export type SessionFormat = 'video' | 'voice' | 'in_person' | 'chat';
export type ClientRisk = 'low' | 'moderate' | 'high';
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface TherapistProfile {
  id: string;
  email: string;
  pin: string;
  title: string; // Dr., Mr., Ms., Mrs. or empty
  name: string;
  profession: Profession;
  licenseBody: string;
  licenseNumber: string;
  yearsExperience: number;
  /** The app cannot check a licence by itself, so new accounts start as "pending". */
  verification: 'pending' | 'verified';
  specialties: string[]; // focus areas, e.g. 'substance'
  approaches: string[]; // e.g. 'CBT'
  languages: string[]; // e.g. 'English', 'Twi'
  formats: SessionFormat[];
  region: string;
  practiceLocation: string;
  days: Weekday[];
  startTime: string; // '09:00'
  endTime: string; // '17:00'
  sessionLength: number; // minutes
  /** A daily break, e.g. '13:00'–'14:00' (both or neither) */
  breakStart?: string | null;
  breakEnd?: string | null;
  feeGHS: number;
  slidingScale: boolean;
  acceptingClients: boolean;
  bio: string;
  createdAt: string;
}

export interface HomeworkItem {
  id: string;
  text: string;
  done: boolean;
  setOn: string; // ISO date
}

export interface SafetyPlan {
  warningSigns: string;
  copingSteps: string;
  supportPeople: string;
  updatedAt?: string;
}

/** A location the client shared — only in an emergency, and only if they agreed. */
export interface ClientLocation {
  lat: number;
  lng: number;
  area: string;
  at: string; // ISO
  accuracyM: number;
  source: 'sos' | 'checkin' | 'requested';
  approximate?: boolean;
}

/** One step taken while a client is at high risk (kept as a record). */
export interface EscalationEntry {
  id: string;
  at: string; // ISO
  action: string;
  note?: string;
}

export interface ClientRecord {
  id: string;
  nickname: string;
  age?: number;
  focus: string; // TriageCategory value
  streakDays: number;
  risk: ClientRisk;
  /** Last 14 daily check-ins, oldest first. Mood 1–5, craving 0–10. null = no check-in that day. */
  mood: Array<number | null>;
  craving: Array<number | null>;
  lastCheckin: string; // ISO
  goals: string[];
  homework: HomeworkItem[];
  safetyPlan: SafetyPlan;
  /** What the client agreed to share with their therapist. */
  sharesCheckins: boolean;
  status: 'active' | 'paused' | 'discharged';
  startedAt: string; // ISO date
  privateNote?: string;
  /** The client agreed to share their location with you when they are in crisis. */
  locationConsent: boolean;
  lastLocation?: ClientLocation;
  escalations?: EscalationEntry[];
  /** CBT thought records the client chose to share */
  thoughtRecords?: ThoughtRecord[];
}

export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type SessionType = 'intake' | 'follow_up' | 'crisis' | 'review';

/** Session notes use the DAP format: Data, Assessment, Plan. */
export interface SessionNote {
  data: string;
  assessment: string;
  plan: string;
  moodRating: number; // 1–5 as observed in session
  riskLevel: ClientRisk;
  homework?: string;
  agendaDone: string[];
  signedAt?: string; // set when the note is finished
}

/** Something a therapist offers clients: a kind of session with its length, fee and formats. */
export interface TherapyService {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  feeGHS: number;
  formats: SessionFormat[];
  /** Shown to clients when booking */
  active: boolean;
}

/** Days with no bookings (holidays, training), from and to inclusive, as YYYY-MM-DD */
export interface TimeOffEntry {
  id: string;
  startsOn: string;
  endsOn: string;
  note: string;
}

export interface TherapySession {
  id: string;
  /** The service booked, when there is one */
  serviceId?: string;
  clientId: string;
  start: string; // ISO
  durationMin: number;
  format: SessionFormat;
  type: SessionType;
  status: SessionStatus;
  topic?: string;
  /** When the therapist pressed Start */
  startedAt?: string;
  note?: SessionNote;
}

export interface SessionRequest {
  id: string;
  therapistId: string;
  clientNickname: string;
  focus: string;
  preferredTime: string; // ISO
  preferredLabel: string;
  format: SessionFormat;
  message: string;
  sharesCheckins: boolean;
  createdAt: string; // ISO
  status: 'new' | 'accepted' | 'declined';
  /** The service asked for, if the counsellor offers services */
  serviceId?: string;
  /** Its name and length, kept with the request on this device (Supabase mode looks it up) */
  serviceName?: string;
  serviceMin?: number;
  /** Optional snapshot of the client's recent check-ins, only when they agreed to share. */
  snapshot?: { streakDays: number; mood: Array<number | null>; craving: Array<number | null> };
}

export interface TherapistData {
  clients: ClientRecord[];
  sessions: TherapySession[];
  requests: SessionRequest[];
  /** Ids of shared requests this therapist has already handled */
  handledShared: string[];
  /** Ids of SOS events from the client app already added to records */
  handledSos?: string[];
  services?: TherapyService[];
  timeOff?: TimeOffEntry[];
}

/** Sent from the client app when someone presses SOS (stored on this device in the prototype). */
export interface SosEvent {
  id: string;
  nickname: string;
  at: string;
  location?: ClientLocation;
}

export type TherapistTab = 'today' | 'safety' | 'sessions' | 'clients' | 'requests' | 'availability' | 'services' | 'resources' | 'profile';

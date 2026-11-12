import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientLocation, ClientRecord, SessionNote, SessionRequest, TherapistData, TherapistProfile, TherapyService, TherapySession, TimeOffEntry } from './types';
import { clash } from '../lib/schedule';
import { getSharedRequests, getSosEvents, loadTherapistData, saveTherapistData } from './data';
import { friendlyError, isRemote, newId } from '../lib/supabase';
import * as api from '../lib/db/therapistApi';

const EMPTY: TherapistData = { clients: [], sessions: [], requests: [], handledShared: [] };

/**
 * One place for the therapist's caseload, sessions and requests.
 *
 * Device mode: everything lives in this browser (the original prototype).
 * Supabase mode: changes show straight away on screen, are written to the
 * database, and the caseload reloads whenever something changes elsewhere
 * (a new request, an SOS, a check-in…).
 */
export function useTherapistStore(therapist: TherapistProfile) {
  const [data, setData] = useState<TherapistData>(() => (isRemote ? EMPTY : loadTherapistData(therapist)));
  const [loading, setLoading] = useState(isRemote);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [sharedTick, setSharedTick] = useState(0);
  const mounted = useRef(true);

  /* ---------- Loading and saving ---------- */

  const reload = useCallback(async () => {
    if (!isRemote) return;
    try {
      const fresh = await api.loadTherapistData(therapist.id);
      if (mounted.current) {
        setData(fresh);
        setSyncError(null);
      }
    } catch (e) {
      if (mounted.current) setSyncError(friendlyError(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [therapist.id]);

  useEffect(() => {
    mounted.current = true;
    if (!isRemote) return;
    reload();
    const stop = api.subscribeToCaseload(therapist.id, reload);
    return () => {
      mounted.current = false;
      stop();
    };
  }, [therapist.id, reload]);

  // Device mode: save after every change
  useEffect(() => {
    if (!isRemote) saveTherapistData(therapist, data);
  }, [therapist, data]);

  /** Run a database write; on failure show the error and reload the true state. */
  const remote = useCallback(
    (job: () => Promise<unknown>, thenReload = false) => {
      if (!isRemote) return;
      job()
        .then(() => thenReload && reload())
        .catch(e => {
          setSyncError(friendlyError(e));
          reload();
        });
    },
    [reload]
  );

  /* ---------- Device mode: SOS and bookings from the client app on this device ---------- */

  const applySosEvents = useCallback(() => {
    if (isRemote) return;
    setData(d => {
      const handled = d.handledSos || [];
      const fresh = getSosEvents().filter(e => !handled.includes(e.id));
      if (!fresh.length) return d;
      let clients = d.clients;
      fresh.forEach(ev => {
        clients = clients.map(c => {
          if (c.nickname !== ev.nickname) return c;
          const log = [
            ...(c.escalations || []),
            { id: 'e_' + ev.id, at: ev.at, action: ev.location && c.locationConsent ? 'Pressed SOS in the app and shared location' : 'Pressed SOS in the app (location not shared)' },
          ];
          return { ...c, risk: 'high' as const, lastLocation: ev.location && c.locationConsent ? ev.location : c.lastLocation, escalations: log };
        });
      });
      return { ...d, clients, handledSos: [...handled, ...fresh.map(e => e.id)] };
    });
  }, []);

  useEffect(() => {
    if (isRemote) return;
    applySosEvents();
    const onStorage = (e: StorageEvent) => {
      if (e.key === '4life_session_requests') setSharedTick(t => t + 1);
      if (e.key === '4life_sos_events') applySosEvents();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [applySosEvents]);

  const requests: SessionRequest[] = useMemo(() => {
    if (isRemote) return data.requests;
    const shared = getSharedRequests(therapist.id).filter(r => !data.handledShared.includes(r.id));
    return [...shared, ...data.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.requests, data.handledShared, therapist.id, sharedTick]);

  /* ---------- Changes ---------- */

  const updateClient = useCallback(
    (id: string, patch: Partial<ClientRecord>) => {
      setData(d => ({ ...d, clients: d.clients.map(c => (c.id === id ? { ...c, ...patch } : c)) }));
      remote(() => api.updateClientRecord(therapist.id, id, patch));
    },
    [remote, therapist.id]
  );

  const addSession = useCallback(
    (s: TherapySession) => {
      setData(d => ({ ...d, sessions: [...d.sessions, s] }));
      remote(() => api.addSession(therapist.id, s));
    },
    [remote, therapist.id]
  );

  const updateSession = useCallback(
    (id: string, patch: Partial<TherapySession>) => {
      setData(d => ({ ...d, sessions: d.sessions.map(s => (s.id === id ? { ...s, ...patch } : s)) }));
      remote(() => api.updateSession(id, patch));
    },
    [remote]
  );

  /**
   * Move a session to another time (and length). Checked here against the other booked sessions so
   * the therapist hears straight away; the database checks again for everyone (no double-booking).
   * Returns an error message, or null when it was moved.
   */
  const moveSession = useCallback(
    (id: string, start: string, durationMin: number): string | null => {
      const busy = data.sessions.filter(s => s.id !== id && (s.status === 'scheduled' || s.status === 'in_progress'));
      if (clash(start, durationMin, busy)) return friendlyError(new Error('This time overlaps another session'));
      updateSession(id, { start, durationMin });
      return null;
    },
    [data.sessions, updateSession]
  );

  /* ---------- Services and days off ---------- */

  const saveService = useCallback(
    (svc: TherapyService) => {
      setData(d => {
        const list = d.services || [];
        return { ...d, services: list.some(x => x.id === svc.id) ? list.map(x => (x.id === svc.id ? svc : x)) : [...list, svc] };
      });
      remote(() => api.saveService(therapist.id, svc));
    },
    [remote, therapist.id]
  );

  const deleteService = useCallback(
    (id: string) => {
      setData(d => ({ ...d, services: (d.services || []).filter(x => x.id !== id) }));
      remote(() => api.deleteService(id));
    },
    [remote]
  );

  const addTimeOff = useCallback(
    (o: TimeOffEntry) => {
      setData(d => ({ ...d, timeOff: [...(d.timeOff || []), o].sort((a, b) => a.startsOn.localeCompare(b.startsOn)) }));
      remote(() => api.addTimeOff(therapist.id, o));
    },
    [remote, therapist.id]
  );

  const removeTimeOff = useCallback(
    (id: string) => {
      setData(d => ({ ...d, timeOff: (d.timeOff || []).filter(x => x.id !== id) }));
      remote(() => api.removeTimeOff(id));
    },
    [remote]
  );

  /** Add a step to the client's escalation record. */
  const logEscalation = useCallback(
    (clientId: string, action: string, note?: string) => {
      setData(d => ({
        ...d,
        clients: d.clients.map(c =>
          c.id === clientId ? { ...c, escalations: [...(c.escalations || []), { id: newId(), at: new Date().toISOString(), action, note }] } : c
        ),
      }));
      remote(() => api.logEscalation(therapist.id, clientId, action, note));
    },
    [remote, therapist.id]
  );

  const setLocation = useCallback((clientId: string, loc: ClientLocation) => {
    setData(d => ({ ...d, clients: d.clients.map(c => (c.id === clientId ? { ...c, lastLocation: loc } : c)) }));
  }, []);

  /**
   * Ask the client's phone for a fresh location.
   * Supabase mode: the client's app answers (if they agreed) and the map updates by itself.
   * Device mode: simulated so the prototype can be tried.
   */
  const requestLocation = useCallback(
    (client: ClientRecord, onDone?: () => void) => {
      logEscalation(client.id, 'Asked the client’s app for an updated location');
      if (isRemote) {
        remote(() => api.requestLocation(client.id));
        setTimeout(() => onDone?.(), 1500);
        return;
      }
      const prev = client.lastLocation;
      setTimeout(() => {
        if (prev) {
          setLocation(client.id, {
            ...prev,
            lat: prev.lat + (Math.random() - 0.5) * 0.002,
            lng: prev.lng + (Math.random() - 0.5) * 0.002,
            at: new Date().toISOString(),
            accuracyM: 20,
            source: 'requested',
          });
          logEscalation(client.id, 'Received updated location');
        }
        onDone?.();
      }, 1500);
    },
    [logEscalation, remote, setLocation]
  );

  /** Sign a session note: closes the session, updates risk and homework, books the next session. */
  const signNote = useCallback(
    (session: TherapySession, client: ClientRecord, note: SessionNote, nextStart: string | null, topic?: string) => {
      const signed = { ...note, signedAt: new Date().toISOString() };
      const homework = note.homework?.trim()
        ? [...client.homework, { id: newId(), text: note.homework.trim(), done: false, setOn: new Date().toISOString() }]
        : client.homework;
      const hasNext = data.sessions.some(s => s.clientId === client.id && s.status === 'scheduled' && s.start > session.start && s.id !== session.id);

      setData(d => ({
        ...d,
        sessions: [
          ...d.sessions.map(s => (s.id === session.id ? { ...s, status: 'completed' as const, note: signed, topic: topic || s.topic } : s)),
          ...(nextStart && !hasNext
            ? [{ id: newId(), clientId: client.id, start: nextStart, durationMin: therapist.sessionLength, format: session.format, type: 'follow_up' as const, status: 'scheduled' as const }]
            : []),
        ],
        clients: d.clients.map(c => (c.id === client.id ? { ...c, risk: note.riskLevel, homework } : c)),
      }));

      // One transaction in the database; reload afterwards so ids match
      remote(async () => {
        if (topic !== undefined) await api.updateSession(session.id, { topic });
        await api.signSessionNote(session.id, note, hasNext ? null : nextStart);
      }, true);
    },
    [data.sessions, remote, therapist.sessionLength]
  );

  const resolveRequest = useCallback(
    (req: SessionRequest, status: 'accepted' | 'declined', time?: string, reason?: string) => {
      if (isRemote) {
        // The database links the client and books the first session in one step
        setData(d => ({ ...d, requests: d.requests.map(r => (r.id === req.id ? { ...r, status } : r)) }));
        remote(() => (status === 'accepted' ? api.acceptRequest(req.id, time || req.preferredTime) : api.declineRequest(req.id, reason)), true);
        return;
      }
      // Device mode keeps the same rule as the database: no two sessions at once
      const length = req.serviceMin || data.services?.find(x => x.id === req.serviceId)?.durationMin || therapist.sessionLength;
      if (status === 'accepted') {
        const busy = data.sessions.filter(s => s.status === 'scheduled' || s.status === 'in_progress');
        if (clash(time || req.preferredTime, length, busy)) {
          setSyncError(friendlyError(new Error('This time overlaps another session')));
          return;
        }
      }
      setData(d => {
        const isShared = !d.requests.some(r => r.id === req.id);
        const requestsNext = isShared ? [...d.requests, { ...req, status }] : d.requests.map(r => (r.id === req.id ? { ...r, status } : r));
        const handledShared = isShared ? [...d.handledShared, req.id] : d.handledShared;
        if (status === 'declined') return { ...d, requests: requestsNext, handledShared };

        // Accepted: add the person to the caseload and book a first session
        const existing = d.clients.find(c => c.nickname === req.clientNickname);
        const clientId = existing?.id || newId();
        const snap = req.sharesCheckins ? req.snapshot : undefined;
        const pad14 = (arr?: Array<number | null>) => [...new Array(Math.max(0, 14 - (arr?.length || 0))).fill(null), ...(arr || [])].slice(-14);
        const client: ClientRecord = existing || {
          id: clientId,
          nickname: req.clientNickname,
          focus: req.focus,
          streakDays: snap?.streakDays ?? 0,
          risk: 'low',
          mood: pad14(snap?.mood),
          craving: pad14(snap?.craving),
          lastCheckin: req.createdAt,
          goals: [],
          homework: [],
          safetyPlan: { warningSigns: '', copingSteps: '', supportPeople: '' },
          sharesCheckins: req.sharesCheckins,
          locationConsent: false,
          status: 'active',
          startedAt: new Date().toISOString(),
        };
        const session: TherapySession = {
          id: newId(),
          clientId,
          start: time || req.preferredTime,
          durationMin: length,
          serviceId: req.serviceId,
          format: req.format,
          type: existing ? 'follow_up' : 'intake',
          status: 'scheduled',
          topic: existing ? undefined : 'Getting to know each other',
        };
        return {
          ...d,
          clients: existing ? d.clients : [...d.clients, client],
          sessions: [...d.sessions, session],
          requests: requestsNext,
          handledShared,
        };
      });
    },
    [remote, therapist.sessionLength, data.sessions, data.services]
  );

  return {
    data,
    requests,
    loading,
    syncError,
    clearError: () => setSyncError(null),
    reload,
    updateClient,
    addSession,
    updateSession,
    moveSession,
    saveService,
    deleteService,
    addTimeOff,
    removeTimeOff,
    resolveRequest,
    logEscalation,
    setLocation,
    requestLocation,
    signNote,
  };
}

export type TherapistStore = ReturnType<typeof useTherapistStore>;

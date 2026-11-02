import React, { useEffect, useState } from 'react';
import { Check, Siren } from 'lucide-react';
import { Button, Notice } from '../components/ui';
import { friendlyError, isRemote } from '../lib/supabase';
import * as api from '../lib/db/therapistApi';
import { fmtTime } from './data';

type Open = Awaited<ReturnType<typeof api.loadOpenIncident>>;

/** The client's open SOS alert, with the button that tells them a person has seen it. */
export const IncidentAck: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [incident, setIncident] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isRemote) return;
    let live = true;
    const load = () => api.loadOpenIncident(clientId).then(i => live && setIncident(i)).catch(() => {});
    setIncident(null);
    load();
    const t = setInterval(load, 20000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [clientId]);

  if (!incident) return null;
  const seen = incident.status === 'acknowledged';

  const acknowledge = async () => {
    setBusy(true);
    setError('');
    try {
      await api.acknowledgeIncident(incident.id);
      setIncident({ ...incident, status: 'acknowledged' });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Notice tone={seen ? 'info' : 'danger'} icon={seen ? <Check className="h-5 w-5" /> : <Siren className="h-5 w-5" />}>
      <p className="m-0 font-bold">
        {seen ? 'The client can see that you have seen this alert.' : `SOS alert started at ${fmtTime(incident.created_at)}. The client is waiting to hear that someone has seen it.`}
      </p>
      {error && <p className="m-0 mt-1">{error}</p>}
      {!seen && (
        <Button className="mt-2" onClick={acknowledge} disabled={busy}>
          {busy ? 'Sending…' : 'I’ve seen this'}
        </Button>
      )}
    </Notice>
  );
};

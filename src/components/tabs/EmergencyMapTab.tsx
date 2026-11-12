import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserProfile, EmergencyCenter, ActiveTab } from '../../types';
import { PIN_COLOUR } from '../maps/pinColours';
// The map (Leaflet) loads on demand, so the call buttons and list appear at once on a slow phone
const EmsMap = React.lazy(() => import('../maps/EmsMap').then(m => ({ default: m.EmsMap })));
import { Card, SectionHeader, Button, ButtonLink, Chip, Badge, Notice, Segmented, cx } from '../ui';
import { Phone, Navigation, Crosshair, Wind, MapPin, MessageSquare, Copy, Check, Share2, ChevronDown, WifiOff, AlertTriangle, List, Map as MapIcon, Clock, Globe2, Loader2 } from 'lucide-react';
import { SafetyPlanCard } from '../ems/SafetyPlanCard';
import { InstallShortcut } from '../ems/InstallShortcut';
import { FirstAidSection } from '../ems/FirstAidSection';
import { keep, remember } from '../../lib/coping';
import { isFreshFix } from '../../lib/incident';
import { drivingRoute, findNearbyPlaces, mergePlaces, osmDirectionsHref, placeName, type OsmPlace, type Route } from '../../lib/osm';
import {
  CHECKED_HOTLINES,
  distanceKm,
  getPosition,
  isOpenNow,
  loadCentres,
  loadHotlines,
  locationAlreadyAllowed,
  locationMessage,
  roughDriveMins,
  smsHref,
  telHref,
  whatsappHref,
  type CentreWithCheck,
  type Fix,
  type Hotline,
} from '../../lib/ems';

import { t, T, msg } from '../../i18n';
import { EnglishSafetyNote } from '../ems/EnglishSafetyNote';
interface EmergencyMapTabProps {
  profile: UserProfile;
  onOpenSos: () => void;
  onOpenCalm?: () => void;
  onNavigate?: (tab: ActiveTab) => void;
}

const TYPE_LABEL: Record<EmergencyCenter['type'], string> = {
  hospital: msg('Hospital'),
  ems_station: msg('Ambulance service'),
  rehab: msg('Recovery centre'),
  helpline: msg('Helpline'),
  clinic: msg('Clinic'),
  pharmacy: msg('Pharmacy'),
  police: msg('Police'),
  fire_station: msg('Fire station'),
};

type TypeFilter = 'all' | 'hospital' | 'clinic' | 'pharmacy' | 'police' | 'ems_station' | 'rehab';
type OsmState = 'idle' | 'loading' | 'live' | 'saved' | 'error';
const isOsm = (c: EmergencyCenter): c is OsmPlace => (c as OsmPlace).source === 'osm';
const SEARCH_KM = 10;
type LocState = 'idle' | 'finding' | 'found' | 'denied' | 'unavailable';

export const EmergencyMapTab: React.FC<EmergencyMapTabProps> = ({ profile, onOpenSos, onOpenCalm, onNavigate }) => {
  const [centres, setCentres] = useState<CentreWithCheck[]>([]);
  const [hotlines, setHotlines] = useState<Hotline[]>(CHECKED_HOTLINES);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locState, setLocState] = useState<LocState>('idle');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [openOnly, setOpenOnly] = useState(false);
  // Phones show the map or the list (the map first; the choice is remembered); tablets and computers show both
  const [view, setViewRaw] = useState<'list' | 'map'>(() => remember<'list' | 'map'>('ems_view2', 'map'));
  const setView = (v: 'list' | 'map') => {
    setViewRaw(v);
    keep('ems_view2', v);
  };
  const [texting, setTexting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  // Free OpenStreetMap services (lib/osm.ts): places nearby, your street name, and road routes
  const [osmPlaces, setOsmPlaces] = useState<OsmPlace[]>([]);
  const [osmState, setOsmState] = useState<OsmState>('idle');
  const [near, setNear] = useState<string | null>(null);
  const [route, setRoute] = useState<Route | null>(null);

  const contact = profile.contacts.find(c => c.isPrimary) || profile.contacts[0];
  const contactFirstName = contact?.name.split('(')[0].trim();
  const myName = profile.nickname || profile.name || 'Your friend';

  const locate = useCallback(async () => {
    setLocState('finding');
    try {
      const f = await getPosition();
      setFix(f);
      setLocState('found');
    } catch (e: any) {
      setLocState(e?.code === 1 ? 'denied' : 'unavailable');
    }
  }, []);

  useEffect(() => {
    loadCentres().then(setCentres);
    loadHotlines().then(setHotlines);
    // Use the location straight away if the person already allowed it before
    locationAlreadyAllowed().then(ok => ok && locate());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [locate]);

  // When we know where you are: look up places nearby and your street / area name
  useEffect(() => {
    if (!fix) return;
    let live = true;
    setOsmState('loading');
    findNearbyPlaces(fix, SEARCH_KM)
      .then(r => {
        if (!live) return;
        setOsmPlaces(r.places);
        setOsmState(r.from);
      })
      .catch(() => live && setOsmState('error'));
    placeName(fix).then(n => live && setNear(n));
    return () => {
      live = false;
    };
  }, [fix?.lat, fix?.lng]);

  // The app's checked places plus the ones on OpenStreetMap (checked ones win if they are the same place)
  const allCentres = useMemo(() => mergePlaces(centres, osmPlaces), [centres, osmPlaces]);
  const addedFromMap = allCentres.length - centres.length;

  // Nearest first once we know where you are
  const ranked = useMemo(() => {
    const list = allCentres
      .filter(c => c.type !== 'helpline' && (filter === 'all' || c.type === filter))
      .map(c => {
        const km = fix ? distanceKm(fix, c) : null;
        return { c, km, mins: km != null ? roughDriveMins(km) : null, open: isOpenNow(c.hours) };
      })
      .filter(r => !openOnly || r.open !== false);
    // Nearest first; places open now before closed ones
    list.sort((a, b) => Number(a.open === false) - Number(b.open === false) || (fix ? (a.km ?? 0) - (b.km ?? 0) : 0));
    return list;
  }, [allCentres, fix, filter, openOnly]);

  // The ambulance service has no single station to drive to, so the nearest place to go is a hospital
  const nearestHospital = useMemo(() => (fix ? ranked.find(r => r.c.type === 'hospital') : undefined), [ranked, fix]);

  useEffect(() => {
    if (fix && nearestHospital) setSelectedId(nearestHospital.c.id);
    else if (!selectedId && ranked[0]) setSelectedId(ranked[0].c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix, nearestHospital?.c.id, ranked.length]);

  const selected = ranked.find(r => r.c.id === selectedId) || ranked[0];

  // The real road route to the selected place (OSRM), drawn on the map
  useEffect(() => {
    setRoute(null);
    if (!fix || !selected || selected.c.type === 'ems_station' || !online) return;
    let live = true;
    drivingRoute(fix, selected.c).then(r => live && setRoute(r));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix?.lat, fix?.lng, selected?.c.id, online]);
  const mapCentres = useMemo(() => ranked.map(r => r.c), [ranked]);
  const onSelectCentre = useCallback((c: EmergencyCenter) => setSelectedId(c.id), []);
  // An old position is never sent as if it were current: the time is in the message, and "Update my location" is offered
  const message = locationMessage(myName, fix, undefined, near);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  const shareMessage = async () => {
    try {
      await (navigator as any).share({ text: message });
    } catch {
      /* cancelled */
    }
  };

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const directionsHref = (c: EmergencyCenter) => `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;

  /* Thumb-zone actions on phones */
  const textMyPerson = async () => {
    if (!contact || texting) return;
    let f = isFreshFix(fix) ? fix : null;
    if (!f) {
      setTexting(true);
      try {
        f = await getPosition(5000);
        setFix(f);
        setLocState('found');
      } catch {
        /* send without a location; the message says so */
      }
      setTexting(false);
    }
    window.location.href = smsHref(contact.phone, locationMessage(myName, f, undefined, f === fix ? near : null));
  };
  const goNearest = () => {
    if (nearestHospital) {
      window.open(directionsHref(nearestHospital.c), '_blank', 'noopener');
      return;
    }
    document.getElementById('near-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!fix) locate();
  };

  return (
    <div className="flex flex-col gap-7 animate-fadeIn">
      {!online && (
        <Notice tone="info" icon={<WifiOff className="h-5 w-5" />}>
          {t("You’re offline. Calling 112 and 193 still works, and the list, hotlines and places you last found nearby are saved on your phone. The map and routes need internet.")}
        </Notice>
      )}

      {/* 1. Urgent: the first thing anyone in crisis sees */}
      <Card tone="danger" padded={false} as="section" aria-labelledby="urgent-h" className="flex flex-col gap-4 p-5 sm:gap-5 sm:p-7">
        <div className="max-w-xl">
          <h1 id="urgent-h" className="m-0 text-[1.625rem] font-extrabold leading-tight text-ink">
            {t("In danger right now?")}
          </h1>
          <p lang="en" className="m-0 mt-1.5 text-[1.0625rem] leading-relaxed text-ink-2">Call for help first. 4Life isn’t connected to emergency services and can’t send an ambulance: only your call reaches them.</p>
          <EnglishSafetyNote className="mt-3" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <ButtonLink href="tel:112" variant="danger" size="lg" icon={<Phone className="h-5 w-5" />} className="col-span-2 text-[1.0625rem] lg:col-span-1">
            {t("Call 112")}
          </ButtonLink>
          <ButtonLink href="tel:193" variant="secondary" size="lg" icon={<Phone className="h-5 w-5 text-danger-text" />} className={cx('whitespace-nowrap px-3 text-[0.9375rem] sm:px-5 sm:text-base', !onOpenCalm && 'col-span-2 lg:col-span-1')}>
            {t("Ambulance 193")}
          </ButtonLink>
          <Button variant="secondary" size="lg" onClick={onOpenSos} className="order-last col-span-2 lg:order-none lg:col-span-1">
            {contact ? t("Alert {contactFirstName}", { contactFirstName }) : t("Open SOS")}
          </Button>
          {onOpenCalm && (
            <Button variant="secondary" size="lg" onClick={onOpenCalm} icon={<Wind className="h-5 w-5 text-pri-text" />}>
              {t("Breathe")}
            </Button>
          )}
        </div>
      </Card>

      {/* 2. My safety plan */}
      <SafetyPlanCard profile={profile} />

      {/* 3. Send your location */}
      <Card as="section" raised aria-labelledby="share-h" className="flex flex-col gap-4">
        <SectionHeader
          id="share-h"
          title={t("Send someone your location")}
          subtitle={t("Many places don’t have a street address. A map link helps your support person — or the ambulance — find you.")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={fix ? 'secondary' : 'primary'} onClick={locate} disabled={locState === 'finding'} icon={<Crosshair className={cx('h-5 w-5', locState === 'finding' && 'animate-spin')} />}>
            {locState === 'finding' ? t("Finding you…") : fix ? t("Update my location") : t("Find my location")}
          </Button>
          <p className="m-0 text-[0.9375rem] text-ink-2" aria-live="polite">
            {locState === 'found' && fix && (
              <>
                <MapPin className="mr-1 inline h-4 w-4 align-[-2px] text-pri-text" aria-hidden="true" />
                {near ? (
                  <>
                    <T text="Found: near <0>{near}</0>, accurate to about {accuracyM} m." parts={[<strong className="text-ink" />]} vars={{ near, accuracyM: fix.accuracyM }} />
                  </>
                ) : (
                  <>{t("Found, accurate to about {accuracyM} m.", { accuracyM: fix.accuracyM })}</>
                )}
                {!isFreshFix(fix) && t(" This was a while ago: update it before you send.")}
              </>
            )}
            {locState === 'denied' && t("Location is switched off for this app. You can still send a message — add a landmark so they can find you.")}
            {locState === 'unavailable' && t("Your phone couldn’t find your location just now. Try again outside, or describe a landmark.")}
            {locState === 'idle' && t("If you allow it, your location is used on this screen to find the nearest help.")}
          </p>
        </div>

        <div className="rounded-xl bg-bg px-4 py-3.5">
          <p className="m-0 text-sm font-bold text-ink-3">{t("Message preview")}</p>
          <p className="m-0 mt-1 break-words text-[0.9375rem] text-ink">{t(message)}</p>
        </div>

        {contact ? (
          <div className="flex flex-wrap gap-2.5">
            <ButtonLink href={smsHref(contact.phone, message)} size="lg" icon={<MessageSquare className="h-5 w-5" />}>
              {t("Text {contactFirstName}", { contactFirstName })}
            </ButtonLink>
            <ButtonLink href={whatsappHref(contact.phone, message)} target="_blank" rel="noopener noreferrer" variant="secondary" size="lg">
              {t("WhatsApp")}
            </ButtonLink>
            <ButtonLink href={telHref(contact.phone)} variant="secondary" size="lg" icon={<Phone className="h-5 w-5" />}>
              {t("Call {contactFirstName}", { contactFirstName })}
            </ButtonLink>
            {canShare && (
              <Button variant="ghost" size="lg" onClick={shareMessage} icon={<Share2 className="h-5 w-5" />}>
                {t("Share…")}
              </Button>
            )}
            <Button variant="ghost" size="lg" onClick={copyMessage} icon={copied ? <Check className="h-5 w-5 text-pri-text" /> : <Copy className="h-5 w-5" />}>
              {copied ? t("Copied") : t("Copy")}
            </Button>
          </div>
        ) : (
          <Notice tone="warn" icon={<AlertTriangle className="h-5 w-5" />}>
            <p className="m-0">{t("Add a support person so you can send them your location in one tap.")}</p>
            {onNavigate && (
              <Button variant="link" onClick={() => onNavigate('profile_settings')}>
                {t("Add a support person")}
              </Button>
            )}
          </Notice>
        )}
        <p className="m-0 text-sm text-ink-3">{t("This opens your phone’s own messaging app with the message ready. Nothing is sent until you press send there, and 4Life can’t see if it arrived. To find places and routes, your location goes to OpenStreetMap’s services. It isn’t saved to your account.")}</p>
      </Card>

      {/* 3. Nearest help */}
      <section aria-labelledby="near-h" className="flex flex-col gap-4">
        <SectionHeader
          id="near-h"
          title={fix ? t("Nearest help") : t("Places that can help")}
          subtitle={
            fix
              ? t("Sorted by distance from you. Pick a place to see the route by road.")
              : t("Find your location above to see hospitals, clinics, pharmacies and police near you.")
          }
        />

        {/* Where the places come from (OpenStreetMap, free and open) */}
        {fix && osmState !== 'idle' && (
          <p className="m-0 flex items-start gap-2 text-sm text-ink-3" aria-live="polite">
            {osmState === 'loading' ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-pri-text" aria-hidden="true" />
            )}
            <span>
              {osmState === 'loading' && t("Looking for places near you on OpenStreetMap…")}
              {osmState === 'live' && t('Includes {count} more places within {km} km from OpenStreetMap, a free map made by volunteers. Call to check before you go.', { count: addedFromMap, km: SEARCH_KM })}
              {osmState === 'saved' && t("Includes {addedFromMap} places near here from OpenStreetMap, saved on your phone.", { addedFromMap })}
              {osmState === 'error' && t("Couldn’t reach OpenStreetMap just now, so only the app’s own list is shown. Try “Update my location” again in a moment.")}
            </span>
          </p>
        )}

        {nearestHospital && (
          <Card tone="soft" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="m-0 text-sm font-bold text-pri-ink">{t("Nearest hospital")}</p>
              <p className="m-0 text-lg font-extrabold text-ink">{nearestHospital.c.name}</p>
              <p className="m-0 text-[0.9375rem] text-ink-2">
                {route && selected?.c.id === nearestHospital.c.id
                  ? t("{v0} km by road · about {mins} min by car", { v0: route.km.toFixed(1), mins: route.mins })
                  : t("About {v0} km · around {mins} min by car", { v0: nearestHospital.km!.toFixed(1), mins: nearestHospital.mins })}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <ButtonLink
                href={`https://www.google.com/maps/dir/?api=1&destination=${nearestHospital.c.lat},${nearestHospital.c.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                icon={<Navigation className="h-5 w-5" />}
              >
                {t("Directions")}
              </ButtonLink>
            </div>
          </Card>
        )}

        <div role="group" aria-label={t("Type of place")} className="no-scrollbar fade-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          {(
            [
              ['all', msg('All')],
              ['hospital', msg('Hospitals')],
              ['clinic', msg('Clinics')],
              ['pharmacy', msg('Pharmacies')],
              ['police', msg('Police')],
              ['ems_station', msg('Ambulance')],
              ['rehab', msg('Recovery centres')],
            ] as Array<[TypeFilter, string]>
          ).map(([id, label]) => (
            <Chip key={id} tone="ink" selected={filter === id} onClick={() => setFilter(id)}>
              {t(label)}
            </Chip>
          ))}
          <Chip selected={openOnly} onClick={() => setOpenOnly(o => !o)}>
            <Clock className="h-4 w-4" aria-hidden="true" /> {t("Open now")}
          </Chip>
        </div>

        <div className="md:hidden">
          <Segmented<'list' | 'map'>
            label={t("Show")}
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: msg('List'), icon: <List className="h-5 w-5" /> },
              { value: 'map', label: msg('Map'), icon: <MapIcon className="h-5 w-5" /> },
            ]}
          />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className={cx('min-w-0 flex-col gap-3', view === 'map' ? 'flex' : 'hidden md:flex')}>
            <React.Suspense fallback={<div role="status" aria-label={t("Loading the map")} className="h-[320px] w-full animate-pulse rounded-2xl border border-line bg-muted sm:h-[400px]" />}>
              <EmsMap you={fix} centres={mapCentres} selectedId={selected?.c.id || null} onSelect={onSelectCentre} route={route?.line} />
            </React.Suspense>
            <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm text-ink-2" aria-label={t("Map key")}>
              <li className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-ink" aria-hidden="true" /> {t("You")}
              </li>
              {(['hospital', 'clinic', 'pharmacy', 'police', 'ems_station', 'rehab'] as const).map(type => (
                <li key={type} className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded" style={{ background: PIN_COLOUR[type] }} aria-hidden="true" /> {t(TYPE_LABEL[type])}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {selected && (
              <Card as="section" aria-labelledby="sel-h" className={cx('flex-col gap-3', view === 'map' ? 'flex' : 'hidden md:flex')}>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="muted">{t(TYPE_LABEL[selected.c.type])}</Badge>
                  {isOsm(selected.c) && <Badge tone="info">{t("OpenStreetMap")}</Badge>}
                  {selected.open === true && (
                    <Badge tone="pri" dot>
                      {t("Open now")}
                    </Badge>
                  )}
                  {selected.open === false && <Badge tone="warn">{t("Closed now")}</Badge>}
                </div>
                <h3 id="sel-h" className="m-0 text-[1.25rem] font-extrabold leading-snug text-ink">
                  {selected.c.name}
                </h3>
                <p className="m-0 text-[0.9375rem] text-ink-2">
                  {selected.c.address}, {selected.c.region}
                  {route ? (
                    <>
                      {' '}
                      · <strong className="text-ink">{route.km.toFixed(1)} {t("km by road")}</strong>{t(", about {mins} min by car", { mins: route.mins })}
                    </>
                  ) : (
                    selected.km != null && (
                      <>
                        {' '}
                        · <strong className="text-ink">{selected.km.toFixed(1)} {t("km")}</strong>{t(", about {mins} min", { mins: selected.mins })}
                      </>
                    )
                  )}
                </p>
                <p className="m-0 text-[0.9375rem] text-ink-2">{t(selected.c.hours)}</p>
                {selected.c.type === 'ems_station' ? (
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <ButtonLink href="tel:193" size="lg" variant="danger" icon={<Phone className="h-5 w-5" />}>
                      {t("Call 193")}
                    </ButtonLink>
                    <ButtonLink href="tel:112" size="lg" variant="secondary" icon={<Phone className="h-5 w-5" />}>
                      {t("Call 112")}
                    </ButtonLink>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    {selected.c.phone ? (
                      <ButtonLink href={telHref(selected.c.phone)} size="lg" icon={<Phone className="h-5 w-5" />}>
                        {t("Call")}
                      </ButtonLink>
                    ) : (
                      <ButtonLink href="tel:112" size="lg" variant="danger" icon={<Phone className="h-5 w-5" />}>
                        {t("Call 112")}
                      </ButtonLink>
                    )}
                    <ButtonLink
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selected.c.lat},${selected.c.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="secondary"
                      size="lg"
                      icon={<Navigation className="h-5 w-5 text-pri-text" />}
                    >
                      {t("Directions")}
                    </ButtonLink>
                  </div>
                )}
                {isOsm(selected.c) ? (
                  <p className="m-0 text-sm text-ink-3">
                    {t("From OpenStreetMap, a free map made by volunteers.")} {selected.c.phone ? t("Call to check before you go.") : t("No phone number is listed.")} <T text="In an emergency, call 112. <0>Open in OpenStreetMap</0>" parts={[<a href={osmDirectionsHref(fix, selected.c)} target="_blank" rel="noopener noreferrer" className="font-semibold text-pri-text underline" />]} />
                  </p>
                ) : (
                  !selected.c.verifiedAt &&
                  selected.c.type !== 'ems_station' && (
                    <p className="m-0 text-sm text-ink-3">
                      {t("{phone} has not been confirmed yet. In an emergency, call 112.", { phone: selected.c.phone })}
                    </p>
                  )
                )}
              </Card>
            )}

            <Card as="section" padded={false} aria-labelledby="list-h" className={cx('flex-col gap-2 p-3', view === 'list' ? 'flex' : 'hidden md:flex')}>
              <h3 id="list-h" className="m-0 px-2 pt-1 text-base font-bold text-ink">
                {ranked.length} {ranked.length === 1 ? 'place' : 'places'}
                {fix ? t(", nearest first") : ''}
              </h3>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 xl:max-h-96 xl:overflow-y-auto">
                {ranked.map(({ c, km, mins, open }) => {
                  const on = selected?.c.id === c.id;
                  const isEms = c.type === 'ems_station';
                  return (
                    <li key={c.id} className={cx('flex items-center gap-2 rounded-xl p-2', on ? 'bg-pri-soft' : 'hover:bg-muted')}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSelectedId(c.id)}
                        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left cursor-pointer"
                      >
                        <span className="h-3 w-3 shrink-0 rounded" style={{ background: PIN_COLOUR[c.type] }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.9375rem] font-bold text-ink">{c.name}</span>
                          <span className="block text-sm text-ink-3">
                            {km != null ? t("{v0} km · ~{mins} min · ", { v0: km.toFixed(1), mins }) : ''}
                            {open === true ? <span className="font-semibold text-pri-text">{t("open now")}</span> : open === false ? t("closed now") : TYPE_LABEL[c.type]}
                            {isOsm(c) && t(" · map")}
                          </span>
                        </span>
                      </button>
                      {(isEms || c.phone) && (
                        <a
                          href={isEms ? 'tel:193' : telHref(c.phone)}
                          aria-label={t("Call {name}", { name: c.name })}
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:border-pri-text"
                        >
                          <Phone className="h-5 w-5" aria-hidden="true" />
                        </a>
                      )}
                      {!isEms && (
                        <a
                          href={directionsHref(c)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("Directions to {name}", { name: c.name })}
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pri text-[#fff] hover:bg-pri-hover"
                        >
                          <Navigation className="h-5 w-5" aria-hidden="true" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* 4. First aid while help is on the way (works offline; videos when online) */}
      <FirstAidSection />

      {/* 5. What to say on the phone */}
      <section aria-labelledby="say-h">
        <h2 id="say-h" className="sr-only">
          {t("What to tell the ambulance")}
        </h2>
        <details className="group rounded-2xl border border-line bg-surface p-5" open>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-lg font-bold text-ink">
            {t("What to tell the ambulance")}
            <ChevronDown className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <EnglishSafetyNote className="mt-3" />
          <ol lang="en" className="m-0 mt-3 flex flex-col gap-2 pl-5 text-[0.9375rem] leading-relaxed text-ink-2">
            <li>
              <strong className="text-ink">Where you are</strong> — the area and a landmark (a school, church, junction or shop).
            </li>
            <li>
              <strong className="text-ink">What happened</strong> — and what was taken, how much, and when, if you know.
            </li>
            <li>
              <strong className="text-ink">Is the person awake? Are they breathing?</strong>
            </li>
            <li>
              <strong className="text-ink">Your phone number</strong>, in case the call drops.
            </li>
            <li>Stay on the line until they tell you to hang up.</li>
          </ol>
        </details>
      </section>

      {/* 6. Hotlines — only numbers that have been checked */}
      <section aria-labelledby="hot-h" className="flex flex-col gap-4">
        <SectionHeader id="hot-h" title={t("Hotlines")} subtitle={t("Tap a number to call. Each one comes from a published list, shown with its date.")} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {hotlines.map(h => (
            <a key={h.id} href={telHref(h.number)} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-5 py-4 no-underline transition-colors hover:border-pri-text">
              <span className="text-[1.375rem] font-extrabold text-ink">{h.number}</span>
              <span className="text-[0.9375rem] font-bold text-ink">{t(h.label)}</span>
              <span className="text-sm text-ink-2">{t(h.description)}</span>
              <span className="text-xs text-ink-3">
                {t("From {v1},", { v1: h.source.split(',')[0] })} {new Date(h.verifiedAt).toLocaleDateString([], { month: 'long', year: 'numeric' })}
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* One tap from the phone's home screen */}
      <InstallShortcut />

      {/* Phones: the three most important actions, always within thumb reach */}
      <div className="h-[4.75rem] lg:hidden" aria-hidden="true" />
      <nav
        aria-label={t("Emergency actions")}
        className="fixed inset-x-0 bottom-[calc(var(--dock-space)-0.25rem)] z-30 mx-auto grid max-w-[30rem] grid-cols-3 gap-2 bg-gradient-to-t from-bg via-bg/85 to-transparent px-[max(env(safe-area-inset-left),0.625rem)] pb-1.5 pt-5 lg:hidden"
      >
        <a href="tel:112" className="btn-shine flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-danger text-[0.9375rem] font-extrabold text-[#fff] no-underline">
          <Phone className="h-5 w-5" aria-hidden="true" /> {t("Call 112")}
        </a>
        <button
          type="button"
          onClick={contact ? textMyPerson : onOpenSos}
          disabled={texting}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-danger bg-danger-soft text-[0.9375rem] font-extrabold text-danger-text cursor-pointer disabled:cursor-wait"
        >
          <MessageSquare className="h-5 w-5" aria-hidden="true" />
          <span className="max-w-full truncate px-1">{texting ? t("Finding you…") : contact ? t("Text {v0}", { v0: contactFirstName?.split(' ').slice(-1)[0] }) : 'SOS'}</span>
        </button>
        <button
          type="button"
          onClick={goNearest}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-pri text-[0.9375rem] font-extrabold text-[#fff] cursor-pointer"
        >
          <Navigation className="h-5 w-5" aria-hidden="true" /> {t("Nearest help")}
        </button>
      </nav>
    </div>
  );
};

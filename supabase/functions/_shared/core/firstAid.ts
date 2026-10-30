// GENERATED from src/lib/firstAid.ts by scripts/sync-functions.mjs. Do not edit: change the original, then run `npm run sync:functions`.
/**
 * First aid while you wait for the ambulance.
 *
 * The steps follow common first-aid guidance (Red Cross / St John Ambulance style):
 * short, in the order you do them, and always "call 112 first" when it is serious.
 * They are saved in the app, so they work offline.
 *
 * Each topic also has a YouTube search. Without a key the app opens that search on
 * YouTube. With YOUTUBE_API_KEY set on the server, /api/first-aid/videos returns a few
 * matching videos to watch inside the app (see server/app.ts).
 */

export interface FirstAidTopic {
  id: string;
  title: string;
  /** One line: when to use this */
  when: string;
  /** Call 112 before doing anything else */
  callFirst: boolean;
  steps: string[];
  /** Things not to do */
  avoid?: string[];
  /** What to search for on YouTube */
  query: string;
}

export const FIRST_AID: FirstAidTopic[] = [
  {
    id: 'overdose',
    title: 'Overdose or won’t wake up',
    when: 'Someone took too much and is very sleepy, confused or can’t be woken.',
    callFirst: true,
    steps: [
      'Call 112. Say “possible overdose” and where you are.',
      'Shout their name and squeeze their shoulder. Check if they are breathing.',
      'If they are breathing, roll them onto their side (recovery position) so they don’t choke.',
      'If they are not breathing normally, start CPR (see “Not breathing”).',
      'If you have naloxone and it may be opioids (like tramadol), give it as the pack says.',
      'Stay with them. Keep any pills or bottles to show the ambulance crew.',
    ],
    avoid: ['Don’t give them coffee, food or anything to drink.', 'Don’t put them in a cold bath or leave them to “sleep it off”.'],
    query: 'recovery position first aid overdose',
  },
  {
    id: 'cpr',
    title: 'Not breathing (CPR)',
    when: 'They don’t respond and are not breathing normally.',
    callFirst: true,
    steps: [
      'Call 112 and put the phone on speaker.',
      'Lay them on their back on a firm surface.',
      'Put the heel of your hand in the centre of their chest, your other hand on top.',
      'Push down hard and fast, about 5 cm, 100 to 120 times a minute.',
      'Keep going until help arrives or they start breathing normally.',
    ],
    avoid: ['Don’t stop to check for long. Pauses should be under 10 seconds.'],
    query: 'hands only CPR adult how to',
  },
  {
    id: 'choking',
    title: 'Choking',
    when: 'They can’t speak, cough or breathe.',
    callFirst: false,
    steps: [
      'If they can cough, tell them to keep coughing.',
      'If they can’t, lean them forward and give up to 5 firm back blows between the shoulder blades.',
      'Still choking: stand behind them and give up to 5 abdominal thrusts (pull in and up above the belly button).',
      'Repeat back blows and thrusts. If they stop responding, call 112 and start CPR.',
    ],
    query: 'choking first aid back blows abdominal thrusts',
  },
  {
    id: 'bleeding',
    title: 'Heavy bleeding',
    when: 'Blood is flowing fast or won’t stop.',
    callFirst: true,
    steps: [
      'Call 112 if the bleeding is heavy.',
      'Press firmly on the wound with a clean cloth. Keep pressing.',
      'If blood soaks through, add more cloth on top. Don’t lift the first one.',
      'Raise the injured part above the heart if you can.',
      'Keep them warm and lying down until help comes.',
    ],
    avoid: ['Don’t pull out anything stuck in the wound. Press around it.'],
    query: 'how to stop severe bleeding first aid',
  },
  {
    id: 'burns',
    title: 'Burns',
    when: 'Skin burned by fire, hot water, oil or chemicals.',
    callFirst: false,
    steps: [
      'Cool the burn under cool running water for 20 minutes.',
      'Take off rings, watches or tight clothing near the burn, unless stuck to the skin.',
      'Cover loosely with cling film or a clean plastic bag.',
      'Call 112 or go to hospital for large, deep or face, hand or genital burns.',
    ],
    avoid: ['Don’t use ice, butter, toothpaste or oil.', 'Don’t burst blisters.'],
    query: 'burns first aid cool running water',
  },
  {
    id: 'seizure',
    title: 'Seizure (fit)',
    when: 'Shaking, stiff body or collapsing, sometimes after stopping alcohol or drugs.',
    callFirst: false,
    steps: [
      'Move hard or sharp things away. Put something soft under their head.',
      'Note the time it started.',
      'When the shaking stops, roll them onto their side.',
      'Call 112 if it lasts over 5 minutes, they are hurt, or it is their first seizure.',
    ],
    avoid: ['Don’t hold them down.', 'Don’t put anything in their mouth.'],
    query: 'seizure first aid what to do',
  },
  {
    id: 'alcohol',
    title: 'Too much alcohol',
    when: 'Very drunk, vomiting, or hard to wake.',
    callFirst: false,
    steps: [
      'Don’t leave them alone. Keep them sitting up or on their side.',
      'If they are hard to wake, breathing slowly or cold and pale, call 112.',
      'If they vomit, keep them on their side so they don’t choke.',
      'Keep them warm. Give small sips of water only if fully awake.',
    ],
    avoid: ['Don’t give coffee or more alcohol.', 'Don’t let them sleep on their back.'],
    query: 'alcohol poisoning first aid recovery position',
  },
  {
    id: 'fainting',
    title: 'Fainting',
    when: 'Feeling faint or briefly passing out.',
    callFirst: false,
    steps: [
      'Help them lie down and raise their legs a little.',
      'Loosen tight clothing and give them fresh air.',
      'They should wake within a minute or two. If not, call 112.',
      'When they feel better, help them sit up slowly.',
    ],
    query: 'fainting first aid',
  },
];

export const firstAidTopic = (id: string) => FIRST_AID.find(t => t.id === id);

/** YouTube search for a topic (works with no key) */
export const youtubeSearchHref = (t: FirstAidTopic) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t.query + ' first aid')}`;

/**
 * 4Life Privacy Policy: the words, kept apart from the page that shows them (src/components/privacy/PrivacyPage.tsx).
 *
 * Every statement here was checked against the code and the database (see PRIVACY-AUDIT.md). When the app
 * changes how it handles personal information, change this file in the same pull request.
 *
 * Writing rules for this file:
 *  - Inline formatting: **bold** and [link text](https://…). Nothing else.
 *  - {{operator}}, {{email}}, {{address}}, {{dpo}} and {{dpcReg}} are filled in from settings (see
 *    privacyContacts() below). While one is missing, the page shows a marked placeholder; it never guesses.
 *  - A `pending` block is a fact the operator still has to confirm or decide. It is shown to readers as
 *    "To be confirmed". Remove it once settled (and change `status` to 'final' when no pending block is left
 *    and a qualified Ghanaian data-protection lawyer has reviewed the policy).
 *  - The policy is in English. It is not machine-translated, because a translated legal text needs its own review.
 */

export type Block =
  | { p: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { callout: string }
  | { pending: string };

export interface PolicySection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Policy {
  status: 'draft' | 'final';
  lastUpdated: string; // ISO date
  version: string;
  summary: string[];
  sections: PolicySection[];
}

/* ---------------------------------------------------------------------------------------------- */
/* Who runs 4Life: from settings, never invented                                                   */
/* ---------------------------------------------------------------------------------------------- */

export type ContactKey = 'operator' | 'email' | 'address' | 'dpo' | 'dpcReg';

const env: Record<string, string | undefined> = (typeof import.meta === 'object' && (import.meta as any).env) || {};

/** The operator's details from VITE_PRIVACY_* settings; null when not supplied yet */
export function privacyContacts(e: Record<string, string | undefined> = env): Record<ContactKey, string | null> {
  const v = (k: string) => (e[k] || '').trim() || null;
  return {
    operator: v('VITE_PRIVACY_OPERATOR'),
    email: v('VITE_PRIVACY_EMAIL'),
    address: v('VITE_PRIVACY_ADDRESS'),
    dpo: v('VITE_PRIVACY_DPO'),
    dpcReg: v('VITE_PRIVACY_DPC_REGISTRATION'),
  };
}

/** What a reader sees while a detail is missing */
export const CONTACT_PLACEHOLDER: Record<ContactKey, string> = {
  operator: 'Organisation name (to be added)',
  email: 'privacy contact email (to be added)',
  address: 'registered address (to be added)',
  dpo: 'data protection contact (to be added)',
  dpcReg: 'Data Protection Commission registration number (to be added)',
};

/* ---------------------------------------------------------------------------------------------- */
/* Outside policies linked from the text                                                           */
/* ---------------------------------------------------------------------------------------------- */

const L = {
  supabase: 'https://supabase.com/privacy',
  vercel: 'https://vercel.com/legal/privacy-policy',
  groq: 'https://groq.com/privacy-policy',
  groqData: 'https://console.groq.com/docs/your-data',
  google: 'https://policies.google.com/privacy',
  geminiTerms: 'https://ai.google.dev/gemini-api/terms',
  youtube: 'https://www.youtube.com/t/terms',
  osmf: 'https://osmfoundation.org/wiki/Privacy_Policy',
  dpc: 'https://dataprotection.org.gh',
};

/* ---------------------------------------------------------------------------------------------- */
/* The policy                                                                                      */
/* ---------------------------------------------------------------------------------------------- */

export const POLICY: Policy = {
  status: 'draft',
  version: '1.0 (draft for review)',
  lastUpdated: '2026-11-12',

  summary: [
    '4Life stores your account and recovery records in its cloud database (Supabase). Your AI chat conversation is kept only in your browser on your device.',
    'To write an AI reply, your message and the recent conversation go through 4Life’s server to **Groq**, and to **Google Gemini** only if Groq can’t answer. Your email, real name, phone numbers and support contacts are not sent.',
    'A counsellor sees your details only after you send them a request. Your check-ins, thought records and SOS location reach a counsellor only if you choose to share them.',
    '4Life does **not** contact emergency services for you. SOS helps you call 112 or 193 and message your support people from your own phone.',
    'You can download your data in Settings. To delete your account or exercise other rights, contact {{email}}.',
  ],

  sections: [
    /* 1 ----------------------------------------------------------------------------------------- */
    {
      id: 'introduction',
      title: 'Introduction and scope',
      blocks: [
        { p: '4Life is a digital mental wellness and recovery-support app, built for young people in Ghana. It offers an AI companion that uses cognitive behavioural therapy (CBT) skills, check-ins, thought records, a peer community (the Global Village), learning videos, emergency tools (Instant EMS and SOS), and a way to find and book verified counsellors. Counsellors use a separate therapist workspace in the same app.' },
        { p: 'This Privacy Policy explains what personal information 4Life collects, why, where it is kept, who can see it, who it is shared with, how long it is kept, and the rights you have. It applies to everyone who uses 4Life: people using it for their own recovery (“clients”), counsellors and therapists (“therapists”), and visitors who use it without an account.' },
        { p: '4Life is operated by **{{operator}}** (“we”, “us”), {{address}}. For anything about your privacy, contact {{email}}.' },
        { p: '4Life is not a hospital or a healthcare provider, and the AI companion is not a doctor or a therapist. Counsellors who use 4Life are independent professionals; 4Life reviews their licence details before listing them.' },
        { p: 'This policy takes effect on the date shown as “Last updated” at the top of the page. If we change it in a way that matters, we will tell you in the app before the change takes effect (see “Changes to this policy”).' },
      ],
    },

    /* 2 ----------------------------------------------------------------------------------------- */
    {
      id: 'information-we-collect',
      title: 'Information we collect',
      blocks: [
        { p: 'Most information comes from **you**, when you fill in forms or use a feature. Some is created **automatically** when you use 4Life, such as sign-in records and technical logs. Many details are optional: where a field is optional, leaving it empty only means the related feature works more generally.' },
        { table: { head: ['Category', 'What it includes', 'How we get it'], rows: [
          ['Account', 'Email address; password (stored by our sign-in provider in a protected form, never readable by us); if you use them, your Google sign-in details (name, email address, profile picture link) or your phone number for sign-in codes; account role (client, therapist or administrator).', 'You, when you sign up or sign in'],
          ['Profile', 'Full name (optional, shown to no other member); community name (shown to other members); age; region; language; focus area (for example substance use); faith preference and faith tradition, if you choose them; streak days; display settings; and the other details you set in the app, such as gender and area (in Settings), your AI companion’s name and picture, reminder and sleep times, calming activities, and your latest mood and craving rating.', 'You'],
          ['Support people', 'Name, phone number, optional email and relationship of the people you add as support contacts.', 'You'],
          ['Recovery records', 'Daily check-ins (mood 1–5, craving 0–10); goals; homework; your safety plan (warning signs, coping steps, support people); thought records (situation, thought, emotion, ratings, thinking trap, evidence, balanced thought, and whether you share it with your counsellor).', 'You (goals, homework and the safety plan can also be added by your counsellor)'],
          ['AI conversations', 'Your messages to the AI companion and its replies; coping steps you marked as helpful.', 'You. The conversation is kept on your device only (see “Where your information is stored”).'],
          ['Counselling', 'Session requests (focus, preferred time, how you want to meet, the service chosen, your message, and whether you share your check-ins); booked sessions (time, length, format, type, status, topic); the counsellor’s session notes, private notes and risk level; a record of steps taken in a crisis.', 'You and your counsellor'],
          ['Emergencies (SOS)', 'The time of each alert and its status; if you agreed to share your location, your location (coordinates, accuracy, area name and when it was taken); which help options you opened (for example “message my support person” or “call 112”); whether a counsellor acknowledged the alert.', 'You, your device, and your counsellor'],
          ['Global Village', 'Posts, replies and circle chat messages (shown with your community name); reactions; reports you make; people you block; circles you sign up for.', 'You'],
          ['Therapists', 'Name and title, profession, years of experience, specialties, approaches, languages, region and practice location, working hours, fees, biography; licence body and number; the dates you accepted 4Life’s confidentiality, crisis and accuracy commitments; your services, days off, schedule and the notes you write.', 'You (therapists)'],
          ['Technical', 'Your device’s internet (IP) address and browser details in server and sign-in logs; error reports from the app (the error message, the page and the place in the code; at most five per visit); technical details of AI requests (which provider answered, why another failed, and the number of words processed, never the words themselves); the settings and caches the app keeps in your browser.', 'Automatically'],
        ] } },
        { p: 'We do **not** use advertising, analytics or tracking tools, and we do not sell personal information.' },
      ],
    },

    /* 3 ----------------------------------------------------------------------------------------- */
    {
      id: 'sensitive-information',
      title: 'Sensitive and health-related information',
      blocks: [
        { p: 'Much of what you share in 4Life is sensitive. It can reveal your mental health, substance use and recovery, your feelings and personal difficulties, your faith, and what happens in counselling. Ghana’s Data Protection Act, 2012 (Act 843) treats information about health and about religious beliefs as **special personal data** (section 37), which may only be processed where it is necessary or where you consent.' },
        { list: [
          '**Why we process it:** to give you the support you ask for, such as AI replies that fit your situation, tracking your check-ins and progress, thought records, and counselling with a counsellor you choose.',
          '**Which features depend on it:** the AI companion, check-ins, thought records, the safety plan, counselling requests and sessions, and SOS.',
          '**Who may receive it:** you; a counsellor, only the parts described in “What counsellors can see”; our AI providers, only the parts described in “AI processing”; our hosting providers, which store and transmit it for us; and a small number of authorised administrators of 4Life, only when needed to run and protect the service.',
          '**How access is restricted:** every table in the database has access rules that decide, row by row, who can read or change it; for example, only you can see your support contacts, and a counsellor sees your check-ins only while you share them.',
          '**What you control:** you choose what to fill in, whether to share check-ins and individual thought records with your counsellor, and whether your location is shared in an SOS. You can change these choices at any time.',
        ] },
        { pending: 'The legal basis for processing special personal data (consent under section 37(2)(b), or necessity) and how that consent is recorded must be confirmed by legal review. 4Life does not yet record a separate, specific consent to processing health information at sign-up.' },
      ],
    },

    /* 4 ----------------------------------------------------------------------------------------- */
    {
      id: 'how-we-use',
      title: 'How we use personal information',
      blocks: [
        { list: [
          'Create and run your account, and keep you signed in.',
          'Provide AI-assisted wellness support and CBT exercises, in your language.',
          'Keep your check-ins, goals, safety plan and thought records, and show your progress.',
          'Let you find counsellors, send requests, and book, move or cancel sessions; let counsellors manage their caseload and schedule.',
          'Run SOS: record your alert, show it to your linked counsellor, share your location with them if you agreed, and help you contact your support people and emergency numbers from your phone.',
          'Run the Global Village: show posts under your community name, check posts against the house rules (in the app and with the AI providers), and handle reports. Administrators can hide or remove posts and suspend accounts that break the rules; a suspended person can still use SOS, see and download their data, and is told why.',
          'Show learning and first-aid videos, and nearby emergency services on a map.',
          'Keep 4Life working and secure: prevent abuse (for example rate limits), fix errors, and keep a record of who changed sensitive records.',
          'Answer your questions and requests, and meet our legal obligations.',
        ] },
        { p: 'We do not use your information for advertising, and we will not use it for a purpose unrelated to the ones above without telling you first and, where the law requires it, asking for your consent.' },
        { p: 'We do not make automated decisions that have legal or similarly significant effects on you. The AI companion’s replies are suggestions; it is not a diagnosis and does not replace a qualified professional.' },
      ],
    },

    /* 5 ----------------------------------------------------------------------------------------- */
    {
      id: 'ai-processing',
      title: 'AI processing and AI providers',
      blocks: [
        { p: 'Three features use AI: the AI companion chat, the thought-record helper, and the Global Village (the circle guide and checking posts against the house rules). The AI runs at outside providers, through 4Life’s own server; your device never contacts them directly, and our keys to them stay on the server.' },
        { p: '**Groq** is the main provider. **Google Gemini** is the backup: it is used only when Groq cannot answer a request (for example it is busy, unavailable, too slow, over its usage limits, or sends nothing). The same request then goes to Gemini. Each request is answered by one provider.' },
        { table: { head: ['Feature', 'What is sent to the AI provider', 'Never sent'], rows: [
          ['AI companion chat', 'Your new message; the recent conversation (up to the last 12 messages, about 8,000 characters); and these profile details: your community name, your AI companion’s name, your language, focus area, latest mood and craving rating, faith preference, region, and coping steps you marked as helpful.', 'Your email, full name, age, phone numbers, support contacts, account ID and location'],
          ['Thought-record helper', 'The situation, thought and emotion you entered, and your language.', 'Everything else'],
          ['Circle guide', 'Your question, the circle’s name, your community name and your language.', 'Everything else'],
          ['Village post check', 'The text of the post, reply or message you are about to publish.', 'Who you are'],
        ] } },
        { p: 'Before the AI answers, 4Life also checks your message on its server for crisis words, so that emergency options can appear straight away. The conversation itself is not stored on our server, and our logs record only which provider answered and the amount of text, never what was said.' },
        { p: '**Groq.** According to Groq’s documentation, Groq does not keep data from these requests by default, but it may log requests for up to 30 days when it investigates suspected abuse, unless the account has switched on “zero data retention”. See [Groq’s privacy policy](' + L.groq + ') and [how Groq handles API data](' + L.groqData + ').' },
        { pending: 'Whether zero data retention is switched on for 4Life’s Groq account.' },
        { p: '**Google Gemini.** Under Google’s Gemini API terms, when the free (unpaid) service is used, Google uses the content sent and the responses to provide and improve its products, and human reviewers may read it (after Google disconnects it from the account). When the paid service is used, Google does not use prompts or responses to improve its products. See the [Gemini API terms](' + L.geminiTerms + ') and [Google’s privacy policy](' + L.google + ').' },
        { pending: 'Which Gemini service tier 4Life uses. Google’s terms ask that sensitive or personal information is not sent to the unpaid service, and that the service is used only by people aged 18 or over.' },
        { callout: 'Because your messages are processed by these companies, please leave out full names, phone numbers, addresses and anything else that identifies you or other people.' },
      ],
    },

    /* 6 ----------------------------------------------------------------------------------------- */
    {
      id: 'counsellors',
      title: 'What counsellors can see',
      blocks: [
        { p: 'A counsellor can see information about you only after you send them a session request, and more only after they accept it. The database enforces these rules, not just the app.' },
        { table: { head: ['When', 'What the counsellor can see'], rows: [
          ['After you send a request', 'Your community name, focus area, message, preferred time, how you want to meet and the service you chose. If you chose to share your check-ins: your streak and your mood and craving ratings from the last 7 days.'],
          ['After they accept (while you work together)', 'Your community name, age, focus area, streak, and whether you agreed to share your location in an SOS; your sessions; the goals, homework and safety plan you work on together; your check-ins, **only while you share them**; thought records you marked **“Share with my counsellor”**; your SOS alerts, and your location in them **only if you agreed** to share it.'],
          ['When an SOS is open', 'If you agreed to share your location, your counsellor can ask your app for an updated location. Your phone answers only while your alert is open.'],
          ['After you stop working together', 'A counsellor who has discharged you no longer sees your details or new records.'],
        ] } },
        { p: 'Counsellors **cannot** see your AI chat conversations, your full name, email address, phone number, support contacts, thought records you did not share, or check-ins while you are not sharing them.' },
        { p: 'Your counsellor’s session notes, private notes and the risk level they record are kept for them as their professional records; they are not shown to you in the app. Counsellors agree to keep what clients share confidential when they join 4Life.' },
        { p: 'In the Global Village, everyone signed in, counsellors included, sees posts with the author’s community name. A counsellor who knows your community name from a request could recognise your posts.' },
      ],
    },

    /* 7 ----------------------------------------------------------------------------------------- */
    {
      id: 'sos-and-location',
      title: 'SOS, emergencies and your location',
      blocks: [
        { callout: '4Life does not contact emergency services or send an ambulance for you. Only your own call to 112 (emergency) or 193 (ambulance) does.' },
        { p: '**When 4Life uses your location.** Your browser asks your permission first. Location is used: when you press SOS, **if** you turned on “Share my location with my counsellor if I press SOS” in Settings; on the Instant EMS page, to find help near you (if you already allowed location, the page uses it as soon as it opens); and when your counsellor asks for an update during an alert that is still open, if you agreed to share. If you refuse permission, SOS, emergency numbers and the rest of 4Life still work; the map simply can’t centre on you.' },
        { p: '**What an SOS records.** The alert and its status; whether a location was found; and, only if you agreed to share it, your coordinates, their accuracy, the area name and the time they were taken. Without your agreement, the database removes the coordinates before saving. It also records which help options you opened (for example “message my support person”) and whether your counsellor acknowledged it.' },
        { p: '**Who receives it.** Your linked counsellor, in their workspace. Messages to your support people are **sent from your own phone** (by SMS, WhatsApp or a call that 4Life opens for you), so 4Life cannot see or confirm their delivery. 4Life does not send your location to your support people by itself.' },
        { p: '**Maps and nearby services.** To find hospitals and other services near you and to draw the map, your browser sends your approximate position to OpenStreetMap services: public servers that search map data (Overpass), find a place name (Nominatim) and calculate routes (OSRM), and the map-picture servers. These requests include your device’s internet address. If you press a “directions” link, Google Maps opens with the destination. See the [OpenStreetMap Foundation privacy policy](' + L.osmf + ').' },
        { p: '**How long it is kept.** An alert left open closes automatically after 24 hours. 4Life is built to remove location coordinates from SOS alerts after 30 days, and to delete closed alerts after 90 days.' },
        { pending: 'These automatic clean-ups must be scheduled in the database to run. Until that is confirmed, SOS records may be kept until your account is deleted.' },
      ],
    },

    /* 8 ----------------------------------------------------------------------------------------- */
    {
      id: 'storage',
      title: 'Where your information is stored',
      blocks: [
        { p: '4Life keeps information in two places: **in your browser on your device**, and **in 4Life’s cloud database**, provided by Supabase.' },
        { table: { head: ['Place', 'What is kept there', 'Why'], rows: [
          ['Your device (browser storage)', 'Your AI chat conversation (the last 80 messages, cleared after 7 days without use, or when you start a new conversation); coping steps you marked as helpful; your sign-in session; your language, theme and display settings; places found near you on the map; SOS alerts waiting to be sent when you are offline; the app’s files for offline use. If you use 4Life as a guest, without an account, your profile and records are kept here too.', 'So the app works quickly and offline, and so your conversation with the AI stays on your device'],
          ['4Life’s cloud database (Supabase)', 'Your account and profile; support contacts; check-ins, goals, homework, safety plan and thought records; counselling requests, sessions and notes; SOS alerts; Global Village activity; therapists’ profiles, licence details and schedules; a record of who changed sensitive records (without their content).', 'So your information is kept safely between devices, and so your counsellor can work with you when you choose'],
        ] } },
        { p: 'Information in your browser is removed when you clear the site’s data, or uninstall the app from your home screen, on that device. Signing out does not remove everything; use your browser’s settings to clear it, especially on a shared device. Information in the cloud database stays when you clear your browser.' },
      ],
    },

    /* 9 ----------------------------------------------------------------------------------------- */
    {
      id: 'third-parties',
      title: 'Service providers and other recipients',
      blocks: [
        { p: 'We use these outside services to run 4Life. Each receives only what it needs for its role.' },
        { table: { head: ['Provider', 'Role', 'What it receives'], rows: [
          ['[Supabase](' + L.supabase + ')', 'Database, sign-in, sign-in emails, and some of our server functions', 'Everything stored in the cloud database (see above); sign-in records, including internet address'],
          ['[Vercel](' + L.vercel + ')', 'Hosts the app and 4Life’s server', 'Every request to the app, including internet address and browser details in its logs; AI requests on their way to the AI providers'],
          ['[Groq](' + L.groq + ')', 'Main AI provider', 'What is listed in “AI processing”'],
          ['[Google (Gemini API)](' + L.geminiTerms + ')', 'Backup AI provider', 'What is listed in “AI processing”, only when Groq cannot answer'],
          ['[Google (YouTube)](' + L.youtube + ')', 'Learning and first-aid videos', 'Our server searches YouTube with the topic, or with words you type in the Learn search, and no information about you. When you play a video, your browser loads it from YouTube’s privacy-enhanced player (youtube-nocookie.com), so YouTube receives your internet address and may store data in your browser under [Google’s privacy policy](' + L.google + ')'],
          ['[Google (sign-in)](' + L.google + ')', 'Optional “Continue with Google”', 'If you use it: Google confirms who you are and shares your name, email and picture with 4Life’s sign-in'],
          ['OpenStreetMap services ([privacy](' + L.osmf + '))', 'Maps, nearby services, place names and routes', 'Your approximate position and internet address, when you use Instant EMS'],
        ] } },
        { pending: 'Which email service sends sign-in emails (Supabase’s own, or our own provider), and, if phone sign-in is switched on, which SMS provider sends the codes.' },
        { p: 'We may also disclose information when the law requires it, or where necessary to protect someone’s life or safety, and only as far as necessary.' },
      ],
    },

    /* 10 ---------------------------------------------------------------------------------------- */
    {
      id: 'international',
      title: 'Information processed outside Ghana',
      blocks: [
        { p: 'Our providers process information outside Ghana. 4Life’s server functions run with Vercel in the United States, and with Supabase in other regions (for example Frankfurt, Germany); Groq and Google process AI requests in their own data centres, and OpenStreetMap services run in Europe. This means your information may be protected by laws different from Ghana’s while there.' },
        { p: 'Under Act 843, we remain responsible for your information when a provider processes it for us, and providers based outside Ghana must comply with Ghanaian law (section 30).' },
        { pending: 'The region where 4Life’s Supabase database is stored, and the written agreements (data processing terms) in place with each provider.' },
      ],
    },

    /* 11 ---------------------------------------------------------------------------------------- */
    {
      id: 'retention',
      title: 'How long we keep information',
      blocks: [
        { table: { head: ['Information', 'How long'], rows: [
          ['AI chat conversation (on your device)', 'The last 80 messages; cleared after 7 days without use, when you start a new conversation, or when you clear your browser data'],
          ['Account, profile, contacts and recovery records', 'Until your account is deleted'],
          ['Counselling requests and sessions', 'Until your account is deleted'],
          ['Counsellors’ session notes', 'Until the client’s account is deleted. Once a note is signed, every later change keeps the earlier version'],
          ['Counsellors’ crisis logs and earlier versions of signed notes', 'Permanent: they cannot be edited or deleted (see “Downloading and deleting your information”)'],
          ['SOS location coordinates', '30 days (see the note in “SOS, emergencies and your location”)'],
          ['SOS alert records', 'Open alerts close after 24 hours; closed alerts are deleted after 90 days (see the same note)'],
          ['Village circle chat messages', '7 days'],
          ['Village posts and replies', 'Until you delete them, or your account is deleted'],
          ['Record of changes to sensitive records', 'Kept, without any content, after an account is deleted'],
          ['Server and sign-in logs', 'As set by Vercel and Supabase for our account'],
          ['Backups', 'Copies may remain in our provider’s backups for a limited time after deletion'],
        ] } },
        { pending: 'Retention periods for counselling records (including whether session notes must be kept after an account is deleted), for inactive accounts, for logs and for backups. The automatic clean-up of circle messages, SOS coordinates and closed alerts must be confirmed as scheduled.' },
      ],
    },

    /* 12 ---------------------------------------------------------------------------------------- */
    {
      id: 'security',
      title: 'How we protect your information',
      blocks: [
        { list: [
          'Every connection to 4Life uses encryption in transit (HTTPS), and browsers are told to use it every time.',
          'Every table in the database has access rules, checked by the database itself, that decide who can read or change each record. Some records, such as the crisis log, note history and the record of changes, cannot be edited or deleted once written.',
          'Accounts have roles (client, therapist, administrator). Nobody can make themselves an administrator, and a therapist cannot verify their own licence.',
          'Keys to the AI and video services are kept on the server, never in the app.',
          'AI and posting features are rate-limited.',
          'Without your agreement, your SOS location is removed by the database before it is saved.',
          'Administrators use a separate dashboard that shows account details and activity as counts, never what you write in 4Life, your AI conversations, check-in ratings, counselling notes or SOS locations. Every administrator action, including looking at a person’s details or at who raised an SOS (which needs a stated reason), is written to a log that cannot be changed or deleted.',
        ] },
        { p: 'We rely on our providers’ own security for the systems they run; see their policies above. No system connected to the internet can be guaranteed to be completely secure. If we have reason to believe your information was accessed by someone unauthorised, we will notify you and the Data Protection Commission as section 31 of Act 843 requires.' },
      ],
    },

    /* 13 ---------------------------------------------------------------------------------------- */
    {
      id: 'cookies',
      title: 'Cookies and browser storage',
      blocks: [
        { p: '4Life itself does not set cookies and does not use analytics or tracking. It does use your browser’s storage, which is needed for the app to work: your sign-in session, your settings, your AI conversation and the other items listed in “Where your information is stored”. It also stores the app’s files so that emergency help opens without internet.' },
        { p: 'Outside services may use cookies or storage when you use them: YouTube when you play a video, and Google when you choose “Continue with Google”. You can clear 4Life’s storage at any time in your browser’s settings; you will then be signed out and lose your AI conversation on that device.' },
      ],
    },

    /* 14 ---------------------------------------------------------------------------------------- */
    {
      id: 'your-rights',
      title: 'Your privacy rights',
      blocks: [
        { p: 'Under Ghana’s Data Protection Act, 2012 (Act 843), you have the right to:' },
        { list: [
          '**Be informed** about how your information is processed (this policy).',
          '**Access** the information we hold about you, its purposes and its recipients (sections 32 and 35). We answer within 40 days.',
          '**Correct or delete** information that is inaccurate, irrelevant, excessive, out of date, incomplete, misleading or obtained unlawfully (section 33). You can correct most of your details yourself in Settings.',
          '**Object** to the processing of your information (section 20), and ask us to stop processing that causes or is likely to cause you unwarranted damage or distress (section 39). We answer within 21 days.',
          '**Withdraw your choices** at any time: stop sharing check-ins, unshare thought records, or turn off location sharing in an SOS.',
          '**Not receive direct marketing** without your prior written consent (section 40). 4Life does not send marketing.',
          '**Complain** to the [Data Protection Commission](' + L.dpc + ').',
        ] },
        { p: 'To exercise a right, use the controls in the app where they exist, or contact {{email}}. We may ask you to prove your identity first (section 32). Some requests cannot be granted in full, for example where the law requires us to keep a record, or where answering would reveal information about someone else; if so, we will explain why.' },
      ],
    },

    /* 15 ---------------------------------------------------------------------------------------- */
    {
      id: 'download-and-delete',
      title: 'Downloading and deleting your information',
      blocks: [
        { p: '**Download.** In Settings → Privacy and data → Download my data, you get a file (JSON format) with what our database holds about your account: your sign-in email, profile, support contacts, check-ins, goals, homework, safety plan, counselling requests and sessions, SOS alerts and location requests about you, thought records, and your Global Village activity. Therapists also get their profile, licence details, services and days off. You need to be signed in; no other check is made.' },
        { p: 'The download does not include: your AI conversation (it is on your device, not in our database); counsellors’ session notes, private notes and crisis records about you (they are the counsellor’s professional records); or information about other people. To ask for these, contact {{email}}.' },
        { pending: 'Whether clients should receive their counsellors’ notes and crisis records on request (section 35), and how.' },
        { p: '**Delete.** 4Life does not yet have a “delete my account” button. To delete your account, contact {{email}} from the email address you signed up with. When an account is deleted, its profile and the records linked to it are deleted from the database, including your check-ins, thought records, contacts, requests, sessions, SOS records and Village posts. A record that a change was made to a sensitive record (without its content) is kept, and copies may remain in backups for a limited time. Your AI conversation is on your device; clear it with “Start a new conversation” or your browser’s settings.' },
        { p: 'Two kinds of counselling record are designed to be permanent: a counsellor’s log of steps taken in a crisis, and the earlier versions of a session note that was changed after it was signed. If such records exist about you, your account cannot currently be fully deleted. We will tell you what we can delete, what we must keep and why.' },
        { pending: 'Whether these permanent counselling records must be kept after an account is deleted (and for how long, and whether in anonymised form), a secure in-app deletion process, its timeline, and how to confirm the identity of the person asking.' },
      ],
    },

    /* 16 ---------------------------------------------------------------------------------------- */
    {
      id: 'young-people',
      title: 'Children and young people',
      blocks: [
        { p: 'You must be at least **13 years old** to create a 4Life account; sign-up asks for your age, and the database refuses an age under 13. 4Life does not currently ask for a parent’s or guardian’s permission.' },
        { p: 'Ghana’s Data Protection Act treats information about a child who is under parental control as special personal data (section 37). If you are under 18, we encourage you to talk with a parent, guardian or another trusted adult about using 4Life. A parent or guardian who has a concern about a child’s information can contact {{email}}.' },
        { pending: 'How 4Life will meet the requirements for users under 18, including any need for a parent’s or guardian’s consent, and the AI providers’ 18-and-over terms. This needs legal and product review.' },
      ],
    },

    /* 17 ---------------------------------------------------------------------------------------- */
    {
      id: 'changes',
      title: 'Changes to this policy',
      blocks: [
        { p: 'We will update this policy when 4Life changes how it handles personal information, and change the “Last updated” date. For important changes, we will tell you in the app before they take effect. The current version is always at this page’s address (/privacy).' },
      ],
    },

    /* 18 ---------------------------------------------------------------------------------------- */
    {
      id: 'contact',
      title: 'Contact and complaints',
      blocks: [
        { table: { head: ['', ''], rows: [
          ['Operator', '{{operator}}'],
          ['Address', '{{address}}'],
          ['Privacy contact', '{{email}}'],
          ['Data protection contact', '{{dpo}}'],
          ['Data Protection Commission registration', '{{dpcReg}}'],
        ] } },
        { p: 'If you are not satisfied with our answer, you can complain to the Data Protection Commission of Ghana: [dataprotection.org.gh](' + L.dpc + ').' },
        { p: 'In an emergency, do not wait for an email reply: call **112**, or **193** for an ambulance.' },
      ],
    },
  ],
};

/** Has the policy got anything still to be confirmed? */
export const hasPending = (pol: Policy = POLICY) => pol.sections.some(s => s.blocks.some(b => 'pending' in b));

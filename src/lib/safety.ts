/**
 * Safety checks shared by the app and the server.
 *
 *  - assessRisk(): spots crisis or relapse language in a message, instantly and
 *    without a network, so the app can show emergency options straight away.
 *    The AI also rates risk (in any language); the app uses the higher of the two.
 *  - moderateText(): the Village's house rules — no slurs, insults aimed at others,
 *    explicit slang, contact details, or help finding drugs.
 *
 * Both are deliberately simple word rules. They catch common phrasing, not
 * everything, so they never replace a person reviewing reports.
 */

export type RiskLevel = 'none' | 'concern' | 'crisis';

export interface RiskResult {
  level: RiskLevel;
  /** Plain-language reasons, for logs and tests (never shown as a diagnosis) */
  reasons: string[];
}

const CRISIS_PATTERNS: Array<[RegExp, string]> = [
  [/\b(kill|killing|hurt|hurting|harm|harming|cut|cutting)\s+my\s*self\b/i, 'self-harm'],
  [/\b(suicide|suicidal|end (it all|my life)|take my (own )?life|want(ed)? to die|wanna die|better off dead|no reason to (live|go on)|don'?t want to (live|be alive|wake up))\b/i, 'suicidal thoughts'],
  [/\b(overdos(e|ed|ing)|took (too many|a lot of|all (my|the)) (pills|tablets|tramadol)|mixed (pills|tablets) (and|with) (alcohol|drink))\b/i, 'possible overdose'],
  [/\b(can'?t|cannot|not|isn'?t|is not) (breath(e|ing)|wak(e|ing) up)\b/i, 'breathing or consciousness'],
  [/\b(unconscious|passed out and|collapsed|having a (seizure|fit)|fitting)\b/i, 'medical emergency'],
  [/\b(going to|gonna|want to|will) (kill|hurt|stab|beat) (him|her|them|someone|somebody|my)\b/i, 'risk to others'],
];

const CONCERN_PATTERNS: Array<[RegExp, string]> = [
  [/\b(relaps(e|ed|ing)|slipped|used again|drank again|drinking again|using again|fell off)\b/i, 'relapse'],
  [/\b(strong|bad|huge|serious|intense) (craving|urge)s?\b/i, 'strong craving'],
  [/\b(going to|gonna|about to|want to|wanna|need to|need a) (use|drink|smoke|get high|get drunk|take (something|pills|tramadol)|watch porn)\b/i, 'urge to use'],
  [/\b(can'?t (stop|cope|take (it|this))|hopeless|give up|giving up)\b/i, 'not coping'],
];

/** Fast, offline check of one message. */
/** Phones often type curly apostrophes (’); the rules are written with straight ones. */
const normalise = (text: string) => (text || '').replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ');

export function assessRisk(text: string): RiskResult {
  const t = normalise(text);
  const reasons: string[] = [];
  for (const [re, why] of CRISIS_PATTERNS) if (re.test(t)) reasons.push(why);
  if (reasons.length) return { level: 'crisis', reasons };
  for (const [re, why] of CONCERN_PATTERNS) if (re.test(t)) reasons.push(why);
  return { level: reasons.length ? 'concern' : 'none', reasons };
}

const ORDER: RiskLevel[] = ['none', 'concern', 'crisis'];
/** The higher of two risk levels. */
export const maxRisk = (a: RiskLevel = 'none', b: RiskLevel = 'none'): RiskLevel => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);
export const asRiskLevel = (v: unknown): RiskLevel => (v === 'crisis' || v === 'concern' ? v : 'none');

/* ------------------------------------------------------------------ */
/* Village house rules                                                 */
/* ------------------------------------------------------------------ */

export type ModerationCategory = 'slur' | 'profanity' | 'insult' | 'harassment' | 'contact_details' | 'drug_sourcing';

export interface ModerationResult {
  ok: boolean;
  category?: ModerationCategory;
  /** A short, kind explanation the person can act on */
  reason?: string;
  /** Crisis or relapse language (posts with crisis language are held back and support is offered) */
  risk: RiskLevel;
}

const SLURS = /\b(nigg(er|a)s?|n\*gg(er|a)|chinks?|kikes?|fags?|faggots?|trann(y|ies)|shemales?|retards?|retarded|spics?|wetbacks?|gooks?|towelheads?)\b/i;

// Strong profanity and explicit slang. Plain words people in recovery need
// ("porn", "masturbation", "sex", "horny") are allowed on purpose.
const PROFANITY = /\b(fuck\w*|f\*ck\w*|fck\w*|motherf\w+|cunts?|twats?|wankers?|dickheads?|assholes?|a\$\$hole|bitch(es)?|b\*tch|whores?|sluts?|cocks?|pussy|dildos?|blowjobs?|handjobs?|cum|hentai|boobs|tits)\b/i;

// Insults aimed at someone else. Self-talk ("I feel useless") is not blocked — that is what the Village is for.
const INSULT = /\b(you|you'?re|youre|u|ur|u r|you are|he'?s|she'?s|they'?re|this guy is|op is)\s+(so |such |just |a |an |such an? |really |the most )*(idiot|idiots|stupid|moron|loser|dumb|dumbass|pathetic|useless|worthless|trash|clown|fool|scum|scumbag|disgusting|ugly|weak)\b/i;
const HOSTILE = /\b(shut up|stfu|gtfo|i hate you|nobody (loves|likes|cares about) you|waste of space)\b/i;
const HARASSMENT = /\b(kill yourself|kys|hang yourself|go die|die in a hole|you should die)\b/i;

const PHONE = /(\+?233[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4})|(\b0\d{2}[\s-]?\d{3}[\s-]?\d{4}\b)|(\b\d{9,}\b)/;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
const HANDLE = /\b(add|follow|dm|text|call|whatsapp|snap|message) me (on|at)\b/i;

const SOURCING = /\b(where (can|do|could) (i|we|you) (buy|get|cop|find) (some )?(weed|wee|tramadol|pills|coke|cocaine|heroin|meth|drugs|stuff|lean|codeine)|who (sells|has|can get)( some)? (weed|wee|tramadol|pills|coke|drugs|stuff)|(selling|for sale|got some) (weed|wee|tramadol|pills|coke|codeine)|dm me for|hit me up for|my plug)\b/i;

const RULE_TEXT: Record<ModerationCategory, string> = {
  slur: 'Slurs are not allowed in the Village. Please rewrite this without them.',
  profanity: 'Please rewrite this without strong swearing or explicit words, so the Village stays safe for everyone.',
  insult: 'Please keep it kind — talk about the words or the situation, not the person.',
  harassment: 'Telling anyone to hurt or kill themselves is never allowed here.',
  contact_details: 'Please don’t share phone numbers, emails or social handles. Staying anonymous keeps everyone safe.',
  drug_sourcing: 'Posts about buying, selling or finding drugs are not allowed in the Village.',
};

/** Check text against the Village house rules. */
export function moderateText(text: string): ModerationResult {
  const t = normalise(text).trim();
  const risk = assessRisk(t).level;
  const fail = (category: ModerationCategory): ModerationResult => ({ ok: false, category, reason: RULE_TEXT[category], risk });
  if (!t) return { ok: true, risk };
  if (HARASSMENT.test(t)) return fail('harassment');
  if (SLURS.test(t)) return fail('slur');
  if (SOURCING.test(t)) return fail('drug_sourcing');
  if (PHONE.test(t) || EMAIL.test(t) || HANDLE.test(t)) return fail('contact_details');
  if (INSULT.test(t) || HOSTILE.test(t)) return fail('insult');
  if (PROFANITY.test(t)) return fail('profanity');
  return { ok: true, risk };
}

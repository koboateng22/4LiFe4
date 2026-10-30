export interface ReligionOption {
  id: string;
  name: string;
  category: 'Abrahamic' | 'Dharmic' | 'African & Indigenous' | 'East Asian' | 'Secular & Philosophical' | 'Other';
  icon: string;
  corePrinciple: string;
  description: string;
}

export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  regionFocus?: string;
}

export interface DailyQuoteItem {
  id: string;
  religionId: string; // matches ReligionOption id or 'secular' / 'all'
  religionName: string;
  icon: string;
  title: string;
  quote: string;
  source: string;
  reflection: string;
  microAction: string;
  category: string;
}

export interface FreeLibraryResource {
  id: string;
  name: string;
  category: 'Public Domain Classics' | 'Open Digital Library' | 'Academic & Medical' | 'Free Ebooks & PDFs';
  url: string;
  searchUrlTemplate: string;
  badge: string;
  icon: string;
  description: string;
  recommendedSearchTerms: string[];
}

export const WORLD_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', regionFocus: 'Ghana & Global' },
  { code: 'ak', name: 'Akan / Twi', nativeName: 'Asante Twi / Akuapem', flag: '🇬🇭', regionFocus: 'Ghana' },
  { code: 'fat', name: 'Fante', nativeName: 'Mfantse', flag: '🇬🇭', regionFocus: 'Ghana' },
  { code: 'gaa', name: 'Ga', nativeName: 'Ga-Adangme', flag: '🇬🇭', regionFocus: 'Greater Accra, Ghana' },
  { code: 'ee', name: 'Ewe', nativeName: 'Eʋegbe', flag: '🇬🇭', regionFocus: 'Volta Region, Ghana' },
  { code: 'ha', name: 'Hausa', nativeName: 'Harshen Hausa', flag: '🇬🇭', regionFocus: 'Northern Ghana & West Africa' },
  { code: 'dag', name: 'Dagbani', nativeName: 'Dagbanli', flag: '🇬🇭', regionFocus: 'Northern Region, Ghana' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Èdè Yorùbá', flag: '🇳🇬', regionFocus: 'West Africa' },
  { code: 'ig', name: 'Igbo', nativeName: 'Ásụ̀sụ́ Ìgbò', flag: '🇳🇬', regionFocus: 'West Africa' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', flag: '🇹🇿', regionFocus: 'East Africa' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', flag: '🇪🇹', regionFocus: 'Horn of Africa' },
  { code: 'so', name: 'Somali', nativeName: 'Af-Soomaali', flag: '🇸🇴', regionFocus: 'Horn of Africa' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', flag: '🇿🇦', regionFocus: 'Southern Africa' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', regionFocus: 'Francophone Africa & Global' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', regionFocus: 'Global' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', regionFocus: 'North Africa & Middle East' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', regionFocus: 'Lusophone Africa & Global' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', regionFocus: 'Global' },
  { code: 'zh-CN', name: 'Mandarin Chinese', nativeName: '简体中文', flag: '🇨🇳', regionFocus: 'Global' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', regionFocus: 'South Asia' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', regionFocus: 'Global' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', regionFocus: 'Global' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', regionFocus: 'Global' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', regionFocus: 'Global' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', regionFocus: 'Global' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', regionFocus: 'Southeast Asia' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', regionFocus: 'Global' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱', regionFocus: 'Global' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦', regionFocus: 'Global' },
  { code: 'fil', name: 'Filipino / Tagalog', nativeName: 'Tagalog', flag: '🇵🇭', regionFocus: 'Southeast Asia' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', regionFocus: 'Southeast Asia' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰', regionFocus: 'South Asia' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩', regionFocus: 'South Asia' },
];

export const GLOBAL_LANGUAGES = WORLD_LANGUAGES;

export const WORLD_RELIGIONS: ReligionOption[] = [
  {
    id: 'christianity',
    name: 'Christianity',
    category: 'Abrahamic',
    icon: '✝️',
    corePrinciple: 'Grace, Redemption & Spiritual Renewal',
    description: 'Biblical scriptures of hope, Christ’s healing love, Psalm-based calm, and prayer for strength over temptation.',
  },
  {
    id: 'islam',
    name: 'Islam',
    category: 'Abrahamic',
    icon: '☪️',
    corePrinciple: 'Sabr (Patience), Tawbah (Renewal) & Divine Mercy',
    description: 'Quranic tranquility, Hadith wisdom on self-mastery, fasting discipline, and seeking Allah’s boundless mercy.',
  },
  {
    id: 'african_tradition',
    name: 'Traditional African / Akan Wisdom',
    category: 'African & Indigenous',
    icon: '🌍',
    corePrinciple: 'Sankofa (Learning from the Past) & Ubuntu (Community)',
    description: 'Ancestral Ghanaian proverbs, Akan moral philosophy, communal resilience, and living in balance with nature.',
  },
  {
    id: 'secular_atheist',
    name: 'Secular / Atheist (Neuroscience & Science)',
    category: 'Secular & Philosophical',
    icon: '🧠',
    corePrinciple: 'Neuroplasticity, Evidence-Based CBT & Biology',
    description: 'Cognitive behavioral science, dopamine reward circuit rewiring, somatic resets, and rational self-actualization.',
  },
  {
    id: 'buddhism',
    name: 'Buddhism',
    category: 'Dharmic',
    icon: '☸️',
    corePrinciple: 'Mindfulness, Non-Attachment & Inner Stillness',
    description: 'Dhammapada insights, Vipassana breath meditation, acknowledging urges as passing weather, and self-compassion.',
  },
  {
    id: 'hinduism',
    name: 'Hinduism',
    category: 'Dharmic',
    icon: '🕉️',
    corePrinciple: 'Dharma (Righteous Path) & Yoga of the Mind',
    description: 'Bhagavad Gita guidance on controlling the senses, Pranayama breath control, and inner spiritual peace.',
  },
  {
    id: 'judaism',
    name: 'Judaism',
    category: 'Abrahamic',
    icon: '✡️',
    corePrinciple: 'Teshuvah (Return/Repentance) & Daily Mitzvot',
    description: 'Torah wisdom, Proverbs of self-discipline, Pirkei Avot ethical character growth, and holy perseverance.',
  },
  {
    id: 'sikhism',
    name: 'Sikhism',
    category: 'Dharmic',
    icon: '🪯',
    corePrinciple: 'Chardi Kala (Rising Positive Spirit) & Service',
    description: 'Guru Granth Sahib Ji teachings on overcoming the 5 internal thieves (lust, anger, greed, attachment, ego) through seva and naam.',
  },
  {
    id: 'bahai',
    name: 'Baháʼí Faith',
    category: 'Abrahamic',
    icon: '🌟',
    corePrinciple: 'Unity of Humanity & Noble Spiritual Growth',
    description: 'Baháʼuʼlláh teachings on viewing the human soul as a mine rich in gems of invaluable capability.',
  },
  {
    id: 'jainism',
    name: 'Jainism',
    category: 'Dharmic',
    icon: '🪷',
    corePrinciple: 'Ahimsa (Gentle Non-Harm) & Self-Mastery',
    description: 'Treating one’s own body and mind with pure non-violence, gentle moderation, and clarity of intent.',
  },
  {
    id: 'taoism',
    name: 'Taoism & East Asian Philosophy',
    category: 'East Asian',
    icon: '☯️',
    corePrinciple: 'Wu Wei (Effortless Alignment) & Balance',
    description: 'Lao Tzu Tao Te Ching teachings on flowing like water around obstacles rather than fighting tension with tension.',
  },
  {
    id: 'agnostic',
    name: 'Agnostic / Free Thinker',
    category: 'Secular & Philosophical',
    icon: '🧭',
    corePrinciple: 'Curiosity, Human Dignity & Existential Meaning',
    description: 'Stoic philosophy (Marcus Aurelius, Seneca), Viktor Frankl logotherapy, and authentic personal ethics.',
  },
  {
    id: 'spiritual_universalist',
    name: 'Spiritual / Omni-Universalist',
    category: 'Other',
    icon: '✨',
    corePrinciple: 'Universal Light, Compassion & Holistic Healing',
    description: 'Harmonious synthesis of world contemplative practices, nature-grounded energy, and unconditional self-love.',
  },
];

export const RELIGIOUS_AND_SCIENTIFIC_QUOTES: DailyQuoteItem[] = [
  // Christianity
  {
    id: 'q-chr-1',
    religionId: 'christianity',
    religionName: 'Christianity',
    icon: '✝️',
    title: 'New Mercies Every Morning',
    quote: 'The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning; great is your faithfulness.',
    source: 'Lamentations 3:22-23',
    reflection: 'No matter what happened yesterday or how heavy the urge felt, today is a clean slate. You are not defined by past setbacks; God’s restorative grace meets you at the start of this brand new hour.',
    microAction: 'Take a slow, deep breath, open your palms upward, and say: "I receive grace for today, one hour at a time."',
    category: 'Renewal & Grace',
  },
  {
    id: 'q-chr-2',
    religionId: 'christianity',
    religionName: 'Christianity',
    icon: '✝️',
    title: 'Self-Control as a Fortress',
    quote: 'Like a city whose walls are broken down is a person who lacks self-control. But the fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, and self-control.',
    source: 'Proverbs 25:28 & Galatians 5:22-23',
    reflection: 'Rebuilding your life is like rebuilding the stone walls of a peaceful city. Every time you pause during an urge and refuse to act, you lay another solid stone of freedom.',
    microAction: 'Write down one healthy boundary you will protect today (e.g. keeping your phone outside the bedroom at night).',
    category: 'Discipline & Protection',
  },
  {
    id: 'q-chr-3',
    religionId: 'christianity',
    religionName: 'Christianity',
    icon: '✝️',
    title: 'Strength in Human Weakness',
    quote: 'He said to me, "My grace is sufficient for you, for my power is made perfect in weakness." Therefore I will boast all the more gladly of my weaknesses, so that the power of Christ may rest upon me.',
    source: '2 Corinthians 12:9',
    reflection: 'Recovery begins the moment we stop pretending we have to be invincible. Reaching out for help from your counselor or peer is an act of spiritual strength, not defeat.',
    microAction: 'Send a quick greeting to a trusted family member, sponsor, or recovery friend.',
    category: 'Humility & Strength',
  },

  // Islam
  {
    id: 'q-isl-1',
    religionId: 'islam',
    religionName: 'Islam',
    icon: '☪️',
    title: 'With Every Hardship Comes Ease',
    quote: 'For indeed, with hardship [will be] ease. Indeed, with hardship [will be] ease. So when you have finished [your duties], labor hard, and to your Lord direct your longing.',
    source: 'Surah Ash-Sharh (94:5-8)',
    reflection: 'Notice how Allah promises ease alongside the hardship twice. The intense discomfort of a craving is temporary; easing and tranquility are already on the horizon if you remain steadfast (Sabr).',
    microAction: 'Recite silently: "Hasbunallahu wa ni’mal wakeel" (Allah is sufficient for us, and He is the best disposer of affairs) while taking 3 slow belly breaths.',
    category: 'Hope & Patience (Sabr)',
  },
  {
    id: 'q-isl-2',
    religionId: 'islam',
    religionName: 'Islam',
    icon: '☪️',
    title: 'The Great Jihad of the Nafs (Soul)',
    quote: 'The strong person is not the one who can wrestle down another; the strong person is the one who controls himself in a moment of anger and impulse.',
    source: 'Prophet Muhammad (Peace Be Upon Him) - Sahih al-Bukhari 6114',
    reflection: 'Mastering your impulses (the inner nafs) is celebrated as the highest spiritual discipline. Every time you surf an urge, you are earning divine reward and polishing the mirror of your heart.',
    microAction: 'Drink a glass of cool water slowly in three sips, thanking Allah for purity and life.',
    category: 'Self-Restraint & Reward',
  },

  // Traditional African / Akan
  {
    id: 'q-afr-1',
    religionId: 'african_tradition',
    religionName: 'Traditional African / Akan Wisdom',
    icon: '🌍',
    title: 'Sankofa: Return and Reclaim Your Strength',
    quote: 'Se wo were fi na wosankofa a, yenkyi (It is not a taboo or failure to go back and fetch what you forgot).',
    source: 'Akan Proverb & Adinkra Philosophy of Ghana',
    reflection: 'If you had a lapse or slipped in the past, it does not mean your journey is ruined. Sankofa reminds us that we can reclaim our sacred dignity, wisdom, and peace from every past lesson.',
    microAction: 'Reflect on one positive strength from your childhood or heritage and celebrate it today.',
    category: 'Ancestral Resilience',
  },
  {
    id: 'q-afr-2',
    religionId: 'african_tradition',
    religionName: 'Traditional African / Akan Wisdom',
    icon: '🌍',
    title: 'The Power of the Collective Reed',
    quote: 'Ti koro nko agyina (One head does not hold a council / We heal in community).',
    source: 'Ashanti & Akan Proverbial Wisdom',
    reflection: 'In West African tradition, healing is woven through the community village. You do not carry the burden of recovery on your lone shoulders; lean on your elders, peers, and healers.',
    microAction: 'Share an encouraging word or post in the 4Life Anonymous Village community tab today.',
    category: 'Community & Unity',
  },

  // Secular / Atheist (Neuroscience)
  {
    id: 'q-sec-1',
    religionId: 'secular_atheist',
    religionName: 'Secular / Neuroscience',
    icon: '🧠',
    title: 'Neuroplasticity & The 15-Minute Craving Curve',
    quote: 'Neurons that fire together, wire together; neurons that fire apart, rewire towards freedom.',
    source: 'Dr. Donald Hebb & Cognitive Behavioral Neuroscience',
    reflection: 'An urge is not a moral emergency—it is simply a conditioned dopamine pathway firing in your midbrain limbic system. If you delay and do not feed the behavior, the wave will peak at 8-12 minutes and naturally subside.',
    microAction: 'Start a 10-minute timer. Engage in a physical stretch or brisk walk until the craving peak passes.',
    category: 'Brain Science & Rewiring',
  },
  {
    id: 'q-sec-2',
    religionId: 'secular_atheist',
    religionName: 'Secular / Neuroscience',
    icon: '🧠',
    title: 'The Choice Point in the Space Between',
    quote: 'Between stimulus and response there is a space. In that space is our power to choose our response. In our response lies our growth and our freedom.',
    source: 'Viktor E. Frankl, Man’s Search for Meaning',
    reflection: 'Addiction tries to eliminate the space between trigger and action into an automatic loop. By pausing for just 60 seconds of somatic grounding, you activate your prefrontal cortex and reclaim your agency.',
    microAction: 'Perform the 5-4-3-2-1 grounding exercise: look around and note 5 objects, 4 textures, 3 sounds, 2 scents, and 1 positive intention.',
    category: 'Psychological Freedom',
  },
  {
    id: 'q-sec-3',
    religionId: 'secular_atheist',
    religionName: 'Secular / Neuroscience',
    icon: '🧠',
    title: 'Dopamine Homeostasis & Pleasure-Pain Balance',
    quote: 'When we constantly flood our brain with high-dopamine hits, the brain downregulates dopamine receptors to restore homeostasis, driving cravings and anxiety. The cure is mindful dopamine resets.',
    source: 'Dr. Anna Lembke, Stanford University Professor & Author of Dopamine Nation',
    reflection: 'Real enduring joy comes from natural, slow-release dopamine: wholesome nutrition, creative mastery, deep conversations, and physical movement. Every sober day resets your brain’s baseline joy sensors.',
    microAction: 'Enjoy 15 minutes of device-free quiet time or listen to nature sounds without multitasking.',
    category: 'Biochemical Reset',
  },

  // Buddhism
  {
    id: 'q-bud-1',
    religionId: 'buddhism',
    religionName: 'Buddhism',
    icon: '☸️',
    title: 'Urges as Passing Storm Clouds (Anicca)',
    quote: 'Just as a solid rock is not shaken by the storm, even so the wise are not moved by praise or blame, craving or aversion. All conditioned things are impermanent.',
    source: 'The Dhammapada (Verse 81)',
    reflection: 'A craving is like rain over a mountain. You do not need to fight the rain or panic; you simply sit steady like the mountain and watch the clouds dissipate in their own time.',
    microAction: 'Practice 3 minutes of mindful breathing: feel the cool air entering your nostrils and warm air leaving.',
    category: 'Impermanence & Peace',
  },

  // Hinduism
  {
    id: 'q-hin-1',
    religionId: 'hinduism',
    religionName: 'Hinduism',
    icon: '🕉️',
    title: 'Mastering the Chariot of the Senses',
    quote: 'For a person who has conquered the mind, the mind is the best of friends; but for one who has failed to do so, his mind will remain the greatest enemy.',
    source: 'Bhagavad Gita (Chapter 6, Verse 6)',
    reflection: 'In Vedic philosophy, your intellect (Buddhi) is the charioteer holding the reins of the senses. When your higher awareness takes the driver’s seat, desires lose their chaotic grip.',
    microAction: 'Sit upright, place your hand on your belly, and perform 10 slow diaphragmatic breaths to center your prana (life energy).',
    category: 'Mind Mastery (Yoga)',
  },

  // Judaism
  {
    id: 'q-jud-1',
    religionId: 'judaism',
    religionName: 'Judaism',
    icon: '✡️',
    title: 'Teshuvah: You Are Never Beyond Healing',
    quote: 'Who is strong? He who conquers his evil inclination (Yetzer Hara). Do not be daunted by the enormity of the world’s grief. You are not obligated to complete the work, but neither are you free to abandon it.',
    source: 'Pirkei Avot (Ethics of the Fathers 4:1 & 2:16)',
    reflection: 'Teshuvah is the sacred principle that no matter how far someone has strayed, the door to return to wholeness and integrity is always open at this very second.',
    microAction: 'Perform one small act of kindness (Mitzvah) today—a kind text, a warm smile, or picking up litter.',
    category: 'Ethical Renewal',
  },

  // Sikhism
  {
    id: 'q-sik-1',
    religionId: 'sikhism',
    religionName: 'Sikhism',
    icon: '🪯',
    title: 'Chardi Kala: The Unconquerable Positive Spirit',
    quote: 'Nanak Naam Chardi Kala, Tere Bhaane Sarbat Da Bhala (In the remembrance of the Divine, may our spirit remain ever-optimistic, and may well-being be granted to all creation).',
    source: 'Sikh Ardas & Guru Granth Sahib Ji',
    reflection: 'Chardi Kala is a state of relentless internal dignity, courage, and optimism in the face of all trials. Wear your recovery as a royal crown of honor.',
    microAction: 'Look into the mirror and affirm: "My spirit is strong, resilient, and dedicated to life."',
    category: 'Courage & High Spirits',
  },

  // Taoism & Stoicism
  {
    id: 'q-tao-1',
    religionId: 'taoism',
    religionName: 'Taoism',
    icon: '☯️',
    title: 'Flowing Like Water (Wu Wei)',
    quote: 'Water is fluid, soft, and yielding. But water will wear away rock, which is rigid and cannot yield. What is soft is strong.',
    source: 'Lao Tzu, Tao Te Ching',
    reflection: 'Do not fight your thoughts with harsh clenching anger. Allow tension to soften, loosen your jaw and shoulders, and flow gently around triggers without resisting.',
    microAction: 'Consciously drop your shoulders away from your ears and unclench your jaw right now.',
    category: 'Gentle Harmony',
  },

  // Agnostic / Stoic
  {
    id: 'q-agn-1',
    religionId: 'agnostic',
    religionName: 'Agnostic / Stoic',
    icon: '🧭',
    title: 'The Citadel of the Inner Mind',
    quote: 'You have power over your mind - not outside events. Realize this, and you will find strength.',
    source: 'Marcus Aurelius, Meditations',
    reflection: 'Triggers, stressors, and difficult people may exist in the world around you, but they cannot force you to act. Your inner sovereignty is yours alone to govern.',
    microAction: 'List 3 things you cannot control today, and consciously choose to focus only on what you can control: your next choice.',
    category: 'Stoic Sovereignty',
  },
];

export const FREE_READING_RESOURCES: FreeLibraryResource[] = [
  {
    id: 'internet-archive',
    name: 'Internet Archive & Open Library',
    category: 'Open Digital Library',
    url: 'https://archive.org/details/books',
    searchUrlTemplate: 'https://openlibrary.org/search?q=',
    badge: '20M+ Free Books',
    icon: '🏛️',
    description: 'The world’s largest non-profit digital library. Free borrowing of best-selling self-help books, CBT workbooks, psychology classics, and recovery memoirs.',
    recommendedSearchTerms: ['Atomic Habits', 'Cognitive Behavioral Therapy', 'Addiction Recovery', 'Mindfulness', 'Stoicism', 'Trauma healing'],
  },
  {
    id: 'project-gutenberg',
    name: 'Project Gutenberg',
    category: 'Public Domain Classics',
    url: 'https://www.gutenberg.org',
    searchUrlTemplate: 'https://www.gutenberg.org/ebooks/search/?query=',
    badge: '70,000+ Classics',
    icon: '📜',
    description: 'Completely free public domain books including timeless philosophy (Marcus Aurelius, Seneca, Epictetus, William James), moral psychology, and classic literature.',
    recommendedSearchTerms: ['Meditations Marcus Aurelius', 'Epictetus', 'Seneca', 'William James Psychology', 'Self-Reliance Emerson'],
  },
  {
    id: 'libretexts-open',
    name: 'Open Textbook Library & LibreTexts',
    category: 'Academic & Medical',
    url: 'https://open.umn.edu/opentextbooks/subjects/psychology',
    searchUrlTemplate: 'https://open.umn.edu/opentextbooks?q=',
    badge: 'Peer-Reviewed Texts',
    icon: '🎓',
    description: 'High-quality open access university textbooks in Abnormal Psychology, Neurobiology of Addiction, Somatic Wellness, and Clinical Counseling.',
    recommendedSearchTerms: ['Substance Use Disorders', 'Cognitive Psychology', 'Neuroscience', 'Counseling skills'],
  },
  {
    id: 'doab-books',
    name: 'Directory of Open Access Books (DOAB)',
    category: 'Academic & Medical',
    url: 'https://www.doabooks.org',
    searchUrlTemplate: 'https://www.doabooks.org/en/search?q=',
    badge: 'Open Access Research',
    icon: '🔬',
    description: 'Over 80,000 peer-reviewed academic research books covering public health, Ghanaian health initiatives, mental well-being, and social recovery.',
    recommendedSearchTerms: ['Addiction in Africa', 'Mental health recovery', 'Public health interventions'],
  },
  {
    id: 'standard-ebooks',
    name: 'Standard Ebooks',
    category: 'Free Ebooks & PDFs',
    url: 'https://standardebooks.org',
    searchUrlTemplate: 'https://standardebooks.org/ebooks?query=',
    badge: 'Beautiful Formats',
    icon: '📱',
    description: 'Free public domain books formatted to modern typography standards for mobile readers, EPUB, and Kindle devices.',
    recommendedSearchTerms: ['Philosophy', 'Psychology', 'Ethics', 'Self-discipline'],
  }
];

export interface AtomicHabitsChapter {
  chapterNumber: number;
  title: string;
  partName: string;
  pageRange: string;
  summary: string;
  recoveryLaw: string;
  keyActionSteps: string[];
  famousQuote: string;
  practicalAppPrompt: string;
}

export const ATOMIC_HABITS_CHAPTERS: AtomicHabitsChapter[] = [
  {
    chapterNumber: 1,
    title: 'The Surprising Power of Atomic Habits',
    partName: 'The Fundamentals',
    pageRange: 'Pages 13–28',
    summary: 'Why small 1% improvements compound into massive long-term transformations. Habits are the compound interest of self-improvement.',
    recoveryLaw: 'The 1% Marginal Gains Principle',
    keyActionSteps: [
      'Focus on getting 1% better each day rather than expecting an overnight miracle.',
      'Recognize the Plateau of Latent Potential: progress is often hidden before it breaks through.',
      'Forget about outcome goals; focus on designing your daily recovery systems.'
    ],
    famousQuote: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    practicalAppPrompt: 'What is one tiny 2-minute habit you can do every morning to protect your sobriety?',
  },
  {
    chapterNumber: 2,
    title: 'How Your Habits Shape Your Identity (and Vice Versa)',
    partName: 'The Fundamentals',
    pageRange: 'Pages 29–42',
    summary: 'The deepest form of behavior change is identity change. Shift from "I am trying to quit" to "I am someone who values clean health and mental clarity."',
    recoveryLaw: 'Identity-Based Habits',
    keyActionSteps: [
      'Every action you take is a vote for the type of person you wish to become.',
      'Decide the type of person you want to be, then prove it to yourself with small wins.',
      'Replace self-sabotaging labels with empowering, present-tense affirmations.'
    ],
    famousQuote: 'The goal is not to read a book, the goal is to become a reader. The goal is not to run a marathon, the goal is to become a runner. The goal is to become a sober, free human.',
    practicalAppPrompt: 'What identity statement will you claim today (e.g. "I am a person who treats my body with sacred respect")?',
  },
  {
    chapterNumber: 3,
    title: 'How to Build Better Habits in 4 Simple Steps',
    partName: 'The Fundamentals',
    pageRange: 'Pages 43–58',
    summary: 'Deconstructs the habit loop: Cue, Craving, Response, Reward. The 4 Laws of Behavior Change are: Make it Obvious, Make it Attractive, Make it Easy, Make it Satisfying.',
    recoveryLaw: 'The 4 Laws of Habit Formation',
    keyActionSteps: [
      'Identify your negative cues (people, places, loneliness, stress).',
      'Understand the craving: what emotional relief was your brain looking for?',
      'Substitute a healthy response that delivers authentic dopamine.'
    ],
    famousQuote: 'Until you make the unconscious conscious, it will direct your life and you will call it fate.',
    practicalAppPrompt: 'Map your most frequent craving: What is the cue? What is the feeling? What healthy substitute will you use?',
  },
  {
    chapterNumber: 4,
    title: 'The 1st Law: Make It Obvious (The Habit Scorecard & Implementation Intentions)',
    partName: 'The 1st Law (Cue)',
    pageRange: 'Pages 59–88',
    summary: 'Awareness comes before change. Use the Habit Scorecard to audit daily routines and write Implementation Intentions: "I will [BEHAVIOR] at [TIME] in [LOCATION]."',
    recoveryLaw: 'Make It Obvious / Habit Stacking',
    keyActionSteps: [
      'Use the Habit Scorecard to mark habits as positive (+), negative (-), or neutral (=).',
      'Habit Stacking formula: After [CURRENT HABIT], I will [NEW RECOVERY HABIT].',
      'Design your environment: remove substance triggers and place calming cues in plain sight.'
    ],
    famousQuote: 'Environment is the invisible hand that shapes human behavior.',
    practicalAppPrompt: 'Create a habit stack: "After I pour my morning water, I will do 60 seconds of 4-7-8 breathwork."',
  },
  {
    chapterNumber: 5,
    title: 'The 2nd Law: Make It Attractive (Temptation Bundling & Dopamine Loops)',
    partName: 'The 2nd Law (Craving)',
    pageRange: 'Pages 89–126',
    summary: 'Dopamine drives anticipation. Pair an action you NEED to do for recovery with an action you WANT to do (Temptation Bundling). Join a community where your desired behavior is the normal behavior.',
    recoveryLaw: 'Make It Attractive / Social Tribe',
    keyActionSteps: [
      'Temptation bundling: Listen to your favorite podcast ONLY while exercising or cooking a healthy meal.',
      'Surround yourself with people whose habits you want to cultivate (our 4Life Village).',
      'Reframe difficult tasks: shift from "I have to stay sober" to "I get to wake up clear-headed."'
    ],
    famousQuote: 'We imitate the habits of three groups: the close, the many, and the powerful.',
    practicalAppPrompt: 'Which recovery friend or book club member will you connect with this week?',
  },
  {
    chapterNumber: 6,
    title: 'The 3rd Law: Make It Easy (The 2-Minute Rule & Law of Least Effort)',
    partName: 'The 3rd Law (Response)',
    pageRange: 'Pages 127–168',
    summary: 'Human nature follows the path of least resistance. Reduce friction for good recovery rituals (make it easy) and increase friction for temptations (make it hard). Use the Two-Minute Rule: when starting a new habit, scale it down to under 2 minutes.',
    recoveryLaw: 'Make It Easy / The 2-Minute Rule',
    keyActionSteps: [
      'Prime your environment for future success (e.g. keep workout clothes ready, delete trigger apps).',
      'Master the decisive moments that determine your entire evening.',
      'Use commitment devices: lock away triggers, activate browser ad-blockers, and set emergency contacts.'
    ],
    famousQuote: 'Standardize before you optimize. You can’t improve a habit that doesn’t exist.',
    practicalAppPrompt: 'How can you make getting tempted harder (increasing friction) today?',
  },
  {
    chapterNumber: 7,
    title: 'The 4th Law: Make It Satisfying (Habit Trackers & The Cardinal Rule)',
    partName: 'The 4th Law (Reward)',
    pageRange: 'Pages 169–208',
    summary: 'What is immediately rewarded is repeated. What is immediately punished is avoided. Use visual habit trackers (Don’t Break the Chain) and celebrate immediate non-substance rewards.',
    recoveryLaw: 'Make It Satisfying / Habit Trackers',
    keyActionSteps: [
      'Use a visual tracker (like our 4Life Days Clean streak & gratitude tree) to see your progress.',
      'Never miss twice: If you have a difficult moment, get right back on track on the very next decision.',
      'Create a recovery habit contract with an accountability partner or dietician.'
    ],
    famousQuote: 'The first mistake is never the one that ruins you. It is the spiral of repeated mistakes that follows.',
    practicalAppPrompt: 'What wholesome reward (herbal tea, favorite music, nature walk) will you give yourself for completing today sober?',
  },
  {
    chapterNumber: 8,
    title: 'Advanced Tactics: The Goldilocks Rule & The Sorites Paradox',
    partName: 'Mastery',
    pageRange: 'Pages 209–256',
    summary: 'How to maintain peak motivation by working on tasks of just-manageable difficulty (The Goldilocks Zone). The danger of good habits is falling into mindless complacency.',
    recoveryLaw: 'The Goldilocks Rule of Recovery',
    keyActionSteps: [
      'Stay in the Goldilocks Zone: not too easy (boredom) and not too difficult (anxiety).',
      'The greatest threat to success is not failure but boredom. Learn to love the daily practice.',
      'Conduct annual and weekly reflections to audit what worked and what needs adjustment.'
    ],
    famousQuote: 'Professionals stick to the schedule; amateurs let life get in the way.',
    practicalAppPrompt: 'How will you stay engaged with your daily recovery routines even when motivation feels low?',
  }
];

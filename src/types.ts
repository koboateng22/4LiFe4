export type BeliefSystem = 'theist' | 'secular' | 'undecided';

export type TriageCategory = 'substance' | 'porn' | 'social_media' | 'porn_social' | 'anger' | 'overeating' | 'general';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface UserContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relationship?: string;
  relation?: string;
  isPrimary: boolean;
  autoDailyCheckin?: boolean;
  autoPromptEnabled?: boolean;
}

export interface UserProfile {
  id?: string;
  name: string;
  nickname: string;
  email?: string;
  password?: string;
  isGuest?: boolean;
  age: number | string;
  gender?: string;
  belief: BeliefSystem;
  religion?: string;
  language?: string;
  religionType?: 'Christian' | 'Muslim' | 'Traditional' | 'Secular / Agnostic' | 'Other';
  region: string;
  address?: string;
  userAvatar: string;
  // Security
  isVerified?: boolean;
  pinCode?: string;
  pin?: string;
  // AI Companion
  aiName: string;
  aiAvatar: string;
  voiceTone?: 'empathic' | 'grounding' | 'firm_coach';
  // Permissions
  permData?: boolean;
  permScreen?: boolean;
  permAds?: boolean;
  permBrowserBlock?: boolean;
  // Emergency
  contacts: UserContact[];
  /** Agreed to share their location with their counsellor when they press SOS */
  shareLocationInCrisis?: boolean;
  emsSync?: boolean;
  // Wearables & Schedule
  watchConnected?: boolean;
  deviceModel?: string;
  hr: number;
  stressLevel?: number;
  calmTriggers: string[];
  reminderTime: string;
  sleepStart: string;
  wakeTime: string;
  // Shielding State
  shieldingActive?: boolean;
  windDownActive: boolean;
  adBlockCount: number;
  nsfwBlockCount: number;
  customBlockedUrls?: string[];
  currentTriage: TriageCategory;
  currentCraving: number; // 1-10
  currentMood: string;
  sobrietyStreakDays: number;
  completedCheckinsCount: number;
  loginStreakDays?: number;
  lastLoginDate?: string;
  lastCheckinDate?: string;
  dailyRewardsClaimed?: {
    login?: boolean;
    checkin?: boolean;
    calm?: boolean;
    date?: string;
  };
  pointsHistory?: Array<{
    id: string;
    activity: string;
    points: number;
    timestamp: string;
    type: 'login' | 'checkin' | 'calm' | 'game' | 'milestone';
  }>;
  // Gamification stats
  mindfulnessMinutes?: number;
  calmingGamesPlayed?: number;
  xpPoints?: number;
  // UI Customization & Accessibility
  theme?: 'light' | 'dark';
  fontSize?: 'sm' | 'md' | 'lg' | 'xl';
  // Therapy Reminders
  therapyReminderEnabled?: boolean;
  therapyReminderTime?: string;
  therapyDays?: string[];
  autoContactSms?: boolean;
}

export interface AuthAccount {
  id: string;
  email: string;
  password?: string;
  pin: string;
  name: string;
  nickname: string;
  profile: UserProfile;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
  isAudio?: boolean;
  cbtPrompt?: string;
  suggestedActions?: string[];
  model?: string;
  mode?: string;
  /** Set when the AI already wrote this reply in the person's language (Google Translate then leaves it alone) */
  lang?: string;
}

export interface CounselorMatch {
  id: string;
  name: string;
  title: string;
  specialty: string;
  location: string;
  region: string;
  feeGHS: number;
  feeUSD: number;
  subsidized: boolean;
  rating: number;
  availableNow: boolean;
  avatar: string;
  phone: string;
  bio: string;
}

export interface DieticianMatch {
  id: string;
  name: string;
  title: string;
  specialty: string;
  location: string;
  feeGHS: number;
  rating: number;
  availableNow: boolean;
  avatar: string;
  phone: string;
  bio: string;
}

export interface DailyDrop {
  id: string;
  day: number;
  beliefType: 'theist' | 'secular';
  title: string;
  category: string;
  quote: string;
  source: string;
  reflection: string;
  microAction: string;
  videoUrl?: string;
  readTime: string;
  isCompleted?: boolean;
}

export interface BookItem {
  id: string;
  title: string;
  author: string;
  category: 'Addiction & Recovery' | 'Habits & Brain' | 'Trauma & Somatics' | 'Nutrition & Overeating' | 'Spiritual Serenity';
  coverEmoji: string;
  rating: number;
  pages: number;
  readTime: string;
  summary: string;
  keyTakeaways: string[];
  readerQuote: string;
  pdfAvailable?: boolean;
  pdfTitle?: string;
  pdfFileUrl?: string;
  freeLibraryUrl?: string;
}

export interface DeveloperFeedbackItem {
  id: string;
  userName: string;
  userEmail?: string;
  category: 'Question for Developers' | 'Feature Request' | 'CBT Therapy Feedback' | 'Technical Bug' | 'Ghana Support';
  subject: string;
  message: string;
  timestamp: string;
  status: 'Received by Dev Team' | 'In Review' | 'Answered';
  developerResponse?: string;
  answeredBy?: string;
}

export interface BookClub {
  id: string;
  title: string;
  category: string;
  book: BookItem;
  schedule: string;
  membersCount: number;
  currentChapter: string;
  weeklyPrompt: string;
  discussions: Array<{
    id: string;
    authorNickname: string;
    authorAvatar: string;
    text: string;
    timestamp: string;
    likes: number;
  }>;
}

export interface LeaderboardUser {
  id: string;
  nickname: string;
  avatar: string;
  streakDays: number;
  mindfulnessMinutes: number;
  gamesPlayed: number;
  dropsCompleted: number;
  xpPoints: number;
  badge: string;
  tier: 'Diamond' | 'Gold' | 'Silver' | 'Bronze';
  isCurrentUser?: boolean;
}

export interface WorkoutPlan {
  id: string;
  title: string;
  duration: string;
  intensity: 'Gentle' | 'Moderate' | 'Energizing';
  dopamineBenefit: string;
  description: string;
  caloriesBurn: string;
  steps: string[];
}

export interface HealthyFoodSwap {
  id: string;
  cravingName: string;
  unhealthyTrigger: string;
  healthyAlternative: string;
  dopamineScience: string;
  prepTip: string;
  caloriesSaved: string;
  icon: string;
}

export interface ForumPost {
  id: string;
  category: 'substance' | 'porn_social' | 'anger' | 'overeating' | 'general';
  authorNickname: string;
  authorAvatar: string;
  authorStreak: string;
  title: string;
  content: string;
  timestamp: string;
  likes: number;
  userLiked?: boolean;
  repliesCount: number;
  tags: string[];
  replies?: Array<{
    id: string;
    authorNickname: string;
    authorAvatar: string;
    content: string;
    timestamp: string;
  }>;
}

export interface VirtualConference {
  id: string;
  title: string;
  category: string;
  facilitator: string;
  facilitatorRole: string;
  timeLabel: string;
  dateLabel: string;
  activeAttendees: number;
  isLive: boolean;
  topic: string;
  description: string;
}

export interface EmergencyCenter {
  id: string;
  name: string;
  /** clinic, pharmacy, police and fire_station come from OpenStreetMap (see lib/osm.ts) */
  type: 'hospital' | 'rehab' | 'ems_station' | 'helpline' | 'clinic' | 'pharmacy' | 'police' | 'fire_station';
  region: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  hours: string;
  bedsAvailable: boolean;
  emergencyHotline?: string;
}

export type ActiveTab = 'dashboard' | 'chat' | 'community' | 'emergency_map' | 'profile_settings';


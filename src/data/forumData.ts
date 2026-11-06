import { msg } from '../i18n';
/** Avatar choices offered during onboarding. */
export const USER_AVATARS = [
  { id: 'u1', emoji: '🌱', label: msg('Sprout of Hope'), bg: 'bg-pri-soft text-pri-text' },
  { id: 'u2', emoji: '🌿', label: msg('Resilient Palm'), bg: 'bg-pri-soft text-pri-ink' },
  { id: 'u3', emoji: '🦅', label: msg('Rising Eagle'), bg: 'bg-pri-soft text-pri-text' },
  { id: 'u4', emoji: '🕊️', label: msg('Peace Dove'), bg: 'bg-pri-soft text-pri-ink border border-line' },
  { id: 'u5', emoji: '🌻', label: msg('Sun Flower'), bg: 'bg-warn-soft text-warn' },
  { id: 'u6', emoji: '🌊', label: msg('Calm Waters'), bg: 'bg-info-soft text-info' },
  { id: 'u7', emoji: '🛡️', label: msg('Shield Bearer'), bg: 'bg-muted text-ink' },
  { id: 'u8', emoji: '⭐', label: msg('Guiding Light'), bg: 'bg-pri-soft text-pri-ink' },
];

export const AI_AVATARS = [
  { id: 'ai1', emoji: '🌿', name: 'Kofi-AI', desc: msg('Calm and patient. Good at slowing things down.'), color: 'bg-pri text-[#fff]' },
  { id: 'ai2', emoji: '✨', name: 'Akosua', desc: msg('Warm and encouraging. Good at reframing thoughts.'), color: 'bg-pri text-[#fff]' },
  { id: 'ai3', emoji: '🛡️', name: 'Nova', desc: msg('Direct and practical. Good at planning ahead.'), color: 'bg-pri text-[#fff]' },
  { id: 'ai4', emoji: '🕊️', name: 'Serene', desc: msg('Gentle. Good at breathing and calming the body.'), color: 'bg-pri text-[#fff]' },
];

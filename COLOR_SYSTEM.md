# 4Life Universal UI/UX Color System

One colour system is used across every screen, pop-up and theme. Colours are CSS variables in `src/index.css`, exposed as Tailwind classes (`bg-surface`, `text-ink`, `bg-pri` …). Dark mode switches by adding the `dark` class to `<html>`.

- **Primary:** Deep emerald — #047857 (buttons) / #065F46 (hover and links)
- **Primary dark:** Forest — #064E3B / #022C22
- **Neutral:** Slate — #F8FAFC / #0F172A
- **Surface:** White in light mode; deep forest in dark mode
- **Accent:** Amber — #F59E0B for attention and progress
- **Danger:** Rose — #E11D48 for SOS, errors and destructive actions
- **Info:** Sky — #0284C7 for information

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #F8FAFC | #07110B | Page background |
| `surface` | #FFFFFF | #0C2014 | Cards |
| `muted` | #F1F5F9 | #10281A | Quiet fills and tracks |
| `line` | #E2E8F0 | #1B3A28 | Borders |
| `ink` / `ink-2` / `ink-3` | #0F172A / #475569 / #64748B | #F8FAFC / #CBD5E1 / #94A3B8 | Text |
| `pri` | #047857 | #047857 | Main buttons, active menu item |
| `pri-text` | #065F46 | #10B981 | Links and accent icons |
| `pri-soft` / `pri-ink` | #D1FAE5 / #064E3B | #0B3322 / #A7F3D0 | Selected states |
| `warn-bar` / `warn` | #F59E0B / #B45309 | #F59E0B / #FBBF24 | Progress fills / warning text |
| `danger` | #E11D48 | #E11D48 | SOS and danger only |
| `info` | #0369A1 | #38BDF8 | Information text |
| `night` | #022C22 | #041B14 | Wind-down card |

## Rules
- Where a headline shade is too faint to read as text on white (emerald-600, amber-500, sky-600), text uses the darker shade of the same colour.
- Use `pri` for a screen's one main action only.
- Never use `danger` for decoration.
- Purple, violet and indigo classes are folded into emerald, so no competing colours appear.

## Where it applies
Every screen uses these tokens — sign-in and sign-up, setup, Home, AI therapy, the Global Village, Instant EMS, Settings, the therapist workspace and all pop-ups — so light and dark mode switch cleanly everywhere.

Maps can't read CSS variables, so their pins use the same colours as fixed values: hospital `#E11D48` (danger), ambulance `#B45309` (warn), recovery centre `#047857` (pri), helpline `#0369A1` (info), you `#0F172A` (ink). The light/dark preview tiles in Setup also use fixed values on purpose, to show each theme.

/**
 * Original illustrations for the sign-in screen, drawn in the 4Life colour
 * system (forest, emerald, amber, rose, sky). They sit on the dark forest
 * panel, so colours are fixed values rather than theme tokens.
 * All are decorative (aria-hidden); the slide text says the same thing.
 */
import React from 'react';

import { t } from '../../i18n';
const C = {
  forest: '#022c22',
  forestMid: '#064e3b',
  emerald: '#10b981',
  emeraldLight: '#34d399',
  mint: '#a7f3d0',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  cream: '#fef3c7',
  rose: '#fb7185',
  roseDeep: '#e11d48',
  sky: '#38bdf8',
  skyLight: '#7dd3fc',
  white: '#ffffff',
};

const Svg: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <svg viewBox="0 0 320 240" className={className || 'h-full w-full'} aria-hidden="true" focusable="false">
    {children}
  </svg>
);

/** A seedling in a pot being watered — small daily care helps a mind grow. */
export const GrowIllustration: React.FC = () => (
  <Svg>
    <circle cx="160" cy="128" r="96" fill={C.forestMid} opacity="0.55" />
    {/* watering can */}
    <g className="auth-bob">
      <g transform="rotate(-24 238 62)">
        <rect x="206" y="44" width="60" height="38" rx="10" fill={C.sky} />
        <path d="M206 54 L170 40 L168 48 L204 64 Z" fill={C.sky} />
        <ellipse cx="166" cy="44" rx="7" ry="10" fill={C.skyLight} />
        <path d="M262 50 q22 0 18 26" stroke={C.skyLight} strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
      {[0, 1, 2, 3].map(i => (
        <circle key={i} className="auth-drop" style={{ animationDelay: `${i * 0.38}s` }} cx={150 + i * 7} cy={72 + (i % 2) * 6} r="3" fill={C.skyLight} />
      ))}
    </g>
    {/* plant */}
    <g className="auth-sway">
      <path d="M160 176 C160 150 158 132 160 104" stroke={C.emeraldLight} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M160 140 C138 136 124 122 122 104 C142 106 156 118 160 140 Z" fill={C.emerald} />
      <path d="M160 126 C182 122 196 108 198 90 C178 92 164 104 160 126 Z" fill={C.emeraldLight} />
      <path d="M160 108 C150 100 148 90 152 80 C162 86 164 98 160 108 Z" fill={C.mint} />
      <g transform="translate(118 98)">
        {[0, 72, 144, 216, 288].map(a => (
          <ellipse key={a} cx="0" cy="-7" rx="4.5" ry="7" fill={C.white} transform={`rotate(${a})`} />
        ))}
        <circle r="4" fill={C.amber} />
      </g>
      <g transform="translate(202 86)">
        {[0, 72, 144, 216, 288].map(a => (
          <ellipse key={a} cx="0" cy="-6" rx="4" ry="6" fill={C.rose} transform={`rotate(${a})`} />
        ))}
        <circle r="3.5" fill={C.cream} />
      </g>
    </g>
    {/* pot */}
    <path d="M124 172 H196 L186 214 H134 Z" fill={C.amber} />
    <rect x="118" y="164" width="84" height="14" rx="5" fill={C.amberLight} />
    {/* sparkles */}
    <path d="M70 70 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" fill={C.amberLight} opacity="0.9" />
    <circle cx="258" cy="168" r="5" fill={C.mint} opacity="0.8" />
    <circle cx="62" cy="168" r="3" fill={C.skyLight} />
  </Svg>
);

/** People of different backgrounds in a circle around a heart — the Global Village. */
export const VillageIllustration: React.FC = () => {
  const people = [
    { skin: '#8d5524', hair: '#1f1309', shirt: C.emerald },
    { skin: '#e0ac69', hair: '#3b2a1a', shirt: C.amber },
    { skin: '#5c3a21', hair: '#0f0a06', shirt: C.sky },
    { skin: '#c68642', hair: '#2a1a0e', shirt: C.rose },
    { skin: '#f1c27d', hair: '#7a4a1e', shirt: C.mint },
    { skin: '#a0522d', hair: '#120b06', shirt: C.amberLight },
  ];
  return (
    <Svg>
      <circle cx="160" cy="120" r="98" fill={C.forestMid} opacity="0.55" />
      <circle cx="160" cy="120" r="70" fill="none" stroke={C.mint} strokeOpacity="0.35" strokeWidth="2" strokeDasharray="4 8" className="animate-spin-slow" style={{ transformOrigin: '160px 120px', animationDuration: '40s' }} />
      {people.map((p, i) => {
        const a = (i / people.length) * Math.PI * 2 - Math.PI / 2;
        const x = 160 + Math.cos(a) * 70;
        const y = 120 + Math.sin(a) * 70;
        return (
          <g key={i} className="auth-bob" style={{ animationDelay: `${i * 0.4}s` }}>
            <path d={`M${x - 17} ${y + 26} q17 -20 34 0 v6 h-34 Z`} fill={p.shirt} />
            <circle cx={x} cy={y + 2} r="13" fill={p.skin} />
            <path d={`M${x - 13} ${y} q2 -16 13 -16 q11 0 13 16 q-6 -8 -13 -8 q-7 0 -13 8 Z`} fill={p.hair} />
            <path d={`M${x - 5} ${y + 7} q5 4 10 0`} stroke={C.forest} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
        );
      })}
      <g className="animate-heart-pulse" style={{ transformOrigin: '160px 122px', animationDuration: '2.4s' }}>
        <path d="M160 140 C132 120 136 98 150 98 C156 98 160 103 160 107 C160 103 164 98 170 98 C184 98 188 120 160 140 Z" fill={C.rose} />
      </g>
    </Svg>
  );
};

/** A phone ready to call 112, and a location pin sending out pulses. */
export const HelpIllustration: React.FC = () => (
  <Svg>
    <circle cx="160" cy="120" r="98" fill={C.forestMid} opacity="0.55" />
    <g transform="translate(96 44)">
      <rect width="84" height="150" rx="16" fill={C.forest} stroke={C.mint} strokeOpacity="0.5" strokeWidth="2" />
      <rect x="10" y="16" width="64" height="104" rx="8" fill={C.forestMid} />
      <text x="42" y="58" textAnchor="middle" fontFamily="Nunito, ui-rounded, sans-serif" fontWeight="800" fontSize="26" fill={C.white}>
        112
      </text>
      <rect x="18" y="74" width="48" height="26" rx="13" fill={C.roseDeep} />
      <path d="M36 82 q4 10 12 10 l2 -3 l-4 -3 l-2 2 q-4 -2 -5 -6 l2 -2 l-3 -4 Z" fill={C.white} />
      <circle cx="42" cy="134" r="6" fill="none" stroke={C.mint} strokeOpacity="0.6" strokeWidth="2" />
    </g>
    <g transform="translate(222 96)">
      <circle r="18" fill={C.amber} opacity="0.5" className="auth-ring" />
      <circle r="18" fill={C.amber} opacity="0.5" className="auth-ring" style={{ animationDelay: '1.1s' }} />
      <path d="M0 26 C-18 6 -18 -16 0 -16 C18 -16 18 6 0 26 Z" fill={C.amberLight} transform="translate(0 -6)" />
      <circle cx="0" cy="-12" r="6" fill={C.forest} />
    </g>
    <path d="M182 120 C200 112 206 104 214 100" stroke={C.mint} strokeWidth="2.5" strokeDasharray="5 6" fill="none" className="auth-draw" />
    <path d="M60 60 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" fill={C.skyLight} />
  </Svg>
);

/** Therapist: a calm dashboard with check-in trends. */
export const CaseloadIllustration: React.FC = () => (
  <Svg>
    <circle cx="160" cy="120" r="98" fill={C.forestMid} opacity="0.55" />
    <g className="auth-bob">
      <rect x="62" y="48" width="196" height="140" rx="16" fill={C.forest} stroke={C.mint} strokeOpacity="0.4" strokeWidth="2" />
      <rect x="78" y="64" width="80" height="10" rx="5" fill={C.mint} opacity="0.7" />
      {[0, 1, 2].map(i => (
        <g key={i} transform={`translate(78 ${88 + i * 30})`}>
          <circle cx="10" cy="10" r="10" fill={[C.amber, C.sky, C.rose][i]} />
          <rect x="26" y="4" width={[58, 48, 64][i]} height="7" rx="3.5" fill={C.white} opacity="0.8" />
          <rect x="26" y="14" width="36" height="5" rx="2.5" fill={C.mint} opacity="0.45" />
        </g>
      ))}
      <path d="M176 156 L192 136 L206 144 L222 116 L240 124" stroke={C.emeraldLight} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" className="auth-draw" />
      <circle cx="240" cy="124" r="5" fill={C.amberLight} />
      <rect x="176" y="70" width="64" height="26" rx="8" fill={C.forestMid} />
      <text x="208" y="88" textAnchor="middle" fontFamily="Nunito, ui-rounded, sans-serif" fontWeight="800" fontSize="13" fill={C.mint}>
        {t("3 today")}
      </text>
    </g>
  </Svg>
);

/** Therapist: a map with a client at risk joined to the nearest hospital. */
export const SafetyIllustration: React.FC = () => (
  <Svg>
    <circle cx="160" cy="120" r="98" fill={C.forestMid} opacity="0.55" />
    <rect x="58" y="46" width="204" height="148" rx="18" fill={C.forest} stroke={C.mint} strokeOpacity="0.4" strokeWidth="2" />
    {[78, 108, 138, 168].map(y => (
      <path key={y} d={`M58 ${y} H262`} stroke={C.mint} strokeOpacity="0.12" strokeWidth="2" />
    ))}
    {[98, 148, 198, 238].map(x => (
      <path key={x} d={`M${x} 46 V194`} stroke={C.mint} strokeOpacity="0.12" strokeWidth="2" />
    ))}
    <path d="M58 150 C110 130 150 170 262 110" stroke={C.sky} strokeOpacity="0.5" strokeWidth="8" fill="none" />
    <path d="M110 140 C150 120 180 100 214 86" stroke={C.white} strokeWidth="3" strokeDasharray="6 6" fill="none" className="auth-draw" />
    <g transform="translate(110 140)">
      <circle r="14" fill={C.roseDeep} opacity="0.5" className="auth-ring" />
      <circle r="11" fill={C.roseDeep} stroke={C.white} strokeWidth="3" />
    </g>
    <g transform="translate(214 86)">
      <rect x="-14" y="-14" width="28" height="28" rx="7" fill={C.white} />
      <path d="M-3 -9 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 v-6 h6 Z" fill={C.roseDeep} />
    </g>
    <rect x="150" y="150" width="96" height="30" rx="10" fill={C.forestMid} />
    <text x="198" y="170" textAnchor="middle" fontFamily="Nunito, ui-rounded, sans-serif" fontWeight="800" fontSize="12" fill={C.mint}>
      {t("4.2 km · 9 min")}
    </text>
  </Svg>
);

/** Therapist: a session checklist being ticked off. */
export const NotesIllustration: React.FC = () => (
  <Svg>
    <circle cx="160" cy="120" r="98" fill={C.forestMid} opacity="0.55" />
    <g className="auth-bob">
      <rect x="96" y="46" width="128" height="160" rx="14" fill={C.cream} />
      <rect x="132" y="36" width="56" height="20" rx="8" fill={C.amber} />
      {['Check in', 'Review homework', 'Thought record', 'Plan next steps'].map((_, i) => (
        <g key={i} transform={`translate(112 ${76 + i * 30})`}>
          <rect width="18" height="18" rx="5" fill={i < 3 ? C.emerald : C.white} stroke={C.forestMid} strokeOpacity="0.3" />
          {i < 3 && <path d="M4 9 l4 4 l7 -8" stroke={C.white} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" className="auth-draw" style={{ animationDelay: `${0.4 + i * 0.5}s` }} />}
          <rect x="28" y="5" width={[54, 72, 64, 60][i]} height="8" rx="4" fill={C.forestMid} opacity={i < 3 ? 0.35 : 0.7} />
        </g>
      ))}
    </g>
    <g transform="translate(236 168) rotate(30)">
      <rect x="-5" y="-40" width="10" height="56" rx="3" fill={C.sky} />
      <path d="M-5 16 L0 28 L5 16 Z" fill={C.cream} />
    </g>
  </Svg>
);

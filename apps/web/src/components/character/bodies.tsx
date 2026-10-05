
/**
 * The five human silhouettes (PHASE-2 §2.2 / §2.5).
 *
 * Each character is built from ONE dominant shape, exactly one signature colour from the
 * PHASE-1 palette, and one prop that says what they do — that is what makes the cast readable at
 * 48px. Reference grid: viewBox 96×120, head r=20 at cy=32, body from y=54, 2px ink stroke,
 * round joins everywhere (§2.5.4).
 */
const INK = '#0f172a';
const SKIN = {
  raha: '#f3d3b8',
  kamran: '#e8b98f',
  simin: '#f6dcc4',
  bahram: '#d9a173',
  golnar: '#efcba8',
} as const;


const stroke = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const };

/** 🔬 دکتر رها — مستطیل گِرد (ثبات و دقت)، روپوش سفید، شال بنفش استادی، عینک */
export function RahaBody() {
  return (
    <g>
      {/* coat: the dominant rounded rectangle */}
      <path d="M26 112 V74 a10 10 0 0 1 10 -10 h24 a10 10 0 0 1 10 10 v38 Z" fill="#ffffff" {...stroke} />
      <path d="M48 64 v48" stroke="#e2e8f0" strokeWidth={2} />
      {/* mastery scarf */}
      <path d="M36 62 q12 10 24 0 l-4 22 q-8 5 -16 0 Z" fill="#6d28d9" {...stroke} />
      {/* head */}
      <circle cx={48} cy={32} r={20} fill={SKIN.raha} {...stroke} />
      {/* hair + bun */}
      <path d="M28 30 a20 20 0 0 1 40 0 q-6 -8 -20 -8 t-20 8Z" fill="#3f2a1d" {...stroke} />
      <circle cx={68} cy={22} r={6} fill="#3f2a1d" {...stroke} />
      {/* glasses: the "evidence" prop */}
      <g fill="none" stroke={INK} strokeWidth={2}>
        <rect x={36} y={26} width={11} height={9} rx={4} />
        <rect x={51} y={26} width={11} height={9} rx={4} />
        <path d="M47 30 h4" />
      </g>
    </g>
  );
}

/** 🧳 کامران — دایره (گرما)، کت خاکی، کیف سمپل نارنجی */
export function KamranBody() {
  return (
    <g>
      {/* rounded, almost circular torso */}
      <path d="M22 112 v-34 a26 26 0 0 1 52 0 v34 Z" fill="#c8b48c" {...stroke} />
      <path d="M48 60 v52" stroke="#a8936b" strokeWidth={2} />
      {/* sample bag strap + bag (the field coach's prop) */}
      <path d="M34 66 l28 18" stroke="#ff9600" strokeWidth={5} strokeLinecap="round" />
      <rect x={56} y={82} width={20} height={16} rx={5} fill="#ff9600" {...stroke} />
      <circle cx={48} cy={32} r={20} fill={SKIN.kamran} {...stroke} />
      <path d="M29 28 a20 20 0 0 1 38 0 q-8 -6 -19 -6 t-19 6Z" fill="#9ca3af" {...stroke} />
      {/* moustache: warmth, not authority */}
      <path d="M40 42 q8 5 16 0" fill="none" stroke="#9ca3af" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/** 🤨 سیمین — مثلث گِرد (چالشِ نرم)، مانتو آبی دوئل */
export function SiminBody() {
  return (
    <g>
      {/* the rounded triangle: wide shoulders, soft corners — a challenge, not an enemy */}
      <path d="M48 56 l26 56 H22 Z" fill="#1cb0f6" {...stroke} strokeLinejoin="round" />
      <path d="M48 56 l10 56 H38 Z" fill="#0f8fd6" opacity={0.35} />
      <circle cx={48} cy={32} r={20} fill={SKIN.simin} {...stroke} />
      {/* sharp bob */}
      <path d="M27 34 a21 21 0 0 1 42 0 v6 q-6 -12 -21 -12 t-21 12 Z" fill="#1f2937" {...stroke} />
      {/* the raised brow is her signature — drawn as part of the hairline */}
      <path d="M37 24 q5 -3 10 -1" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

/** 🏃 بهرام — مستطیل گِرد + مثلث (پویایی)، تی‌شرت زرد امتیاز */
export function BahramBody() {
  return (
    <g>
      <path d="M30 112 V78 l18 -16 l18 16 v34 Z" fill="#ffc800" {...stroke} />
      {/* arms out: he is always moving */}
      <path d="M30 80 l-12 12 M66 80 l12 12" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <circle cx={18} cy={92} r={5} fill={SKIN.bahram} {...stroke} />
      <circle cx={78} cy={92} r={5} fill={SKIN.bahram} {...stroke} />
      <circle cx={48} cy={32} r={20} fill={SKIN.bahram} {...stroke} />
      {/* cap */}
      <path d="M28 26 a20 20 0 0 1 40 0 Z" fill="#1cb0f6" {...stroke} />
      <path d="M28 26 h-9 a4 4 0 0 0 4 5 h5 Z" fill="#1cb0f6" {...stroke} />
    </g>
  );
}

/** 🌿 بی‌بی گلنار — دایره + مستطیل گِرد (چادر)، تسبیح زرد */
export function GolnarBody() {
  return (
    <g>
      {/* chador: one soft rounded shape around head and shoulders */}
      <path d="M48 8 a26 26 0 0 1 26 26 v22 q0 12 -10 16 H32 q-10 -4 -10 -16 V34 A26 26 0 0 1 48 8Z" fill="#8edcae" {...stroke} />
      {/* face oval inside the chador */}
      <ellipse cx={48} cy={36} rx={16} ry={18} fill={SKIN.golnar} {...stroke} />
      {/* prayer beads: tradition, respected (C-04) */}
      <g fill="#ffc800" stroke={INK} strokeWidth={1.5}>
        <circle cx={34} cy={78} r={3} />
        <circle cx={39} cy={84} r={3} />
        <circle cx={45} cy={88} r={3} />
        <circle cx={52} cy={88} r={3} />
        <circle cx={58} cy={84} r={3} />
      </g>
      <path d="M22 96 q26 20 52 0 v16 H22 Z" fill="#7cc99b" {...stroke} />
    </g>
  );
}

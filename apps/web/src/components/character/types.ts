/**
 * PHASE-2 §2.5.3 — the single character contract (decision D-100: layered multi-state SVG,
 * not Rive). If Rive is ever adopted, this interface does not change; only the renderer does.
 */
export type CharacterId = 'seyla' | 'raha' | 'kamran' | 'simin' | 'bahram' | 'golnar';

export type Expression =
  | 'idle'
  | 'happy'
  | 'celebrate'
  | 'thinking'
  | 'worried'
  | 'proud'
  | 'nudge'
  | 'empathy';

export const EXPRESSIONS: readonly Expression[] = [
  'idle',
  'happy',
  'celebrate',
  'thinking',
  'worried',
  'proud',
  'nudge',
  'empathy',
] as const;

export interface CharacterProps {
  id: CharacterId;
  expression?: Expression;
  /** When present, a speech bubble renders and announces politely (DoD §2.8). */
  speech?: string;
  size?: 'sm' | 'md' | 'lg'; // 48 / 96 / 160 px
  /** Seyla only: the crest grows with the mastery level (0–3) — the mascot is the progress bar. */
  mastery?: 0 | 1 | 2 | 3;
  className?: string;
}

/** Persian accessible name per character (§2.8: role="img" + Persian aria-label). */
export const CHARACTER_NAME: Record<CharacterId, string> = {
  seyla: 'سیلا، راهنمای سیلانه‌سبز',
  raha: 'دکتر رها، دانشمند محصول',
  kamran: 'کامران، مربی میدان',
  simin: 'سیمین، مشتری مردد',
  bahram: 'بهرام، همکار رقیب',
  golnar: 'بی‌بی گلنار، حافظهٔ سنتی',
};

/** One signature colour per character, taken from the PHASE-1 palette (§2.5.4: no sharing). */
export const SIGNATURE: Record<CharacterId, string> = {
  seyla: '#7048a3', // official mascot purple (mascot-only colour)
  raha: '#6d28d9', // mastery purple
  kamran: '#ff9600', // action orange
  simin: '#1cb0f6', // duel blue
  bahram: '#ffc800', // reward yellow
  golnar: '#8edcae', // soft green
};

export const SIZE_PX: Record<NonNullable<CharacterProps['size']>, number> = {
  sm: 48,
  md: 96,
  lg: 160,
};

/** Where a face sits inside the 96×120 reference grid (PHASE-2 §2.5.1). */
export interface FaceGeometry {
  /** half the distance between the two eyes */
  spread: number;
  eyeY: number;
  mouthY: number;
  ink?: string;
  scale?: number;
}

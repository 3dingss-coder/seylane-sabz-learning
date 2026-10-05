import { cn } from '@/lib/cn';

/**
 * Design v3 (PHASE-0.5 D-104): the official purple mascot on a mint halo.
 * Purple belongs to the mascot only — it is never a UI color; the mint halo is the
 * harmony bridge between the green/white house and the purple character.
 */
export function MascotAvatar({
  size = 40,
  className,
  alt = 'سیلا — راهنمای سیلانه‌سبز لرنینگ',
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-pill bg-mint ring-2 ring-mascot/15',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="/brand/mascot.png"
        alt={alt}
        width={size}
        height={size}
        className="size-full rounded-pill object-contain p-0.5"
      />
    </span>
  );
}

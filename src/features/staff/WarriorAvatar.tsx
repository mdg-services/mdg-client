import { cn } from '@/lib/cn';

/** The first letter of up to two words of a name. Written by characters, so a Devanagari name is not cut mid-letter. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((p) => Array.from(p)[0]?.toUpperCase() ?? '').join('');
  return letters || '?';
}

/**
 * A warrior's initials in a circle. Its own small part (the shared `Avatar` sizes its letters in
 * pixels, which do not follow a phone set to large text): the circle is 2.75rem, the letters are
 * `text-meta`, both in rem. It is decoration. The name is always written beside it, so it carries no
 * spoken label of its own (the shared one repeated the name a second time).
 */
export function WarriorAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full bg-surface-2 text-meta font-semibold text-text-muted',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

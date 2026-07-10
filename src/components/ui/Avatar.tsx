import * as React from 'react';

import { cn } from '@/lib/cn';

export interface AvatarProps {
  name?: string;
  src?: string | null;
  size?: number;
  className?: string;
}

function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({ name, src, size = 36, className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-text-muted font-medium select-none',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      aria-label={name}
    >
      {src ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img
          src={src}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  );
}

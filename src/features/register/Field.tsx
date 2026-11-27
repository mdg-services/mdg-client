import * as React from 'react';

/**
 * One form field as the sign-up screens draw it: the label above the box (never a
 * placeholder alone, which vanishes the moment someone types), an optional
 * "(optional)" after it, and under the box the error in words, or a hint while
 * there is no error. Shared by the outlet and the New Pump Guide forms so the two
 * read the same.
 */
export function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: string;
  /** A line under the box, shown while there is no error to show instead. */
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-subheading text-text" htmlFor={id}>
        {label}
        {optional ? <span className="ml-1 font-normal text-text-subtle">{optional}</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-meta text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-meta text-text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

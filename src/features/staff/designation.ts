import { useT } from '@/lib/i18n';

/**
 * A warrior's role is free text the owner typed ("Attendant"), in one language. The common words are
 * said in the reader's own language; anything else is shown exactly as typed (a name or a role we do
 * not know is never guessed at).
 */
const ROLE_KEYS: Record<string, string> = {
  attendant: 'warr.role.attendant',
  'pump attendant': 'warr.role.attendant',
  manager: 'warr.role.manager',
  supervisor: 'warr.role.supervisor',
  cashier: 'warr.role.cashier',
  operator: 'warr.role.operator',
  helper: 'warr.role.helper',
  cleaner: 'warr.role.cleaner',
  driver: 'warr.role.driver',
  accountant: 'warr.role.accountant',
};

/** The message key for a role word, or null when it is not one we know. */
export function roleKey(designation: string): string | null {
  return ROLE_KEYS[designation.trim().toLowerCase().replace(/\s+/g, ' ')] ?? null;
}

/** Returns a function that says a role in the reader's language, and as typed when it is unknown. */
export function useRoleLabel(): (designation: string) => string {
  const t = useT();
  return (designation) => {
    const key = roleKey(designation);
    return key ? t(key as Parameters<typeof t>[0]) : designation;
  };
}

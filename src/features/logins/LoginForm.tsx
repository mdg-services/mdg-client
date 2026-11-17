import { Eye, EyeOff, Lock } from 'lucide-react';
import * as React from 'react';

import { Button, Input, useToast } from '@/components/ui';
import { portalSaveErrorKey } from '@/features/chat/portalLoginView';
import { useSaveLogin } from '@/hooks/api/useLogins';
import { useT, type MessageKey } from '@/lib/i18n';

import type { LoginPortal } from './types';

/**
 * The form for ONE login: ID, password, Save. Used to fill one that is not in yet, to put
 * a new password where the portal stopped accepting the old one, and to change one that is
 * saved (opened with both fields filled in, so only what differs is typed).
 *
 * It saves over the same route as the chat's box, so the same rules hold. What was typed
 * leaves this component's state the moment the save has gone through.
 */
export function LoginForm({
  portal,
  initialUsername = '',
  initialPassword = '',
  lead,
  onSaved,
  onCancel,
}: {
  portal: LoginPortal;
  initialUsername?: string;
  initialPassword?: string;
  /** One line above the fields. */
  lead?: string;
  onSaved: () => void;
  /** Present when the form was opened over a saved login: a way back out. */
  onCancel?: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const save = useSaveLogin();
  const ids = React.useId();
  const [username, setUsername] = React.useState(initialUsername);
  const [password, setPassword] = React.useState(initialPassword);
  const [show, setShow] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<MessageKey | null>(null);

  const busy = save.isPending;
  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorKey(null);
    try {
      await save.mutateAsync({ portal, username: username.trim(), password });
      setPassword('');
      setUsername('');
      setShow(false);
      toast.success(t('logins.savedToast'));
      onSaved();
    } catch (err) {
      const key = portalSaveErrorKey(err);
      setErrorKey(key);
      // The password the portal had turned away is no use again; any other failure keeps what was typed.
      if (key === 'chat.portalSameAsRefused') setPassword('');
    } finally {
      save.reset();
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} autoComplete="off" noValidate className="flex flex-col gap-3">
      {lead ? <p className="text-sm font-medium text-text">{lead}</p> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-id`} className="text-xs font-medium text-text-muted">
          {t('chat.portalUserId')}
        </label>
        <Input
          id={`${ids}-id`}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          enterKeyHint="next"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-pw`} className="text-xs font-medium text-text-muted">
          {t('chat.portalPassword')}
        </label>
        <div className="relative">
          <Input
            id={`${ids}-pw`}
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={500}
            enterKeyHint="done"
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t('chat.portalHidePassword') : t('chat.portalShowPassword')}
            aria-pressed={show}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full text-text-muted active:bg-surface-2"
          >
            {show ? (
              <EyeOff width={18} strokeWidth={1.75} aria-hidden />
            ) : (
              <Eye width={18} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>
      {errorKey ? (
        <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong">
          {t(errorKey)}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button type="submit" fullWidth loading={busy} disabled={!canSubmit} leftIcon={<Lock width={16} strokeWidth={2} aria-hidden />}>
          {t('chat.portalSave')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" fullWidth onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { createEmployeeSchema } from '@dk/shared/schemas';

import { Button, Input } from '@/components/ui';
import { useAddEmployee } from '@/hooks/api/useEmployees';
import { useT } from '@/lib/i18n';

type AddEmployeeValues = {
  name: string;
  phone?: string;
  designation?: string;
};

/**
 * Inline-expand "add a worker" form (mirrors the Profile invite form): a single
 * required field (name) plus two optional ones — no piled-on fields (adoption
 * rule 10). On success the parent collapses it; the toast + invalidate live in
 * the mutation hook.
 */
export function AddEmployeeForm({
  dealerId,
  onDone,
  onCancel,
}: {
  dealerId: string | undefined;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const addEmployee = useAddEmployee(dealerId);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AddEmployeeValues>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { name: '', phone: '', designation: '' },
  });

  const onSubmit = handleSubmit((values) => {
    const name = values.name.trim();
    if (!name) {
      setError('name', { message: t('staff.form.nameRequired') });
      return;
    }
    addEmployee.mutate(
      {
        name,
        phone: values.phone?.trim() || undefined,
        designation: values.designation?.trim() || undefined,
      },
      {
        onSuccess: () => {
          reset({ name: '', phone: '', designation: '' });
          onDone();
        },
      },
    );
  });

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-2 p-3"
      noValidate
    >
      <Input
        placeholder={t('staff.form.namePlaceholder')}
        autoFocus
        autoCapitalize="words"
        autoComplete="off"
        spellCheck={false}
        invalid={!!errors.name}
        {...register('name')}
      />
      {errors.name ? (
        <p className="text-xs text-danger">
          {errors.name.message || t('staff.form.nameRequired')}
        </p>
      ) : null}

      <Input
        type="tel"
        inputMode="tel"
        placeholder={t('staff.form.phonePlaceholder')}
        {...register('phone')}
      />

      <Input
        placeholder={t('staff.form.designationPlaceholder')}
        autoCapitalize="words"
        spellCheck={false}
        {...register('designation')}
      />

      <div className="mt-1 flex gap-2">
        <Button type="submit" size="md" loading={addEmployee.isPending} fullWidth>
          {t('staff.form.save')}
        </Button>
        <Button type="button" size="md" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

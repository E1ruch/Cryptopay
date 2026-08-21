'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { MEMBERSHIP_ROLES } from '@cryptopay/shared';
import {
  useInviteMember,
  useOrganization,
  useOrganizationMembers,
  useUpdateOrganization,
  type MembershipView,
} from '@/hooks/use-organization';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';

export default function SettingsPage() {
  const t = useTranslations('dashboard.settings');

  return (
    <div>
      <h1 className="mb-6 animate-fade-up text-2xl font-semibold tracking-tight text-ink-900">{t('title')}</h1>
      <div className="max-w-lg space-y-4">
        <OrganizationSection />
        <MembersSection />
      </div>
    </div>
  );
}

function OrganizationSection() {
  const t = useTranslations('dashboard.settings');
  const tErrors = useTranslations('errors');
  const { data: organization, isLoading, error } = useOrganization();
  const updateOrganization = useUpdateOrganization();
  const { toast } = useToast();
  const [name, setName] = useState('');

  useEffect(() => {
    if (organization) setName(organization.name);
  }, [organization]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateOrganization.mutateAsync(name.trim(), {
      onSuccess: () => toast(t('saved'), 'success'),
      onError: (err) => toast(err instanceof ApiError ? err.message : t('saved'), 'danger'),
    });
  }

  if (isLoading) {
    return <Skeleton className="h-52 animate-fade-up" />;
  }

  if (error || !organization) {
    return (
      <Card className="animate-fade-up">
        <p className="text-sm text-ink-500">{error instanceof ApiError ? error.message : tErrors('generic')}</p>
      </Card>
    );
  }

  const dirty = name.trim() !== organization.name && name.trim().length >= 2;

  return (
    <Card className="animate-fade-up">
      <h2 className="mb-4 text-base font-semibold text-ink-900">{t('organizationTitle')}</h2>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="settings-org-name">{t('name')}</Label>
          <Input
            id="settings-org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={120}
            required
          />
        </div>
        <div className="flex items-center justify-between rounded-control bg-ink-50 px-3.5 py-3 text-sm">
          <span className="text-ink-500">{t('slug')}</span>
          <span className="font-mono text-ink-700">{organization.slug}</span>
        </div>
        <Button type="submit" size="sm" disabled={!dirty || updateOrganization.isPending}>
          {updateOrganization.isPending ? t('saving') : t('save')}
        </Button>
      </form>
    </Card>
  );
}

const ROLE_TONE: Record<MembershipView['role'], BadgeTone> = {
  OWNER: 'brand',
  ADMIN: 'success',
  MEMBER: 'neutral',
};

function MembersSection() {
  const t = useTranslations('dashboard.settings');
  const { data: members, isLoading } = useOrganizationMembers();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <Card className="animate-fade-up [animation-delay:60ms]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink-900">{t('membersTitle')}</h2>
        {!formOpen && (
          <Button size="sm" variant="secondary" onClick={() => setFormOpen(true)}>
            {t('invite')}
          </Button>
        )}
      </div>

      {formOpen && <InviteMemberForm onDone={() => setFormOpen(false)} />}

      {isLoading && !members && <Skeleton className="h-24" />}

      {members && members.length === 0 && <p className="text-sm text-ink-500">{t('membersEmpty')}</p>}

      {members && members.length > 0 && (
        <div className="-mx-6 divide-y divide-ink-100 sm:-mx-8">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-3 px-6 py-3 sm:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600">
                  {member.user.email[0]?.toUpperCase()}
                </span>
                <p className="truncate text-sm text-ink-800">{member.user.email}</p>
              </div>
              <Badge tone={ROLE_TONE[member.role]}>{t(`role_${member.role}`)}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function InviteMemberForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('dashboard.settings');
  const inviteMember = useInviteMember();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipView['role']>('MEMBER');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await inviteMember.mutateAsync(
      { email: email.trim(), role },
      {
        onSuccess: () => {
          toast(t('inviteSuccess'), 'success');
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mb-4 space-y-4 rounded-control bg-ink-50 p-4" noValidate>
      <p className="text-sm font-medium text-ink-900">{t('inviteTitle')}</p>
      <div>
        <Label htmlFor="invite-email">{t('email')}</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          required
        />
      </div>
      <div>
        <Label htmlFor="invite-role">{t('role')}</Label>
        <Select
          id="invite-role"
          value={role}
          onChange={(value) => setRole(value as MembershipView['role'])}
          options={MEMBERSHIP_ROLES.map((r) => ({ value: r, label: t(`role_${r}`) }))}
        />
      </div>

      {inviteMember.error && (
        <p role="alert" className="rounded-control bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600">
          {inviteMember.error instanceof ApiError ? inviteMember.error.message : t('inviteTitle')}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={inviteMember.isPending}>
          {inviteMember.isPending ? t('inviting') : t('invite')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

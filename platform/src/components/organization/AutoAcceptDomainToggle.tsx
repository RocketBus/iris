'use client';

import { useState } from 'react';

import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/useTranslation';

interface AutoAcceptDomainToggleProps {
  organizationId: string;
  initialEnabled: boolean;
  initialDomain: string | null;
}

interface UpdateResponse {
  settings?: {
    enabled?: boolean;
    domain?: string | null;
  };
  message?: string;
}

export function AutoAcceptDomainToggle({
  organizationId,
  initialEnabled,
  initialDomain,
}: AutoAcceptDomainToggleProps) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(Boolean(initialEnabled));
  const [domain, setDomain] = useState<string | null>(initialDomain);
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async (nextValue: boolean) => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    const previousEnabled = enabled;

    setEnabled(nextValue);

    try {
      const response = await fetch(`/api/organizations/${organizationId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          autoAcceptDomainMembers: nextValue,
        }),
      });

      const data: UpdateResponse = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || t('settings.autoAcceptDomain.error'));
      }

      const updatedEnabled = Boolean(data.settings?.enabled);
      const updatedDomain = data.settings?.domain ?? null;

      setEnabled(updatedEnabled);
      setDomain(updatedDomain);

      toast.success(
        updatedEnabled
          ? t('settings.autoAcceptDomain.enabledToast', { domain: updatedDomain ?? '' })
          : t('settings.autoAcceptDomain.disabledToast')
      );
    } catch (error) {
      setEnabled(previousEnabled);
      toast.error(
        error instanceof Error ? error.message : t('settings.autoAcceptDomain.error')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const domainLabel = domain
    ? t('settings.autoAcceptDomain.domainLabel', { domain })
    : t('settings.autoAcceptDomain.domainUnavailable');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.autoAcceptDomain.title')}</CardTitle>
        <CardDescription>
          {t('settings.autoAcceptDomain.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="auto-accept-domain-toggle">
              {t('settings.autoAcceptDomain.toggleLabel')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {enabled
                ? t('settings.autoAcceptDomain.enabledDescription', { domain: domain || t('settings.autoAcceptDomain.domainUnavailable') })
                : t('settings.autoAcceptDomain.disabledDescription')}
            </p>
          </div>
          <Switch
            id="auto-accept-domain-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isSaving}
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>{t('settings.autoAcceptDomain.denylistNotice')}</span>
        </div>

        <Badge variant={enabled ? 'default' : 'outline'} className="w-fit">
          {domainLabel}
        </Badge>
      </CardContent>
    </Card>
  );
}



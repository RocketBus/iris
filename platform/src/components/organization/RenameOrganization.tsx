'use client';

import { useState } from 'react';

import { Loader2, Save, Building2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/useTranslation';

interface RenameOrganizationProps {
  organizationId: string;
  currentName: string;
  currentSlug: string;
  onSuccess?: () => void;
}

export function RenameOrganization({ 
  organizationId, 
  currentName, 
  currentSlug,
  onSuccess 
}: RenameOrganizationProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error(t('settings.renameOrganization.nameRequired'));
      return;
    }

    if (name.trim() === currentName) {
      toast.info(t('settings.renameOrganization.noChanges'));
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('settings.renameOrganization.error'));
      }

      toast.success(t('settings.renameOrganization.success'));
      
      // Call success callback to refresh data
      if (onSuccess) {
        onSuccess();
      } else {
        // Refresh the page to update navbar and other components
        window.location.reload();
      }
    } catch (error) {
      console.error('Error renaming organization:', error);
      toast.error(error instanceof Error ? error.message : t('settings.renameOrganization.error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.renameOrganization.title')}</CardTitle>
        <CardDescription>
          {t('settings.renameOrganization.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="organization-name">
              {t('settings.renameOrganization.nameLabel')}
            </Label>
            <Input
              id="organization-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.renameOrganization.namePlaceholder')}
              disabled={isSaving}
              minLength={2}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.renameOrganization.nameHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="organization-slug">
              {t('settings.renameOrganization.slugLabel')}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="organization-slug"
                type="text"
                value={currentSlug}
                disabled
                className="bg-muted"
              />
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.renameOrganization.slugHint')}
            </p>
          </div>

          <Button type="submit" disabled={isSaving || name.trim() === currentName}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.renameOrganization.saving')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t('settings.renameOrganization.saveButton')}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}


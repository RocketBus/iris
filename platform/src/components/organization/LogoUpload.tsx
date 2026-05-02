'use client';

import { useState, useRef } from 'react';

import Image from 'next/image';

import { Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { DEFAULT_LOGO_URL } from '@/lib/constants';

interface LogoUploadProps {
  organizationId: string;
  currentLogoUrl?: string | null;
  organizationName: string;
}

export function LogoUpload({ organizationId, currentLogoUrl, organizationName }: LogoUploadProps) {
  const { t } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultLogoUrl = DEFAULT_LOGO_URL;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload an image file (JPEG, PNG, GIF, WebP, or SVG)');
      return;
    }

    // Validate file size (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size exceeds 5MB limit');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/organizations/${organizationId}/logo`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to upload logo');
      }

      if (data.logoUrl) {
        setPreviewUrl(data.logoUrl);
        toast.success(t('settings.logoUpload.success'));
        // Refresh the page to update the navbar
        window.location.reload();
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error(error instanceof Error ? error.message : t('settings.logoUpload.error'));
      // Reset preview on error
      setPreviewUrl(currentLogoUrl || null);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const displayLogoUrl = previewUrl || defaultLogoUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.logoUpload.title')}</CardTitle>
        <CardDescription>
          {t('settings.logoUpload.description', { name: organizationName })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Current Logo Preview */}
          <div className="flex items-center gap-6">
            <div className="relative h-20 w-20 flex-shrink-0 border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
              {displayLogoUrl ? (
                <Image
                  src={displayLogoUrl}
                  alt={`${organizationName} logo`}
                  fill
                  className="object-contain p-2"
                  unoptimized
                />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{t('settings.logoUpload.currentLogo')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {currentLogoUrl ? t('settings.logoUpload.customLogo') : t('settings.logoUpload.defaultLogo')}
              </p>
            </div>
          </div>

          {/* Upload Button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
              onChange={handleFileSelect}
              className="hidden"
              id="logo-upload"
              disabled={isUploading}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.logoUpload.uploading')}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {currentLogoUrl ? t('settings.logoUpload.changeLogo') : t('settings.logoUpload.uploadLogo')}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {t('settings.logoUpload.recommendedSize')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


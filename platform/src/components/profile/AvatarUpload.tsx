'use client';

import { useState, useRef } from 'react';

import { Upload, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import { getUserAvatarUrl } from '@/lib/avatar';
import { getGravatarUrl } from '@/lib/gravatar';

interface AvatarUploadProps {
  currentAvatarUrl: string | null;
  userEmail: string;
  userName: string;
}

export function AvatarUpload({ currentAvatarUrl, userEmail, userName }: AvatarUploadProps) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get avatar URL with Gravatar fallback
  const avatarUrl = getUserAvatarUrl(currentAvatarUrl, userEmail);
  const gravatarUrl = getGravatarUrl(userEmail, 160, 'mp');

  // Get initials for fallback
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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

      const response = await fetch('/api/users/avatar', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to upload avatar');
      }

      if (data.avatarUrl) {
        setPreviewUrl(data.avatarUrl);
        toast.success(t('profile.avatarUpload.success'));
        // Refresh the page to update the session
        window.location.reload();
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error(error instanceof Error ? error.message : t('profile.avatarUpload.error'));
      // Reset preview on error
      setPreviewUrl(currentAvatarUrl);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploading(true);
    try {
      const response = await fetch('/api/users/avatar', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove avatar');
      }

      setPreviewUrl(null);
      toast.success(t('profile.avatarUpload.removeSuccess'));
      window.location.reload();
    } catch (error) {
      console.error('Error removing avatar:', error);
      toast.error(error instanceof Error ? error.message : t('profile.avatarUpload.removeError'));
    } finally {
      setIsUploading(false);
    }
  };

  const displayAvatarUrl = previewUrl || avatarUrl || gravatarUrl;

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className="h-20 w-20">
          {displayAvatarUrl ? (
            <AvatarImage src={displayAvatarUrl} alt={userName} />
          ) : null}
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
            onChange={handleFileSelect}
            className="hidden"
            id="avatar-upload"
            disabled={isUploading}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('profile.avatarUpload.uploading')}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {currentAvatarUrl ? t('profile.changeAvatar') : t('profile.uploadAvatar')}
                </>
              )}
            </Button>
            {currentAvatarUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemoveAvatar}
                disabled={isUploading}
              >
                <XCircle className="mr-2 h-4 w-4" />
                {t('profile.removeAvatar')}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {currentAvatarUrl 
            ? t('profile.avatarStatus.custom') 
            : avatarUrl 
              ? t('profile.avatarStatus.gravatar') 
              : t('profile.avatarStatus.none')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('profile.avatarUpload.recommendedSize')}
        </p>
      </div>
    </div>
  );
}


'use client';

import { useEffect, useState } from 'react';

import { 
  User, 
  Lock, 
  ShieldCheck, 
  Settings, 
  Trash2,
  Moon,
  Sun,
  Monitor,
  Loader2
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { getUserProfileAction, updateProfileAction, updatePreferencesAction } from '@/actions/profile-actions';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { ChangePasswordDialog } from '@/components/profile/ChangePasswordDialog';
import { DeleteAccountDialog } from '@/components/profile/DeleteAccountDialog';
import { Disable2FADialog } from '@/components/profile/Disable2FADialog';
import { Enable2FADialog } from '@/components/profile/Enable2FADialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/hooks/useTranslation';

interface UserProfileData {
  name: string;
  email: string;
  emailVerified: boolean;
  accountCreated: string;
  lastLogin: string;
  preferences: {
    language: 'pt-BR' | 'en-US' | 'es-ES';
    theme: 'light' | 'dark' | 'system';
  };
  themePreference: 'light' | 'dark' | 'system';
  mfaEnabled: boolean;
  avatarUrl: string | null;
  organizationCount: number;
  isOwnerOfAnyOrg: boolean;
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [name, setName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const result = await getUserProfileAction();
      if (result?.data?.success && result.data.data) {
        setProfileData(result.data.data);
        setName(result.data.data.name);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error(t('profile.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim() || name === profileData?.name) {
      setIsEditingName(false);
      setName(profileData?.name || '');
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateProfileAction({ name });
      if (result?.data?.success) {
        toast.success(t('profile.updateSuccess'));
        setIsEditingName(false);
        await loadProfile();
      }
    } catch {
      toast.error(t('profile.updateError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    // Update theme immediately for better UX
    setTheme(newTheme);
    
    // Update profile data state to reflect change
    if (profileData) {
      setProfileData({
        ...profileData,
        themePreference: newTheme,
        preferences: {
          ...profileData.preferences,
          theme: newTheme,
        },
      });
    }
    
    try {
      await updatePreferencesAction({
        language: profileData?.preferences.language || 'pt-BR',
        theme: newTheme,
      });
      toast.success(t('preferences.appearance.updated'));
    } catch (error) {
      console.error('Error updating theme:', error);
      // Revert on error
      setTheme(profileData?.themePreference || 'system');
      toast.error(t('common.error'));
    }
  };

  const handleLanguageChange = async (newLanguage: 'pt-BR' | 'en-US' | 'es-ES') => {
    try {
      const result = await updatePreferencesAction({
        language: newLanguage,
        theme: profileData?.preferences.theme || 'system',
      });
      
      if (result?.data?.success) {
        setProfileData((prev) => 
          prev ? { ...prev, preferences: { ...prev.preferences, language: newLanguage } } : null
        );
        toast.success(t('preferences.language.updated'));
        // Force reload to update all translations
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        throw new Error('Failed to update language preference');
      }
    } catch (error) {
      console.error('Error updating language:', error);
      toast.error(t('common.error'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!profileData) {
    return <div>{t('profile.loadError')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t('profile.pageTitle')}</h1>
        <p className="text-muted-foreground">
          {t('profile.pageSubtitle')}
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            {t('profile.title')}
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {t('security.title')}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t('preferences.title')}
          </TabsTrigger>
          <TabsTrigger value="account" className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            {t('account.title')}
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('profile.profileInformation')}</CardTitle>
              <CardDescription>
                {t('profile.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <AvatarUpload
                currentAvatarUrl={profileData.avatarUrl}
                userEmail={profileData.email}
                userName={profileData.name}
              />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">{profileData.name}</h3>
                <p className="text-muted-foreground">{profileData.email}</p>
              </div>

              <div className="space-y-4 border-t pt-6">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('profile.fullName')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!isEditingName}
                    />
                    {isEditingName ? (
                      <>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setIsEditingName(false);
                            setName(profileData.name);
                          }}
                          disabled={isSaving}
                        >
                          {t('profile.cancel')}
                        </Button>
                        <Button onClick={handleSaveName} disabled={isSaving}>
                          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {t('profile.save')}
                        </Button>
                      </>
                    ) : (
                      <Button onClick={() => setIsEditingName(true)}>
                        {t('profile.edit')}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t('profile.email')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="email"
                      value={profileData.email}
                      disabled
                    />
                    {profileData.emailVerified && (
                      <Badge variant="secondary">{t('profile.verified')}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('security.password.title')}</CardTitle>
              <CardDescription>
                {t('security.password.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordDialog>
                <Button variant="outline">
                  {t('security.password.changeButton')}
                </Button>
              </ChangePasswordDialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('security.twoFactor.title')}</CardTitle>
              <CardDescription>
                {t('security.twoFactor.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  <span>{t('security.twoFactor.status')}</span>
                </div>
                {profileData.mfaEnabled ? (
                  <Badge variant="default" className="bg-green-500">
                    {t('security.twoFactor.enabled')}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t('security.twoFactor.disabled')}</Badge>
                )}
              </div>

              {profileData.mfaEnabled ? (
                <Disable2FADialog>
                  <Button variant="outline">
                    {t('security.twoFactor.disableButton')}
                  </Button>
                </Disable2FADialog>
              ) : (
                <Enable2FADialog>
                  <Button variant="outline">
                    {t('security.twoFactor.enableButton')}
                  </Button>
                </Enable2FADialog>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('preferences.appearance.title')}</CardTitle>
              <CardDescription>
                {t('preferences.appearance.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={profileData?.themePreference || theme || 'system'} onValueChange={handleThemeChange}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer">
                    <Sun className="h-4 w-4" />
                    {t('preferences.appearance.light')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer">
                    <Moon className="h-4 w-4" />
                    {t('preferences.appearance.dark')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="system" id="system" />
                  <Label htmlFor="system" className="flex items-center gap-2 cursor-pointer">
                    <Monitor className="h-4 w-4" />
                    {t('preferences.appearance.system')}
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('preferences.language.title')}</CardTitle>
              <CardDescription>
                {t('preferences.language.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select 
                value={profileData.preferences.language} 
                onValueChange={handleLanguageChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">🇧🇷 {t('preferences.language.ptBR')}</SelectItem>
                  <SelectItem value="en-US">🇺🇸 {t('preferences.language.enUS')}</SelectItem>
                  <SelectItem value="es-ES">🇪🇸 {t('preferences.language.esES')}</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('account.info.title')}</CardTitle>
              <CardDescription>
                {t('account.info.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('account.info.accountCreated')}</span>
                <span>{new Date(profileData.accountCreated).toLocaleDateString()}</span>
              </div>
              {profileData.lastLogin && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('account.info.lastLogin')}</span>
                  <span>{new Date(profileData.lastLogin).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('account.info.organizations')}</span>
                <span>{profileData.organizationCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-destructive">{t('account.danger.title')}</CardTitle>
              <CardDescription>
                {t('account.danger.deleteDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteAccountDialog isOwnerOfAnyOrg={profileData?.isOwnerOfAnyOrg || false}>
                <Button variant="destructive" className="w-full" disabled={profileData?.isOwnerOfAnyOrg}>
                  {t('account.danger.deleteButton')}
                </Button>
              </DeleteAccountDialog>
              {profileData?.isOwnerOfAnyOrg && (
                <p className="text-sm text-muted-foreground mt-2">
                  {t('account.danger.ownerWarning')}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Languages, Palette } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UiLanguage, useI18n } from '@/i18n';
import { UiTheme, useTheme } from '@/theme';

export function SystemSettings() {
  const { language, setLanguage, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);

  const handleLanguageChange = async (next: string) => {
    if (next === language) return;

    setSaving(true);
    try {
      await setLanguage(next as UiLanguage);
    } catch (error) {
      console.error('[SystemSettings] Failed to save interface language:', error);
      toast.error(t('Failed to save interface language'), {
        description: t('Please try again.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = async (next: string) => {
    if (next === theme) return;
    setSavingTheme(true);
    try {
      await setTheme(next as UiTheme);
    } catch (error) {
      console.error('[SystemSettings] Failed to save interface theme:', error);
      toast.error(t('Failed to save system appearance'), {
        description: t('Please try again.'),
      });
    } finally {
      setSavingTheme(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[18px] border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Languages className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              {t('System Settings')}
            </h2>
            <div className="mt-5 grid max-w-3xl gap-6 md:grid-cols-2">
              <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">
                {t('Interface Language')}
              </label>
              <p className="mb-3 text-sm text-muted-foreground">
                {t('Choose the language used by the application interface, tray menu, and notifications.')}
              </p>
              <Select
                value={language}
                onValueChange={handleLanguageChange}
                disabled={saving}
              >
                <SelectTrigger aria-label={t('Interface Language')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                </SelectContent>
              </Select>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" />
                  <label className="text-sm font-semibold text-foreground">
                    {t('System Appearance')}
                  </label>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">
                  {t('Choose how Secretary Mee looks. Follow System updates automatically.')}
                </p>
                <Select value={theme} onValueChange={handleThemeChange} disabled={savingTheme}>
                  <SelectTrigger aria-label={t('System Appearance')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('Light')}</SelectItem>
                    <SelectItem value="dark">{t('Dark')}</SelectItem>
                    <SelectItem value="system">{t('Follow System')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

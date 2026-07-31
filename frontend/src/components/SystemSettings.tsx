'use client';

import { useState } from 'react';
import { Languages } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UiLanguage, useI18n } from '@/i18n';

export function SystemSettings() {
  const { language, setLanguage, t } = useI18n();
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
            <Languages className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {t('System Settings')}
            </h2>
            <div className="mt-5 max-w-md">
              <label className="mb-2 block text-sm font-medium text-gray-900">
                {t('Interface Language')}
              </label>
              <p className="mb-3 text-sm text-gray-600">
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
          </div>
        </div>
      </div>
    </div>
  );
}

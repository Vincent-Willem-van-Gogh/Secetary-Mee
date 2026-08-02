"use client"

import { t } from '@/i18n';
import { useEffect, useState, useRef } from "react"
import { Switch } from "./ui/switch"
import { FileText, FolderInput, FolderOpen, RotateCcw } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import Analytics from "@/lib/analytics"
import AnalyticsConsentSwitch from "./AnalyticsConsentSwitch"
import { useConfig, NotificationSettings } from "@/contexts/ConfigContext"
import { Button } from "./ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { toast } from "sonner"

type NoteExportFormat = 'markdown' | 'text';

interface NoteExportPreferences {
  folder: string;
  customFolder: boolean;
  format: NoteExportFormat;
}

interface NoteMigrationResult {
  migrated: number;
  failed: number;
}

export function PreferenceSettings() {
  const {
    notificationSettings,
    storageLocations,
    isLoadingPreferences,
    loadPreferences,
    updateNotificationSettings
  } = useConfig();

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [previousNotificationsEnabled, setPreviousNotificationsEnabled] = useState<boolean | null>(null);
  const [notePreferences, setNotePreferences] = useState<NoteExportPreferences | null>(null);
  const [noteSettingsBusy, setNoteSettingsBusy] = useState(false);
  const hasTrackedViewRef = useRef(false);

  const loadNotePreferences = async () => {
    const preferences = await invoke<NoteExportPreferences>('get_note_export_preferences');
    setNotePreferences(preferences);
  };

  const showMigrationResult = (result: NoteMigrationResult) => {
    if (result.failed > 0) {
      toast.warning(t('Some meeting notes could not be moved'), {
        description: t('{migrated} moved, {failed} kept in their original locations.', {
          migrated: result.migrated,
          failed: result.failed,
        }),
      });
    } else if (result.migrated > 0) {
      toast.success(t('Meeting notes updated'), {
        description: t('{count} exported notes were moved successfully.', { count: result.migrated }),
      });
    }
  };

  // Lazy load preferences on mount (only loads if not already cached)
  useEffect(() => {
    loadPreferences(true);
    loadNotePreferences().catch(error => {
      console.error('Failed to load note export preferences:', error);
      toast.error(t('Failed to load note storage settings'), { description: String(error) });
    });
    // Reset tracking ref on mount (every tab visit)
    hasTrackedViewRef.current = false;
  }, [loadPreferences]);

  // Track preferences viewed analytics on every tab visit (once per mount)
  useEffect(() => {
    if (hasTrackedViewRef.current) return;

    const trackPreferencesViewed = async () => {
      // Wait for notification settings to be available (either from cache or after loading)
      if (notificationSettings) {
        await Analytics.track('preferences_viewed', {
          notifications_enabled: notificationSettings.notification_preferences.show_recording_started ? 'true' : 'false'
        });
        hasTrackedViewRef.current = true;
      } else if (!isLoadingPreferences) {
        // If not loading and no settings available, track with default value
        await Analytics.track('preferences_viewed', {
          notifications_enabled: 'false'
        });
        hasTrackedViewRef.current = true;
      }
    };

    trackPreferencesViewed();
  }, [notificationSettings, isLoadingPreferences]);

  // Update notificationsEnabled when notificationSettings are loaded from global state
  useEffect(() => {
    if (notificationSettings) {
      // Notification enabled means both started and stopped notifications are enabled
      const enabled =
        notificationSettings.notification_preferences.show_recording_started &&
        notificationSettings.notification_preferences.show_recording_stopped;
      setNotificationsEnabled(enabled);
      if (isInitialLoad) {
        setPreviousNotificationsEnabled(enabled);
        setIsInitialLoad(false);
      }
    } else if (!isLoadingPreferences) {
      // If not loading and no settings, use default
      setNotificationsEnabled(true);
      if (isInitialLoad) {
        setPreviousNotificationsEnabled(true);
        setIsInitialLoad(false);
      }
    }
  }, [notificationSettings, isLoadingPreferences, isInitialLoad])

  useEffect(() => {
    // Skip update on initial load or if value hasn't actually changed
    if (isInitialLoad || notificationsEnabled === null || notificationsEnabled === previousNotificationsEnabled) return;
    if (!notificationSettings) return;

    const handleUpdateNotificationSettings = async () => {
      console.log("Updating notification settings to:", notificationsEnabled);

      try {
        // Update the notification preferences
        const updatedSettings: NotificationSettings = {
          ...notificationSettings,
          notification_preferences: {
            ...notificationSettings.notification_preferences,
            show_recording_started: notificationsEnabled,
            show_recording_stopped: notificationsEnabled,
          }
        };

        console.log("Calling updateNotificationSettings with:", updatedSettings);
        await updateNotificationSettings(updatedSettings);
        setPreviousNotificationsEnabled(notificationsEnabled);
        console.log("Successfully updated notification settings to:", notificationsEnabled);

        // Track notification preference change - only fires when user manually toggles
        await Analytics.track('notification_settings_changed', {
          notifications_enabled: notificationsEnabled.toString()
        });
      } catch (error) {
        console.error('Failed to update notification settings:', error);
      }
    };

    handleUpdateNotificationSettings();
  }, [notificationsEnabled, notificationSettings, isInitialLoad, previousNotificationsEnabled, updateNotificationSettings])

  const handleOpenFolder = async (folderType: 'database' | 'models' | 'recordings') => {
    try {
      switch (folderType) {
        case 'database':
          await invoke('open_database_folder');
          break;
        case 'models':
          await invoke('open_models_folder');
          break;
        case 'recordings':
          await invoke('open_recordings_folder');
          break;
      }

      // Track storage folder access
      await Analytics.track('storage_folder_opened', {
        folder_type: folderType
      });
    } catch (error) {
      console.error(`Failed to open ${folderType} folder:`, error);
    }
  };

  const handleChooseNoteFolder = async () => {
    setNoteSettingsBusy(true);
    try {
      const result = await invoke<NoteMigrationResult | null>('choose_note_export_folder');
      if (result) {
        await loadNotePreferences();
        showMigrationResult(result);
      }
    } catch (error) {
      toast.error(t('Failed to change note storage location'), { description: String(error) });
    } finally {
      setNoteSettingsBusy(false);
    }
  };

  const handleResetNoteFolder = async () => {
    setNoteSettingsBusy(true);
    try {
      const result = await invoke<NoteMigrationResult>('reset_note_export_folder');
      await loadNotePreferences();
      showMigrationResult(result);
    } catch (error) {
      toast.error(t('Failed to restore the recording folder'), { description: String(error) });
    } finally {
      setNoteSettingsBusy(false);
    }
  };

  const handleNoteFormatChange = async (format: string) => {
    if (!notePreferences || format === notePreferences.format) return;
    setNoteSettingsBusy(true);
    try {
      const result = await invoke<NoteMigrationResult>('set_note_export_format', { format });
      await loadNotePreferences();
      showMigrationResult(result);
    } catch (error) {
      toast.error(t('Failed to change note format'), { description: String(error) });
    } finally {
      setNoteSettingsBusy(false);
    }
  };

  // Show loading only if we're actually loading and don't have cached data
  if (isLoadingPreferences && !notificationSettings && !storageLocations) {
    return <div className="max-w-2xl mx-auto p-6">{t("Loading Preferences...")}</div>
  }

  // Show loading if notificationsEnabled hasn't been determined yet
  if (notificationsEnabled === null && !isLoadingPreferences) {
    return <div className="max-w-2xl mx-auto p-6">{t("Loading Preferences...")}</div>
  }

  // Ensure we have a boolean value for the Switch component
  const notificationsEnabledValue = notificationsEnabled ?? false;

  return (
    <div className="space-y-6">
      {/* Notifications Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("Notifications")}</h3>
            <p className="text-sm text-gray-600">{t("Enable or disable notifications of start and end of meeting")}</p>
          </div>
          <Switch checked={notificationsEnabledValue} onCheckedChange={setNotificationsEnabled} />
        </div>
      </div>

      {/* Data Storage Locations Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t("Data Storage Locations")}</h3>
        <p className="text-sm text-gray-600 mb-6">
          {t("View and access where Secretary Mee stores your data")}</p>

        <div className="space-y-4">
          {/* Database Location */}
          {/* <div className="p-4 border rounded-lg bg-gray-50">
            <div className="font-medium mb-2">Database</div>
            <div className="text-sm text-gray-600 mb-3 break-all font-mono text-xs">
              {storageLocations?.database || 'Loading...'}
            </div>
            <button
              onClick={() => handleOpenFolder('database')}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </button>
          </div> */}

          {/* Models Location */}
          {/* <div className="p-4 border rounded-lg bg-gray-50">
            <div className="font-medium mb-2">Whisper Models</div>
            <div className="text-sm text-gray-600 mb-3 break-all font-mono text-xs">
              {storageLocations?.models || 'Loading...'}
            </div>
            <button
              onClick={() => handleOpenFolder('models')}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </button>
          </div> */}

          {/* Recordings Location */}
          <div className="p-4 border rounded-lg bg-gray-50">
            <div className="font-medium mb-2">{t("Meeting Recordings")}</div>
            <div className="text-sm text-gray-600 mb-3 break-all font-mono text-xs">
              {storageLocations?.recordings || 'Loading...'}
            </div>
            <button
              onClick={() => handleOpenFolder('recordings')}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              {t("Open Folder")}</button>
          </div>

          {/* Notes Location */}
          <div className="p-4 border rounded-lg bg-gray-50">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <FileText className="h-4 w-4 text-primary" />
              {t('Meeting Notes Storage')}
            </div>
            <div className="mb-1 break-all font-mono text-xs text-gray-600">
              {notePreferences?.folder || t('Loading...')}
            </div>
            <p className="mb-3 text-xs text-gray-500">
              {notePreferences?.customFolder
                ? t('Using a custom folder')
                : t('Following the meeting recordings folder')}
            </p>
            <div className="mb-3 max-w-xs">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('Note Format')}
              </label>
              <Select
                value={notePreferences?.format || 'markdown'}
                onValueChange={handleNoteFormatChange}
                disabled={noteSettingsBusy || !notePreferences}
              >
                <SelectTrigger aria-label={t('Note Format')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown (.md)</SelectItem>
                  <SelectItem value="text">{t('Plain Text')} (.txt)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleChooseNoteFolder} disabled={noteSettingsBusy}>
                <FolderInput className="h-4 w-4" />
                {t('Choose Folder')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => invoke('open_note_export_folder').catch(error => toast.error(t('Failed to open folder'), { description: String(error) }))}
                disabled={noteSettingsBusy || !notePreferences}
              >
                <FolderOpen className="h-4 w-4" />
                {t('Open Folder')}
              </Button>
              {notePreferences?.customFolder && (
                <Button variant="outline" size="sm" onClick={handleResetNoteFolder} disabled={noteSettingsBusy}>
                  <RotateCcw className="h-4 w-4" />
                  {t('Use Recordings Folder')}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-xs text-blue-800">
            <strong>{t("Note:")}</strong> {t("Database and models are stored together in your application data directory for unified management.")}</p>
        </div>
      </div>

      {/* Analytics Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <AnalyticsConsentSwitch />
      </div>
    </div>
  )
}

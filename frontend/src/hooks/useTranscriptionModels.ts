import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { t } from '@/i18n';

export interface RawModelInfo {
  name: string;
  size_mb: number;
  status:
    | 'Available'
    | 'Missing'
    | { Downloading: { progress: number } }
    | { Error: string }
    | { Corrupted: { file_size: number; expected_min_size: number } };
}

export type ModelOptionStatus = 'Available' | 'Missing' | 'Downloading' | 'Corrupted/Error';

export interface ModelOption {
  provider: 'whisper' | 'parakeet';
  name: string;
  displayName: string;
  size_mb: number;
  status: ModelOptionStatus;
  downloadProgress?: number;
}

interface TranscriptModelConfig {
  provider?: string;
  model?: string;
}

function normalizeStatus(status: RawModelInfo['status']): Pick<ModelOption, 'status' | 'downloadProgress'> {
  if (status === 'Available' || status === 'Missing') return { status };
  if ('Downloading' in status) {
    return { status: 'Downloading', downloadProgress: status.Downloading.progress };
  }
  return { status: 'Corrupted/Error' };
}

export function formatModelSize(sizeMb: number): string {
  return sizeMb >= 1000 ? `${(sizeMb / 1000).toFixed(2)} GB` : `${sizeMb} MB`;
}

export function getModelStatusText(model: ModelOption): string | null {
  if (model.status === 'Available') return null;
  if (model.status === 'Missing') return t('Not downloaded');
  if (model.status === 'Downloading') {
    return `${t('Downloading')} ${Math.round(model.downloadProgress || 0)}%`;
  }
  return t('Model not available');
}

export function getModelAvailabilityMessage(model: ModelOption): string {
  if (model.status === 'Downloading') {
    return t('{model} is downloading ({progress}%). Please wait until download completes.', {
      model: 'Whisper Large V3',
      progress: Math.round(model.downloadProgress || 0),
    });
  }
  if (model.status === 'Corrupted/Error') {
    return t('{model} file is corrupted. Please delete and re-download.', {
      model: 'Whisper Large V3',
    });
  }
  return t('{model} needs to be downloaded. Please download it in model settings.', {
    model: 'Whisper Large V3',
  });
}

/**
 * Custom hook for fetching and managing transcription models (Whisper and Parakeet).
 *
 * This hook centralizes the model fetching logic that was previously duplicated
 * in ImportAudioDialog and RetranscribeDialog components.
 *
 * @param transcriptModelConfig - User's saved model configuration from context
 * @returns Object containing available models, selected model key, loading state, and fetch function
 */
export function useTranscriptionModels(transcriptModelConfig: TranscriptModelConfig | undefined) {
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');
  const [loadingModels, setLoadingModels] = useState(false);
  // Track whether the user has manually changed the model selection
  const userSelectedRef = useRef(false);

  // Wrap setSelectedModelKey to track user-initiated changes
  const setSelectedModelKeyWithTracking = useCallback((key: string) => {
    userSelectedRef.current = true;
    setSelectedModelKey(key);
  }, []);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    const allModels: ModelOption[] = [];

    // Fetch Whisper models
    try {
      const whisperModels = await invoke<RawModelInfo[]>('whisper_get_available_models');
      const visibleWhisper = whisperModels
        .filter((m) => m.status === 'Available' || m.name === 'large-v3')
        .map((m) => ({
          provider: 'whisper' as const,
          name: m.name,
          displayName: m.name === 'large-v3' ? '🏠 Whisper: Large V3' : `🏠 Whisper: ${m.name}`,
          size_mb: m.size_mb,
          ...normalizeStatus(m.status),
        }));
      allModels.push(...visibleWhisper);
    } catch (err) {
      console.error('Failed to fetch Whisper models:', err);
    }

    // Keep the requested local model visible even before the Whisper engine is initialized.
    if (!allModels.some((model) => model.provider === 'whisper' && model.name === 'large-v3')) {
      allModels.push({
        provider: 'whisper',
        name: 'large-v3',
        displayName: '🏠 Whisper: Large V3',
        size_mb: 2951,
        status: 'Missing',
      });
    }

    // Fetch Parakeet models
    try {
      const parakeetModels = await invoke<RawModelInfo[]>('parakeet_get_available_models');
      const availableParakeet = parakeetModels
        .filter((m) => m.status === 'Available')
        .map((m) => ({
          provider: 'parakeet' as const,
          name: m.name,
          displayName: `⚡ Parakeet: ${m.name}`,
          size_mb: m.size_mb,
          status: 'Available' as const,
        }));
      allModels.push(...availableParakeet);
    } catch (err) {
      console.error('Failed to fetch Parakeet models:', err);
    }

    setAvailableModels(allModels);

    // Set default model based on user's saved configuration
    const configuredProvider = transcriptModelConfig?.provider || '';
    const configuredModel = transcriptModelConfig?.model || '';

    // Try to match the configured model
    // Note: 'localWhisper' in config maps to 'whisper' provider in model list
    const configuredMatch = allModels.find(
      (m) =>
        m.status === 'Available' &&
        ((configuredProvider === 'localWhisper' && m.provider === 'whisper' && m.name === configuredModel) ||
          (configuredProvider === 'parakeet' && m.provider === 'parakeet' && m.name === configuredModel))
    );

    // Only set default model if user hasn't manually selected one
    if (!userSelectedRef.current) {
      if (configuredMatch) {
        // Use the configured model if available
        setSelectedModelKey(`${configuredMatch.provider}:${configuredMatch.name}`);
      } else {
        const fallback = allModels.find((m) => m.provider === 'parakeet' && m.status === 'Available')
          || allModels.find((m) => m.status === 'Available');
        if (fallback) setSelectedModelKey(`${fallback.provider}:${fallback.name}`);
      }
    }

    setLoadingModels(false);
  }, [transcriptModelConfig]);

  // Reset user selection tracking (call when dialog opens fresh)
  const resetSelection = useCallback(() => {
    userSelectedRef.current = false;
  }, []);

  return {
    availableModels,
    selectedModelKey,
    setSelectedModelKey: setSelectedModelKeyWithTracking,
    loadingModels,
    fetchModels,
    resetSelection,
  };
}

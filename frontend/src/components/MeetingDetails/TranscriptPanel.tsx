"use client";

import { t } from '@/i18n';
import { Transcript, TranscriptSegmentData } from '@/types';
import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { TranscriptButtonGroup } from './TranscriptButtonGroup';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Languages } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { SidebarToggleButton } from '@/components/Sidebar/SidebarToggleButton';

interface TranscriptPanelProps {
  transcripts: Transcript[];
  customPrompt: string;
  onPromptChange: (value: string) => void;
  onCopyTranscript: () => void;
  onSaveNote: () => Promise<void>;
  isSavingNote: boolean;
  isRecording: boolean;
  disableAutoScroll?: boolean;

  // Optional pagination props (when using virtualization)
  usePagination?: boolean;
  segments?: TranscriptSegmentData[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  loadedCount?: number;
  onLoadMore?: () => void;

  // Retranscription props
  meetingId?: string;
  meetingFolderPath?: string | null;
  onRefetchTranscripts?: () => Promise<void>;
}

export function TranscriptPanel({
  transcripts,
  customPrompt,
  onPromptChange,
  onCopyTranscript,
  onSaveNote,
  isSavingNote,
  isRecording,
  disableAutoScroll = false,
  usePagination = false,
  segments,
  hasMore,
  isLoadingMore,
  totalCount,
  loadedCount,
  onLoadMore,
  meetingId,
  meetingFolderPath,
  onRefetchTranscripts,
}: TranscriptPanelProps) {
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  // Convert transcripts to segments if pagination is not used but we want virtualization
  const convertedSegments = useMemo(() => {
    if (usePagination && segments) {
      return segments;
    }
    // Convert transcripts to segments for virtualization
    return transcripts.map(t => ({
      id: t.id,
      timestamp: t.audio_start_time ?? 0,
      endTime: t.audio_end_time,
      text: t.text,
      confidence: t.confidence,
      translation_zh_cn: t.translation_zh_cn,
      translation_provider: t.translation_provider,
      translation_model: t.translation_model,
      translation_status: t.translation_zh_cn ? 'complete' as const : 'pending' as const,
    }));
  }, [transcripts, usePagination, segments]);
  const displaySegments = useMemo(() => convertedSegments.map(segment => ({
    ...segment,
    translation_status: translatingIds.has(segment.id) ? 'translating' as const : segment.translation_status,
  })), [convertedSegments, translatingIds]);

  const translateAndSave = async (segment: TranscriptSegmentData) => {
    const result = await invoke<{ translation: string; provider: string; model: string }>(
      'translate_transcript_text',
      { text: segment.text },
    );
    await invoke('update_transcript_translation', {
      transcriptId: segment.id,
      translation: result.translation,
      provider: result.provider,
      model: result.model,
    });
  };

  const retryTranslation = async (segment: TranscriptSegmentData) => {
    setTranslatingIds(new Set([segment.id]));
    try {
      await translateAndSave(segment);
      await onRefetchTranscripts?.();
    } catch (error) {
      toast.error(t('Translation failed'), { description: String(error) });
    } finally {
      setTranslatingIds(new Set());
    }
  };

  const translateMissing = async () => {
    const missing = convertedSegments.filter(segment => !segment.translation_zh_cn);
    if (!missing.length) return;
    setTranslatingIds(new Set(missing.map(segment => segment.id)));
    try {
      await Promise.allSettled(missing.map(translateAndSave));
      await onRefetchTranscripts?.();
    } catch (error) {
      toast.error(t('Could not refresh translations'), { description: String(error) });
    } finally {
      setTranslatingIds(new Set());
    }
  };

  const copyTranslation = () => {
    navigator.clipboard.writeText(convertedSegments.map(segment => segment.translation_zh_cn).filter(Boolean).join('\n'));
    toast.success(t('Chinese translation copied to clipboard'));
  };

  return (
    <div className="hidden md:flex w-1/2 min-w-0 border-r border-gray-200 bg-white flex-col relative shrink-0">
      {/* Title area */}
      <div className="border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-2">
          <SidebarToggleButton />
          <TranscriptButtonGroup
            transcriptCount={usePagination ? (totalCount ?? convertedSegments.length) : (transcripts?.length || 0)}
            onCopyTranscript={onCopyTranscript}
            onSaveNote={onSaveNote}
            isSavingNote={isSavingNote}
            meetingId={meetingId}
            meetingFolderPath={meetingFolderPath}
            onRefetchTranscripts={onRefetchTranscripts}
          />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={copyTranslation} title={t('Copy Chinese translation')} aria-label={t('Copy Chinese translation')}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={translateMissing} disabled={translatingIds.size > 0} title={t('Translate all missing segments')} aria-label={t('Translate all missing segments')}>
            <Languages className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex h-7 items-end text-xs font-medium text-gray-500">
          {t('Original transcript')} · {t('Simplified Chinese')}
        </div>
      </div>

      {/* Transcript content - use virtualized view for better performance */}
      <div className="flex-1 overflow-hidden pb-4">
        <VirtualizedTranscriptView
          segments={displaySegments}
          isRecording={isRecording}
          isPaused={false}
          isProcessing={false}
          isStopping={false}
          enableStreaming={false}
          showConfidence={true}
          disableAutoScroll={disableAutoScroll}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          totalCount={totalCount}
          loadedCount={loadedCount}
          onLoadMore={onLoadMore}
          showTranslation
          translationLayout="stacked"
          onRetryTranslation={retryTranslation}
        />
      </div>

      {/* Custom prompt input at bottom of transcript section */}
      {!isRecording && convertedSegments.length > 0 && (
        <div className="p-1 border-t border-gray-200">
          <textarea
            placeholder={t("Add context for AI summary. For example people involved, meeting overview, objective etc...")}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm min-h-[80px] resize-y"
            value={customPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

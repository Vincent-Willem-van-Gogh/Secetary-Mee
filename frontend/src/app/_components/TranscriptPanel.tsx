import { t } from '@/i18n';
import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { PermissionWarning } from '@/components/PermissionWarning';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, GlobeIcon, PanelRight } from 'lucide-react';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { ModalType } from '@/hooks/useModalState';
import { useIsLinux } from '@/hooks/usePlatform';
import { useMemo, useState } from 'react';

/**
 * TranscriptPanel Component
 *
 * Displays transcript content with controls for copying and language settings.
 * Uses TranscriptContext, ConfigContext, and RecordingStateContext internally.
 */

interface TranscriptPanelProps {
  // indicates stop-processing state for transcripts; derived from backend statuses.
  isProcessingStop: boolean;
  isStopping: boolean;
  showModal: (name: ModalType, message?: string) => void;
}

export function TranscriptPanel({
  isProcessingStop,
  isStopping,
  showModal
}: TranscriptPanelProps) {
  // Contexts
  const { transcripts, transcriptContainerRef, copyTranscript, copyTranslation, retryTranslation } = useTranscripts();
  const { transcriptModelConfig } = useConfig();
  const { isRecording, isPaused } = useRecordingState();
  const { checkPermissions, isChecking, hasSystemAudio, hasMicrophone } = usePermissionCheck();
  const isLinux = useIsLinux();
  const [showTranslation, setShowTranslation] = useState(false);

  // Convert transcripts to segments for virtualized view
  const segments = useMemo(() =>
    transcripts.map(t => ({
      id: t.id,
      timestamp: t.audio_start_time ?? 0,
      endTime: t.audio_end_time,
      text: t.text,
      confidence: t.confidence,
      translation_zh_cn: t.translation_zh_cn,
      translation_provider: t.translation_provider,
      translation_model: t.translation_model,
      translation_status: t.translation_status,
    })),
    [transcripts]
  );

  return (
    <div ref={transcriptContainerRef} className="w-full border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
      {/* Title area - Sticky header */}
      <div className="sticky top-0 z-10 bg-white p-4 border-gray-200">
        <div className="flex items-center justify-between gap-3">
          <div className="w-8" aria-hidden="true" />
          <div className="flex justify-center items-center space-x-2">
              <ButtonGroup>
                {transcripts?.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyTranscript}
                    title={t("Copy Transcript")}
                  >
                    <Copy />
                    <span className='hidden md:inline'>
                      {t("Copy")}</span>
                  </Button>
                )}
                {transcriptModelConfig.provider === "localWhisper" &&
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => showModal('languageSettings')}
                    title={t("Language")}
                  >
                    <GlobeIcon />
                    <span className='hidden md:inline'>
                      {t("Language")}</span>
                  </Button>
                }
                {showTranslation && transcripts.some(item => item.translation_zh_cn) && (
                  <Button variant="outline" size="sm" onClick={copyTranslation} title={t('Copy Chinese translation')}>
                    <Copy />
                    <span className="hidden md:inline">{t('Copy Chinese')}</span>
                  </Button>
                )}
              </ButtonGroup>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={`h-8 w-8 rounded-lg bg-gray-50 ${showTranslation ? 'border-blue-400 bg-blue-50 text-blue-600' : ''}`}
            onClick={() => setShowTranslation(value => !value)}
            title={showTranslation ? t('Hide Chinese translation') : t('Show Chinese translation')}
            aria-label={showTranslation ? t('Hide Chinese translation') : t('Show Chinese translation')}
            aria-pressed={showTranslation}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
        {showTranslation && (
          <div className="grid grid-cols-2 mt-3 border-t border-gray-100 pt-2 text-xs font-medium text-gray-500">
            <span className="pr-4">{t('Original transcript')}</span>
            <span className="pl-4">{t('Simplified Chinese')}</span>
          </div>
        )}
      </div>

      {/* Permission Warning - Not needed on Linux */}
      {!isRecording && !isChecking && !isLinux && (
        <div className="flex justify-center px-4 pt-4">
          <PermissionWarning
            hasMicrophone={hasMicrophone}
            hasSystemAudio={hasSystemAudio}
            onRecheck={checkPermissions}
            isRechecking={isChecking}
          />
        </div>
      )}

      {/* Transcript content */}
      <div className="pb-20">
        <div className="flex justify-center">
          <div className={showTranslation ? 'w-full px-4' : 'w-2/3 max-w-[750px]'}>
            <VirtualizedTranscriptView
              segments={segments}
              isRecording={isRecording}
              isPaused={isPaused}
              isProcessing={isProcessingStop}
              isStopping={isStopping}
              enableStreaming={isRecording}
              showConfidence={true}
              showTranslation={showTranslation}
              onRetryTranslation={(segment) => retryTranslation(segment.id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

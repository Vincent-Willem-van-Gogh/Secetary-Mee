import { t } from '@/i18n';
import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { PermissionWarning } from '@/components/PermissionWarning';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { SidebarToggleButton, wallToggleButtonClass } from '@/components/Sidebar/SidebarToggleButton';
import { Copy, GlobeIcon, PanelRightClose, PanelRightOpen } from 'lucide-react';
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
  showModal,
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
    <div ref={transcriptContainerRef} className="flex min-h-0 w-full flex-col overflow-hidden border-r bg-card text-card-foreground">
      {/* Title area - Sticky header */}
      <div className="z-10 shrink-0 border-b bg-card/85 px-4 py-[5px] backdrop-blur-xl">
        <div className="flex h-[30px] items-center justify-between gap-3 [&_button]:h-[30px] [&_button]:min-h-[30px] [&>button]:w-[30px]">
          <SidebarToggleButton />
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
            variant="ghost"
            size="icon"
            className={wallToggleButtonClass}
            onClick={() => setShowTranslation(value => !value)}
            title={showTranslation ? t('Hide Chinese translation') : t('Show Chinese translation')}
            aria-label={showTranslation ? t('Hide Chinese translation') : t('Show Chinese translation')}
            aria-pressed={showTranslation}
          >
            {showTranslation ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        </div>
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
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full justify-center">
          <div className={showTranslation ? 'h-full w-full px-4' : 'h-full w-2/3 max-w-[750px]'}>
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

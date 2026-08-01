'use client';

import { t } from '@/i18n';
import { listen } from '@tauri-apps/api/event';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, Pause, Play, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LiveDraftUpdate {
  state: 'idle' | 'loading' | 'listening' | 'paused' | 'recovering' | 'unavailable' | 'error';
  text: string;
  revision: number;
  error?: string | null;
}

interface LiveDraftPanelProps {
  isPaused: boolean;
  isPausing: boolean;
  isResuming: boolean;
  isStopping: boolean;
  onPauseResume: () => void;
  onStop: () => void;
}

const stateText: Record<LiveDraftUpdate['state'], string> = {
  idle: 'Waiting for speech…',
  loading: 'Loading live preview model…',
  listening: 'Waiting for speech…',
  paused: 'Live preview paused',
  recovering: 'Live preview is recovering…',
  unavailable: 'Live preview unavailable',
  error: 'Live preview unavailable',
};

export function LiveDraftPanel({
  isPaused,
  isPausing,
  isResuming,
  isStopping,
  onPauseResume,
  onStop,
}: LiveDraftPanelProps) {
  const [draft, setDraft] = useState<LiveDraftUpdate>({ state: 'listening', text: '', revision: 0 });
  const previousText = useRef('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<LiveDraftUpdate>('live-draft-update', event => setDraft(event.payload)).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [draft.text]);

  const [stable, added] = useMemo(() => {
    const old = previousText.current;
    const next = draft.text;
    let shared = 0;
    while (shared < old.length && shared < next.length && old[shared] === next[shared]) shared += 1;
    previousText.current = next;
    return [next.slice(0, shared), next.slice(shared)];
  }, [draft.text, draft.revision]);

  const effectiveState = isPaused ? 'paused' : draft.state;
  const busy = effectiveState === 'loading' || effectiveState === 'recovering';

  return (
    <TooltipProvider>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative h-[114px] w-full overflow-hidden border-t bg-card text-card-foreground"
        aria-live="polite"
      >
        <div ref={scroller} className="h-full overflow-y-auto px-5 py-4 pr-32 text-[17px] leading-7 text-foreground">
          {draft.text && effectiveState !== 'error' ? (
            <p>
              <span>{stable}</span>
              <AnimatePresence mode="popLayout">
                <motion.span key={`${draft.revision}-${added}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-primary">
                  {added}
                </motion.span>
              </AnimatePresence>
            </p>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              {busy && <LoaderCircle className="h-4 w-4 animate-spin text-primary" />}
              {t(stateText[effectiveState])}
            </p>
          )}
          {draft.error && <p className="mt-1 truncate text-xs text-red-300" title={draft.error}>{draft.error}</p>}
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onPauseResume}
                disabled={isPausing || isResuming || isStopping}
                className="flex h-11 w-11 items-center justify-center rounded-lg border bg-secondary text-secondary-foreground transition active:scale-95 hover:bg-accent disabled:opacity-40"
                aria-label={isPaused ? t('Resume recording') : t('Pause recording')}
              >
                {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{isPaused ? t('Resume recording') : t('Pause recording')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onStop}
                disabled={isStopping || isPausing || isResuming}
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive text-white transition active:scale-95 hover:bg-destructive/90 disabled:opacity-40"
                aria-label={t('Stop recording')}
              >
                {isStopping ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('Stop recording')}</TooltipContent>
          </Tooltip>
        </div>
      </motion.section>
    </TooltipProvider>
  );
}

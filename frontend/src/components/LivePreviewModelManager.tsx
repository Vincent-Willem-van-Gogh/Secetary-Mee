'use client';

import { t } from '@/i18n';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Download, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export interface LivePreviewModelStatus {
  model_name: string;
  state: 'missing' | 'ready' | 'downloading';
  ready: boolean;
  size_bytes: number;
}

interface DownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
}

export function LivePreviewModelManager({ onReady }: { onReady?: () => void }) {
  const [status, setStatus] = useState<LivePreviewModelStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await invoke<LivePreviewModelStatus>('get_live_preview_model_status'));
  }, []);

  useEffect(() => {
    refresh().catch(error => console.warn('Could not read live preview model status:', error));
    let unlisten: (() => void) | undefined;
    listen<DownloadProgress>('live-preview-model-download-progress', event => setProgress(event.payload.percent))
      .then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, [refresh]);

  const download = async () => {
    setBusy(true);
    setProgress(0);
    try {
      await invoke('download_live_preview_model');
      await refresh();
      toast.success(t('Live preview model is ready'));
      onReady?.();
    } catch (error) {
      toast.error(t('Could not download live preview model'), { description: String(error) });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    await invoke('cancel_live_preview_model_download');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await invoke('delete_live_preview_model');
      await refresh();
      toast.success(t('Live preview model deleted'));
    } catch (error) {
      toast.error(t('Could not delete live preview model'), { description: String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('Live Preview Model')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('Sherpa Streaming Zipformer English provides temporary low-latency draft text while recording.')}</p>
          <p className="mt-2 text-xs text-gray-400">Sherpa Streaming Zipformer English · {(310_414_022 / 1024 / 1024).toFixed(0)} MB</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status?.ready ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {status?.ready ? t('Ready') : busy ? t('Downloading') : t('Not downloaded')}
        </span>
      </div>

      {busy && (
        <div className="mt-4 space-y-2">
          <Progress value={progress} />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{progress.toFixed(0)}%</span>
            <Button variant="ghost" size="sm" onClick={cancel}>{t('Cancel')}</Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {status?.ready ? (
          <Button variant="outline" size="sm" onClick={remove} disabled={busy}>
            <Trash2 className="mr-2 h-4 w-4" />{t('Delete')}
          </Button>
        ) : (
          <Button size="sm" onClick={download} disabled={busy}>
            {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : progress > 0 ? <RotateCcw className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
            {progress > 0 && !busy ? t('Retry') : t('Download')}
          </Button>
        )}
      </div>
    </section>
  );
}

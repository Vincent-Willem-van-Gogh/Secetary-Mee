import { t } from '@/i18n';
import React from 'react';
import { Upload } from 'lucide-react';
import { getAudioFormatsDisplayList } from '@/constants/audioFormats';

interface ImportDropOverlayProps {
  visible: boolean;
}

export function ImportDropOverlay({ visible }: ImportDropOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm
                 flex items-center justify-center pointer-events-none
                 transition-opacity duration-200"
    >
      <div className="rounded-[18px] border-2 border-dashed border-primary
                      bg-card/95 p-12 text-center text-foreground
                      transform scale-100 transition-transform">
        <Upload className="mx-auto mb-4 h-16 w-16 text-primary" />
        <p className="text-xl font-semibold">{t("Drop audio file to import")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{getAudioFormatsDisplayList()}</p>
      </div>
    </div>
  );
}

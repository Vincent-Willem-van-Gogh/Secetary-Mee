'use client';

import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSidebar } from './SidebarProvider';

export const wallToggleButtonClass = 'border-0 bg-transparent text-foreground hover:bg-accent hover:text-foreground dark:text-white dark:hover:bg-white/10 dark:hover:text-white';

export function SidebarToggleButton() {
  const { isCollapsed, toggleCollapse } = useSidebar();
  const { t } = useI18n();
  const label = isCollapsed ? t('Expand sidebar') : t('Collapse sidebar');

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={wallToggleButtonClass}
      onClick={toggleCollapse}
      title={label}
      aria-label={label}
    >
      {isCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button>
  );
}

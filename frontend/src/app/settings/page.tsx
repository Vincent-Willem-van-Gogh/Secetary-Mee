'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowLeft, Settings2, Mic, Database as DatabaseIcon, SparkleIcon, FlaskConical, Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { TranscriptSettings } from '@/components/TranscriptSettings';
import { RecordingSettings } from '@/components/RecordingSettings';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { BetaSettings } from '@/components/BetaSettings';
import { useConfig } from '@/contexts/ConfigContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SystemSettings } from '@/components/SystemSettings';
import { SidebarToggleButton } from '@/components/Sidebar/SidebarToggleButton';
import { useI18n } from '@/i18n';

export default function SettingsPage() {
  const router = useRouter();
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();
  const { language, t } = useI18n();
  const tabs = [
    { value: 'system', label: t('System'), icon: Languages },
    { value: 'general', label: t('General'), icon: Settings2 },
    { value: 'recording', label: t('Recordings'), icon: Mic },
    { value: 'Transcriptionmodels', label: t('Transcription'), icon: DatabaseIcon },
    { value: 'summaryModels', label: t('Summary'), icon: SparkleIcon },
    { value: 'beta', label: t('Beta'), icon: FlaskConical }
  ] as const;

  // Animation state for tabs
  const [activeTab, setActiveTab] = useState('system');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (tabs.some(tab => tab.value === requestedTab)) setActiveTab(requestedTab!);
  }, []);

  // Load saved transcript configuration on mount
  useEffect(() => {
    const loadTranscriptConfig = async () => {
      try {
        const config = await invoke('api_get_transcript_config') as any;
        if (config) {
          console.log('Loaded saved transcript config:', config);
          setTranscriptModelConfig({
            provider: config.provider || 'localWhisper',
            model: config.model || 'large-v3',
            apiKey: config.apiKey || null
          });
        }
      } catch (error) {
        console.error('Failed to load transcript config:', error);
      }
    };
    loadTranscriptConfig();
  }, [setTranscriptModelConfig]);

  // Update underline position when active tab changes
  useLayoutEffect(() => {
    const activeIndex = tabs.findIndex(tab => tab.value === activeTab);
    const activeTabElement = tabRefs.current[activeIndex];

    if (activeTabElement) {
      const { offsetLeft, offsetWidth } = activeTabElement;
      setUnderlineStyle({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeTab, language]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-center gap-4">
            <SidebarToggleButton />
            <button
              onClick={() => router.back()}
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-primary active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>{t('Back')}</span>
            </button>
            <h1 className="text-3xl font-semibold">{t('Settings')}</h1>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8 pt-6">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="relative h-auto max-w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0">
              {tabs.map((tab, index) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    ref={el => { tabRefs.current[index] = el }}
                    className="relative z-10 flex items-center gap-2 rounded-none border-0 bg-transparent px-6 py-4 text-muted-foreground hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary"
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}

              <motion.div
                className="absolute bottom-0 z-20 h-0.5 bg-primary"
                layoutId="underline"
                style={{ left: underlineStyle.left, width: underlineStyle.width }}
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              />
            </TabsList>

            <TabsContent value="system">
              <SystemSettings />
            </TabsContent>
            <TabsContent value="general">
              <PreferenceSettings />
            </TabsContent>
            <TabsContent value="recording">
              <RecordingSettings />
            </TabsContent>
            <TabsContent value="Transcriptionmodels">
              <TranscriptSettings
                transcriptModelConfig={transcriptModelConfig}
                setTranscriptModelConfig={setTranscriptModelConfig}
              />
            </TabsContent>
            <TabsContent value="summaryModels">
              <SummaryModelSettings />
            </TabsContent>
            <TabsContent value="beta" className="mt-6">
              <BetaSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

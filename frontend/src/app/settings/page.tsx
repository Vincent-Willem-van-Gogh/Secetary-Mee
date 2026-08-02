'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowLeft, Settings2, Mic, Database as DatabaseIcon, SparkleIcon, FlaskConical, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { TranscriptSettings, type TranscriptModelProps } from '@/components/TranscriptSettings';
import { RecordingSettings } from '@/components/RecordingSettings';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { BetaSettings } from '@/components/BetaSettings';
import { useConfig } from '@/contexts/ConfigContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SystemSettings } from '@/components/SystemSettings';
import { SidebarToggleButton } from '@/components/Sidebar/SidebarToggleButton';
import { useI18n } from '@/i18n';
import { CredentialSettings } from '@/components/CredentialSettings';

export default function SettingsPage() {
  const router = useRouter();
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();
  const { language, t } = useI18n();
  const tabs = [
    { value: 'general', label: t('General'), icon: Settings2 },
    { value: 'credentials', label: t('API Credentials'), icon: KeyRound },
    { value: 'recording', label: t('Recordings'), icon: Mic },
    { value: 'Transcriptionmodels', label: t('Transcription'), icon: DatabaseIcon },
    { value: 'summaryModels', label: t('Summary'), icon: SparkleIcon },
    { value: 'beta', label: t('Beta'), icon: FlaskConical }
  ] as const;

  // Animation state for tabs
  const [activeTab, setActiveTab] = useState('general');
  const [requestedTranscriptProvider, setRequestedTranscriptProvider] = useState<TranscriptModelProps['provider']>();
  const [requestedCredentialProvider, setRequestedCredentialProvider] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawTab = params.get('tab');
    const requestedTab = rawTab === 'system' ? 'general' : rawTab;
    if (rawTab === 'system') {
      params.set('tab', 'general');
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    }
    if (tabs.some(tab => tab.value === requestedTab)) setActiveTab(requestedTab!);
    if (params.get('provider') === 'localWhisper') setRequestedTranscriptProvider('localWhisper');
    if (requestedTab === 'credentials') setRequestedCredentialProvider(params.get('provider'));
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
            hasApiKey: config.hasApiKey || false
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
        <div className="mx-auto max-w-6xl px-8 py-[5px]">
          <div className="flex h-[30px] items-center gap-4">
            <div className="h-[30px] w-[30px] [&_button]:h-[30px] [&_button]:min-h-[30px] [&_button]:w-[30px]">
              <SidebarToggleButton />
            </div>
            <button
              onClick={() => router.back()}
              className="flex h-[30px] min-h-[30px] items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-primary active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>{t('Back')}</span>
            </button>
            <h1 className="text-lg font-semibold">{t('Settings')}</h1>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 pb-8 pt-2">
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

            <TabsContent value="general">
              <div className="space-y-6">
                <SystemSettings />
                <PreferenceSettings />
              </div>
            </TabsContent>
            <TabsContent value="credentials">
              <CredentialSettings requestedProvider={requestedCredentialProvider} />
            </TabsContent>
            <TabsContent value="recording">
              <RecordingSettings />
            </TabsContent>
            <TabsContent value="Transcriptionmodels">
              <TranscriptSettings
                transcriptModelConfig={transcriptModelConfig}
                setTranscriptModelConfig={setTranscriptModelConfig}
                initialProvider={requestedTranscriptProvider}
              />
            </TabsContent>
            <TabsContent value="summaryModels">
              <SummaryModelSettings />
            </TabsContent>
            <TabsContent value="beta">
              <BetaSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

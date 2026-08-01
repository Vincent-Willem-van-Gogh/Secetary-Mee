import { t } from '@/i18n';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Eye, EyeOff, Lock, RefreshCw, Save, Trash2, Unlock } from 'lucide-react';
import { ModelManager } from './WhisperModelManager';
import { ParakeetModelManager } from './ParakeetModelManager';
import { toast } from 'sonner';
import { useConfig } from '@/contexts/ConfigContext';
import { LivePreviewModelManager } from './LivePreviewModelManager';


export interface TranscriptModelProps {
    provider: 'localWhisper' | 'parakeet' | 'deepgram' | 'elevenLabs' | 'groq' | 'openai';
    model: string;
    apiKey?: string | null;
}

export interface TranscriptSettingsProps {
    transcriptModelConfig: TranscriptModelProps;
    setTranscriptModelConfig: (config: TranscriptModelProps) => void;
    onModelSelect?: () => void;
    initialProvider?: TranscriptModelProps['provider'];
}

export function TranscriptSettings({ transcriptModelConfig, setTranscriptModelConfig, onModelSelect, initialProvider }: TranscriptSettingsProps) {
    const [apiKey, setApiKey] = useState<string | null>(transcriptModelConfig.apiKey || null);
    const [showApiKey, setShowApiKey] = useState<boolean>(false);
    const [isApiKeyLocked, setIsApiKeyLocked] = useState<boolean>(true);
    const [isLockButtonVibrating, setIsLockButtonVibrating] = useState<boolean>(false);
    const [uiProvider, setUiProvider] = useState<TranscriptModelProps['provider']>(transcriptModelConfig.provider);

    // A deep link is a display request only; it must not change the saved default provider.
    useEffect(() => {
        setUiProvider(initialProvider ?? transcriptModelConfig.provider);
    }, [initialProvider, transcriptModelConfig.provider]);

    useEffect(() => {
        if (transcriptModelConfig.provider === 'localWhisper' || transcriptModelConfig.provider === 'parakeet') {
            setApiKey(null);
        }
    }, [transcriptModelConfig.provider]);

    const fetchApiKey = async (provider: string) => {
        try {

            const data = await invoke('api_get_transcript_api_key', { provider }) as string;

            setApiKey(data || '');
        } catch (err) {
            console.error('Error fetching API key:', err);
            setApiKey(null);
        }
    };
    const modelOptions = {
        localWhisper: [], // Model selection handled by ModelManager component
        parakeet: [], // Model selection handled by ParakeetModelManager component
        deepgram: ['nova-2-phonecall'],
        elevenLabs: ['eleven_multilingual_v2'],
        groq: ['llama-3.3-70b-versatile'],
        openai: ['gpt-4o'],
    };
    const requiresApiKey = transcriptModelConfig.provider === 'deepgram' || transcriptModelConfig.provider === 'elevenLabs' || transcriptModelConfig.provider === 'openai' || transcriptModelConfig.provider === 'groq';

    const handleInputClick = () => {
        if (isApiKeyLocked) {
            setIsLockButtonVibrating(true);
            setTimeout(() => setIsLockButtonVibrating(false), 500);
        }
    };

    const handleWhisperModelSelect = (modelName: string) => {
        // Always update config when model is selected, regardless of current provider
        // This ensures the model is set when user switches back
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider: 'localWhisper', // Ensure provider is set correctly
            model: modelName
        });
        // Close modal after selection
        if (onModelSelect) {
            onModelSelect();
        }
    };

    const handleParakeetModelSelect = (modelName: string) => {
        // Always update config when model is selected, regardless of current provider
        // This ensures the model is set when user switches back
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider: 'parakeet', // Ensure provider is set correctly
            model: modelName
        });
        // Close modal after selection
        if (onModelSelect) {
            onModelSelect();
        }
    };

    return (
        <div className="space-y-8">
            <div>
                {/* <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{t('Transcript Settings')}</h3>
                </div> */}
                <div className="space-y-4 pb-6">
                    <div>
                        <Label className="block text-sm font-medium text-gray-700 mb-1">
                            {t("Transcript Model")}</Label>
                        <div className="flex space-x-2 mx-1">
                            <Select
                                value={uiProvider}
                                onValueChange={(value) => {
                                    const provider = value as TranscriptModelProps['provider'];
                                    setUiProvider(provider);
                                    if (provider !== 'localWhisper' && provider !== 'parakeet') {
                                        fetchApiKey(provider);
                                    }
                                }}
                            >
                                <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                    <SelectValue placeholder={t("Select provider")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="parakeet">{t("⚡ Parakeet (Recommended - Real-time / Accurate)")}</SelectItem>
                                    <SelectItem value="localWhisper">{t("🏠 Local Whisper (High Accuracy)")}</SelectItem>
                                    {/* <SelectItem value="deepgram">☁️ Deepgram (Backup)</SelectItem>
                                    <SelectItem value="elevenLabs">☁️ ElevenLabs</SelectItem>
                                    <SelectItem value="groq">☁️ Groq</SelectItem>
                                    <SelectItem value="openai">☁️ OpenAI</SelectItem> */}
                                </SelectContent>
                            </Select>

                            {uiProvider !== 'localWhisper' && uiProvider !== 'parakeet' && (
                                <Select
                                    value={transcriptModelConfig.model}
                                    onValueChange={(value) => {
                                        const model = value as TranscriptModelProps['model'];
                                        setTranscriptModelConfig({ ...transcriptModelConfig, provider: uiProvider, model });
                                    }}
                                >
                                    <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                        <SelectValue placeholder={t("Select model")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {modelOptions[uiProvider].map((model) => (
                                            <SelectItem key={model} value={model}>{model}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                        </div>
                    </div>

                    {uiProvider === 'localWhisper' && (
                        <div className="mt-6">
                            <ModelManager
                                selectedModel={transcriptModelConfig.provider === 'localWhisper' ? transcriptModelConfig.model : undefined}
                                onModelSelect={handleWhisperModelSelect}
                                autoSave={true}
                            />
                        </div>
                    )}

                    {uiProvider === 'parakeet' && (
                        <div className="mt-6">
                            <ParakeetModelManager
                                selectedModel={transcriptModelConfig.provider === 'parakeet' ? transcriptModelConfig.model : undefined}
                                onModelSelect={handleParakeetModelSelect}
                                autoSave={true}
                            />
                        </div>
                    )}


                    {requiresApiKey && (
                        <div>
                            <Label className="block text-sm font-medium text-gray-700 mb-1">
                                {t("API Key")}</Label>
                            <div className="relative mx-1">
                                <Input
                                    type={showApiKey ? "text" : "password"}
                                    className={`pr-24 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${isApiKeyLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                        }`}
                                    value={apiKey || ''}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    disabled={isApiKeyLocked}
                                    onClick={handleInputClick}
                                    placeholder={t("Enter your API key")}
                                />
                                {isApiKeyLocked && (
                                    <div
                                        onClick={handleInputClick}
                                        className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded-md cursor-not-allowed"
                                    />
                                )}
                                <div className="absolute inset-y-0 right-0 pr-1 flex items-center">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsApiKeyLocked(!isApiKeyLocked)}
                                        className={`transition-colors duration-200 ${isLockButtonVibrating ? 'animate-vibrate text-red-500' : ''
                                            }`}
                                        title={isApiKeyLocked ? "Unlock to edit" : "Lock to prevent editing"}
                                    >
                                        {isApiKeyLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                    >
                                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <LivePreviewModelManager />
            <LiveTranslationSettings />
        </div >
    )
}

interface TranslationSettingsData {
    provider: string;
    model: string;
    has_api_key: boolean;
    target_language: string;
    fallback_provider?: string;
    fallback_model?: string;
}

function LiveTranslationSettings() {
    const { modelConfig } = useConfig();
    const [settings, setSettings] = useState<TranslationSettingsData | null>(null);
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [model, setModel] = useState('llama-3.3-70b-versatile');
    const [models, setModels] = useState<string[]>(['llama-3.3-70b-versatile']);
    const [isSaving, setIsSaving] = useState(false);

    const loadSettings = async () => {
        const data = await invoke<TranslationSettingsData>('get_translation_settings');
        setSettings(data);
        setModel(data.model);
        if (data.has_api_key) {
            try {
                const available = await invoke<string[]>('list_groq_translation_models');
                setModels(available.includes(data.model) ? available : [data.model, ...available]);
            } catch {
                setModels([data.model]);
            }
        }
    };

    useEffect(() => {
        loadSettings().catch(error => console.warn('Failed to load translation settings:', String(error)));
    }, []);

    const save = async () => {
        setIsSaving(true);
        try {
            await invoke('save_translation_settings', {
                apiKey: apiKey.trim() || null,
                model,
                deleteKey: false,
            });
            setApiKey('');
            await loadSettings();
            toast.success(t('Live translation settings saved and verified'));
        } catch (error) {
            toast.error(t('Could not save live translation settings'), { description: String(error) });
        } finally {
            setIsSaving(false);
        }
    };

    const test = async () => {
        try {
            await invoke('test_translation_settings', { apiKey: apiKey.trim() || null, model });
            toast.success(t('Groq translation test succeeded'));
        } catch (error) {
            toast.error(t('Groq translation test failed'), { description: String(error) });
        }
    };

    const deleteKey = async () => {
        try {
            await invoke('save_translation_settings', { apiKey: null, model, deleteKey: true });
            setApiKey('');
            await loadSettings();
            toast.success(t('Groq Translation API key deleted'));
        } catch (error) {
            toast.error(t('Could not delete Groq Translation API key'), { description: String(error) });
        }
    };

    return (
        <section className="border-t border-gray-200 pt-8 space-y-5">
            <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('Live Translation')}</h3>
                <p className="text-sm text-gray-500 mt-1">{t('Translate each final transcript segment into Simplified Chinese while recording.')}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <Label>{t('Translation service')}</Label>
                    <Input value="Groq" disabled className="mt-1 bg-gray-50" />
                </div>
                <div>
                    <Label>{t('Target language')}</Label>
                    <Input value={t('Simplified Chinese')} disabled className="mt-1 bg-gray-50" />
                </div>
            </div>

            <div>
                <Label>{t('Groq Translation API Key')}</Label>
                <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                        <Input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={event => setApiKey(event.target.value)}
                            placeholder={settings?.has_api_key ? t('Saved key — enter a new key to replace it') : t('Enter your Groq API key')}
                            className="pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowApiKey(value => !value)}
                            className="absolute inset-y-0 right-0 px-3 text-gray-500"
                            aria-label={showApiKey ? t('Hide API key') : t('Show API key')}
                        >
                            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <Button variant="outline" size="icon" onClick={deleteKey} disabled={!settings?.has_api_key} title={t('Delete saved key')} aria-label={t('Delete saved key')}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div>
                <Label>{t('Translation model')}</Label>
                <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {models.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <div>
                <Label>{t('Fallback model')}</Label>
                <Input
                    value={modelConfig?.provider && modelConfig?.model ? `${modelConfig.provider} / ${modelConfig.model}` : t('Not configured')}
                    disabled
                    className="mt-1 bg-gray-50"
                />
            </div>

            <div className="flex gap-2">
                <Button variant="outline" onClick={test} disabled={isSaving}>
                    <RefreshCw className="h-4 w-4 mr-2" />{t('Test translation')}
                </Button>
                <Button onClick={save} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />{isSaving ? t('Verifying...') : t('Save and verify')}
                </Button>
            </div>
        </section>
    );
}



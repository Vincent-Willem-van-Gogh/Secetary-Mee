'use client';

import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Eye, EyeOff, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Provider = 'openai' | 'claude' | 'groq' | 'openrouter';
type Status = { provider: Provider; has_api_key: boolean };
type CustomConfig = {
  endpoint: string;
  model: string;
  maxTokens: number | null;
  temperature: number | null;
  topP: number | null;
  hasApiKey: boolean;
};

const providers: Array<{ id: Provider; name: string }> = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'claude', name: 'Claude' },
  { id: 'groq', name: 'Groq' },
  { id: 'openrouter', name: 'OpenRouter' },
];

export function CredentialSettings({ requestedProvider }: { requestedProvider?: string | null }) {
  const { t } = useI18n();
  const [statuses, setStatuses] = useState<Record<Provider, boolean>>({ openai: false, claude: false, groq: false, openrouter: false });
  const [keys, setKeys] = useState<Record<Provider, string>>({ openai: '', claude: '', groq: '', openrouter: '' });
  const [visible, setVisible] = useState<Record<Provider, boolean>>({ openai: false, claude: false, groq: false, openrouter: false });
  const [busy, setBusy] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [custom, setCustom] = useState({ endpoint: '', model: '', apiKey: '', maxTokens: '', temperature: '', topP: '', hasApiKey: false });
  const [showCustomKey, setShowCustomKey] = useState(false);

  const refresh = async () => {
    const [cloud, customConfig] = await Promise.all([
      invoke<Status[]>('get_cloud_credential_statuses'),
      invoke<CustomConfig | null>('api_get_custom_openai_config'),
    ]);
    setStatuses(current => ({ ...current, ...Object.fromEntries(cloud.map(item => [item.provider, item.has_api_key])) }));
    setCustom(current => customConfig ? {
      ...current,
      endpoint: customConfig.endpoint,
      model: customConfig.model,
      maxTokens: customConfig.maxTokens?.toString() ?? '',
      temperature: customConfig.temperature?.toString() ?? '',
      topP: customConfig.topP?.toString() ?? '',
      hasApiKey: customConfig.hasApiKey,
      apiKey: '',
    } : { endpoint: '', model: '', apiKey: '', maxTokens: '', temperature: '', topP: '', hasApiKey: false });
  };

  useEffect(() => { refresh().catch(error => toast.error(t('Could not load API credentials'), { description: String(error) })); }, []);
  useEffect(() => { refs.current[requestedProvider || '']?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [requestedProvider]);

  const save = async (provider: Provider) => {
    setBusy(provider);
    try {
      await invoke('save_cloud_credential', { provider, apiKey: keys[provider] });
      setKeys(current => ({ ...current, [provider]: '' }));
      await refresh();
      toast.success(t('API credential saved and verified'));
    } catch (error) {
      toast.error(t('Could not save API credential'), { description: String(error) });
    } finally { setBusy(null); }
  };

  const test = async (provider: Provider) => {
    setBusy(provider);
    try {
      await invoke('test_cloud_credential', { provider, apiKey: keys[provider].trim() || null });
      toast.success(t('API credential test succeeded'));
    } catch (error) {
      toast.error(t('API credential test failed'), { description: String(error) });
    } finally { setBusy(null); }
  };

  const remove = async (provider: Provider) => {
    const message = provider === 'groq'
      ? t('Deleting the Groq credential stops both live translation and Groq summaries. Continue?')
      : t('Deleting this credential stops summaries that use this provider. Continue?');
    if (!window.confirm(message)) return;
    setBusy(provider);
    try {
      await invoke('delete_cloud_credential', { provider });
      await refresh();
      toast.success(t('API credential deleted'));
    } catch (error) {
      toast.error(t('Could not delete API credential'), { description: String(error) });
    } finally { setBusy(null); }
  };

  const saveCustom = async () => {
    setBusy('custom-openai');
    try {
      await invoke('api_save_custom_openai_config', {
        endpoint: custom.endpoint,
        model: custom.model,
        apiKey: custom.apiKey.trim() || null,
        maxTokens: custom.maxTokens ? Number(custom.maxTokens) : null,
        temperature: custom.temperature ? Number(custom.temperature) : null,
        topP: custom.topP ? Number(custom.topP) : null,
        deleteKey: false,
      });
      await refresh();
      toast.success(t('Custom server saved and verified'));
    } catch (error) {
      toast.error(t('Could not save custom server'), { description: String(error) });
    } finally { setBusy(null); }
  };

  const testCustom = async () => {
    setBusy('custom-openai');
    try {
      await invoke('api_test_custom_openai_connection', { endpoint: custom.endpoint, model: custom.model, apiKey: custom.apiKey.trim() || null });
      toast.success(t('API credential test succeeded'));
    } catch (error) {
      toast.error(t('API credential test failed'), { description: String(error) });
    } finally { setBusy(null); }
  };

  const deleteCustom = async () => {
    if (!window.confirm(t('Deleting this configuration stops summaries that use the custom server. Continue?'))) return;
    setBusy('custom-openai');
    try {
      await invoke('api_delete_custom_openai_config');
      await refresh();
      toast.success(t('Custom server configuration deleted'));
    } catch (error) {
      toast.error(t('Could not delete custom server'), { description: String(error) });
    } finally { setBusy(null); }
  };

  const status = (configured: boolean) => (
    <span className={configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
      {configured ? t('Configured') : t('Not configured')}
    </span>
  );

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary"><KeyRound className="h-5 w-5" /></div>
        <div><h2 className="text-lg font-semibold">{t('API Credentials')}</h2><p className="text-sm text-muted-foreground">{t('Manage cloud credentials in one place. Saved keys never appear in the interface.')}</p></div>
      </div>
      {providers.map(provider => (
        <div key={provider.id} ref={node => { refs.current[provider.id] = node; }} className="rounded-[18px] border bg-card p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{provider.name}</h3>{status(statuses[provider.id])}</div>
          <Label htmlFor={`${provider.id}-key`}>{t('API Key')}</Label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <Input id={`${provider.id}-key`} type={visible[provider.id] ? 'text' : 'password'} value={keys[provider.id]} onChange={event => setKeys(current => ({ ...current, [provider.id]: event.target.value }))} placeholder={statuses[provider.id] ? t('Enter a new key to replace the saved credential') : t('Enter API key')} className="pr-10" />
              <button type="button" className="absolute inset-y-0 right-0 px-3 text-muted-foreground" onClick={() => setVisible(current => ({ ...current, [provider.id]: !current[provider.id] }))} aria-label={visible[provider.id] ? t('Hide API key') : t('Show API key')}>{visible[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <Button onClick={() => save(provider.id)} disabled={busy !== null || !keys[provider.id].trim()}><Save className="mr-2 h-4 w-4" />{t('Save and verify')}</Button>
            <Button variant="outline" onClick={() => test(provider.id)} disabled={busy !== null || (!statuses[provider.id] && !keys[provider.id].trim())}><RefreshCw className="mr-2 h-4 w-4" />{t('Test')}</Button>
            <Button variant="outline" size="icon" onClick={() => remove(provider.id)} disabled={busy !== null || !statuses[provider.id]} aria-label={t('Delete')}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}

      <div ref={node => { refs.current['custom-openai'] = node; }} className="rounded-[18px] border bg-card p-5">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{t('Custom OpenAI-compatible Server')}</h3>{status(Boolean(custom.endpoint && custom.model))}</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>{t('Endpoint URL')}</Label><Input className="mt-1" value={custom.endpoint} onChange={event => setCustom(current => ({ ...current, endpoint: event.target.value }))} placeholder="http://localhost:8000/v1" /></div>
          <div><Label>{t('Model Name')}</Label><Input className="mt-1" value={custom.model} onChange={event => setCustom(current => ({ ...current, model: event.target.value }))} /></div>
          <div className="md:col-span-2"><Label>{t('API Key (optional)')}</Label><div className="relative mt-1"><Input type={showCustomKey ? 'text' : 'password'} value={custom.apiKey} onChange={event => setCustom(current => ({ ...current, apiKey: event.target.value }))} placeholder={custom.hasApiKey ? t('Enter a new key to replace the saved credential') : t('Leave empty if not required')} className="pr-10" /><button type="button" className="absolute inset-y-0 right-0 px-3 text-muted-foreground" onClick={() => setShowCustomKey(value => !value)} aria-label={showCustomKey ? t('Hide API key') : t('Show API key')}>{showCustomKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <div><Label>{t('Max Tokens')}</Label><Input type="number" className="mt-1" value={custom.maxTokens} onChange={event => setCustom(current => ({ ...current, maxTokens: event.target.value }))} /></div>
          <div><Label>{t('Temperature (0.0-2.0)')}</Label><Input type="number" min="0" max="2" step="0.1" className="mt-1" value={custom.temperature} onChange={event => setCustom(current => ({ ...current, temperature: event.target.value }))} /></div>
          <div><Label>{t('Top P (0.0-1.0)')}</Label><Input type="number" min="0" max="1" step="0.1" className="mt-1" value={custom.topP} onChange={event => setCustom(current => ({ ...current, topP: event.target.value }))} /></div>
        </div>
        <div className="mt-4 flex gap-2"><Button onClick={saveCustom} disabled={busy !== null || !custom.endpoint.trim() || !custom.model.trim()}><Save className="mr-2 h-4 w-4" />{t('Save and verify')}</Button><Button variant="outline" onClick={testCustom} disabled={busy !== null || !custom.endpoint.trim() || !custom.model.trim()}><RefreshCw className="mr-2 h-4 w-4" />{t('Test')}</Button><Button variant="outline" onClick={deleteCustom} disabled={busy !== null || !custom.endpoint}>{t('Delete')}</Button></div>
      </div>
    </div>
  );
}

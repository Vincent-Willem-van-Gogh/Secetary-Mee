'use client';

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmationModal } from '@/components/ConfirmationModel/confirmation-modal';

type SectionFormat = 'paragraph' | 'list' | 'string';
type TemplateSection = { title: string; instruction: string; format: SectionFormat };
type TemplateInfo = { id: string; name: string; description: string; source: 'built_in' | 'custom' };
type TemplateDetails = TemplateInfo & { sections: TemplateSection[] };

const emptySection = (): TemplateSection => ({ title: '', instruction: '', format: 'paragraph' });

export function SummaryTemplateSettings() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<TemplateDetails | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '', sections: [emptySection()] });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadTemplates = useCallback(async (preferredId?: string) => {
    const loaded = await invoke<TemplateInfo[]>('api_list_templates');
    setTemplates(loaded);
    setSelectedId(preferredId && loaded.some(item => item.id === preferredId)
      ? preferredId
      : selectedId && loaded.some(item => item.id === selectedId)
        ? selectedId
        : loaded[0]?.id ?? null);
  }, [selectedId]);

  useEffect(() => { void loadTemplates().catch(error => toast.error(t('Could not load summary templates'), { description: String(error) })); }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }
    invoke<TemplateDetails>('api_get_template_details', { templateId: selectedId })
      .then(setDetails)
      .catch(error => toast.error(t('Could not load template preview'), { description: String(error) }));
  }, [selectedId, t]);

  const openEditor = (template?: TemplateDetails, edit = false) => {
    setEditingId(edit && template?.source === 'custom' ? template.id : null);
    setDraft(template ? {
      name: edit ? template.name : `${template.name} ${t('Copy')}`,
      description: template.description,
      sections: template.sections.map(section => ({ ...section })),
    } : { name: '', description: '', sections: [emptySection()] });
    setEditorOpen(true);
  };

  const updateSection = (index: number, patch: Partial<TemplateSection>) => {
    setDraft(current => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) => sectionIndex === index ? { ...section, ...patch } : section),
    }));
  };

  const saveTemplate = async () => {
    setSaving(true);
    try {
      const saved = await invoke<TemplateInfo>('api_save_custom_template', {
        templateId: editingId,
        templateJson: JSON.stringify(draft),
      });
      setEditorOpen(false);
      await loadTemplates(saved.id);
      toast.success(t('Custom template saved'));
    } catch (error) {
      toast.error(t('Could not save custom template'), { description: String(error) });
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async () => {
    if (!deleteId) return;
    try {
      await invoke('api_delete_custom_template', { templateId: deleteId });
      setDeleteId(null);
      setDetails(null);
      setSelectedId(null);
      await loadTemplates();
      toast.success(t('Custom template deleted'));
    } catch (error) {
      toast.error(t('Could not delete custom template'), { description: String(error) });
    }
  };

  return (
    <div className="rounded-[18px] border bg-card p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t('Summary Templates')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('Preview built-in templates or create your own summary structure.')}</p>
        </div>
        <Button onClick={() => openEditor()}><Plus />{t('New Template')}</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-2">
          {templates.map(template => (
            <button
              key={template.id}
              type="button"
              onClick={() => setSelectedId(template.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${selectedId === template.id ? 'border-primary bg-accent' : 'hover:bg-accent/60'}`}
            >
              <span className="block font-semibold text-foreground">{t(template.name)}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{template.source === 'custom' ? t('Custom') : t('Built-in')}</span>
            </button>
          ))}
        </div>

        {details && (
          <div className="rounded-xl border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold">{t(details.name)}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{t(details.description)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => openEditor(details)} title={t('Copy as custom template')} aria-label={t('Copy as custom template')}><Copy /></Button>
                {details.source === 'custom' && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => openEditor(details, true)} title={t('Edit custom template')} aria-label={t('Edit custom template')}><Pencil /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(details.id)} title={t('Delete custom template')} aria-label={t('Delete custom template')}><Trash2 /></Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {details.sections.map((section, index) => (
                <div key={`${section.title}-${index}`} className="rounded-xl bg-secondary px-4 py-3">
                  <div className="font-semibold">{section.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{section.instruction}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? t('Edit Custom Template') : t('New Custom Template')}</DialogTitle>
            <DialogDescription>{t('Define the sections and instructions used to generate the meeting summary.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder={t('Template name')} maxLength={80} />
            <Textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder={t('Template description')} maxLength={240} />
            {draft.sections.map((section, index) => (
              <div key={index} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t('Section')} {index + 1}</span>
                  {draft.sections.length > 1 && <Button variant="ghost" size="icon" onClick={() => setDraft(current => ({ ...current, sections: current.sections.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={t('Remove section')}><X /></Button>}
                </div>
                <Input value={section.title} onChange={event => updateSection(index, { title: event.target.value })} placeholder={t('Section title')} maxLength={80} />
                <Textarea value={section.instruction} onChange={event => updateSection(index, { instruction: event.target.value })} placeholder={t('Instruction for the AI')} maxLength={2000} />
                <Select value={section.format} onValueChange={(value: SectionFormat) => updateSection(index, { format: value })}>
                  <SelectTrigger aria-label={t('Output format')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paragraph">{t('Paragraph')}</SelectItem>
                    <SelectItem value="list">{t('List')}</SelectItem>
                    <SelectItem value="string">{t('Short text')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button variant="outline" onClick={() => setDraft(current => ({ ...current, sections: [...current.sections, emptySection()] }))}><Plus />{t('Add Section')}</Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>{t('Cancel')}</Button>
            <Button onClick={saveTemplate} disabled={saving}>{saving ? t('Saving...') : t('Save Template')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={Boolean(deleteId)}
        text={t('Delete this custom template? This cannot be undone.')}
        onCancel={() => setDeleteId(null)}
        onConfirm={deleteTemplate}
      />
    </div>
  );
}

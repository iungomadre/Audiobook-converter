import { AUDIO_PRESETS, type BookMetadata, type BookStore } from '@/entities/book';
import { tr, trAttr, type MessageKey } from '@/shared/i18n';
import { normalizeCover } from '@/shared/lib/image';
import { h } from '@/shared/ui';

type TextField = { key: keyof BookMetadata; label: MessageKey; placeholder?: MessageKey; multiline?: boolean; inputMode?: string };

const FIELDS: TextField[] = [
  { key: 'title', label: 'meta.title' },
  { key: 'author', label: 'meta.author' },
  { key: 'narrator', label: 'meta.narrator' },
  { key: 'year', label: 'meta.year', placeholder: 'meta.yearPlaceholder', inputMode: 'numeric' },
  { key: 'genre', label: 'meta.genre' },
  { key: 'description', label: 'meta.description', multiline: true },
];

type MetadataFormOptions = {
  /** Extra controls shown under the cover, e.g. an online cover search button. */
  coverActions?: HTMLElement[];
};

export const createMetadataForm = (store: BookStore, { coverActions = [] }: MetadataFormOptions = {}): HTMLElement => {
  const inputs = new Map<keyof BookMetadata, HTMLInputElement | HTMLTextAreaElement>();

  const fields = FIELDS.map((field) => {
    const id = `meta-${field.key}`;
    const control = field.multiline
      ? h('textarea', { id, rows: 4 })
      : h('input', { id, type: 'text', inputMode: field.inputMode ?? 'text' });
    if (field.placeholder) trAttr(control, 'placeholder', field.placeholder);
    control.addEventListener('input', () => store.updateMetadata({ [field.key]: control.value }));
    inputs.set(field.key, control);
    return h('div', { class: field.multiline ? 'field wide' : 'field' }, h('label', { htmlFor: id }, tr(field.label)), control);
  });

  const presetSelect = h('select', { id: 'meta-preset', onchange: () => store.setPreset(presetSelect.value) },
    ...AUDIO_PRESETS.map((preset) => h('option', { value: preset.id }, tr(preset.labelKey))));
  fields.push(h('div', { class: 'field wide' }, h('label', { htmlFor: 'meta-preset' }, tr('meta.quality')), presetSelect));

  const coverInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const coverPreview = trAttr(h('img', { class: 'cover-image' }), 'alt', 'cover.preview');
  const coverPlaceholder = h('span', { class: 'cover-placeholder' }, tr('cover.add'));
  const coverError = h('p', { class: 'error', attrs: { role: 'alert' } });
  const removeCover = h('button', { type: 'button', class: 'btn small', onclick: () => store.setCover(null) }, tr('cover.remove'));

  const useImage = async (blob: Blob) => {
    coverError.replaceChildren();
    try {
      const image = await normalizeCover(blob);
      const previewUrl = URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.mimeType }));
      store.setCover({ ...image, previewUrl });
    } catch {
      coverError.replaceChildren(tr('cover.unreadable'));
    }
  };

  coverInput.addEventListener('change', () => {
    const file = coverInput.files?.[0];
    coverInput.value = '';
    if (file) void useImage(file);
  });

  const coverButton = trAttr(
    h('button', { type: 'button', class: 'cover-button', onclick: () => coverInput.click() }, coverPreview, coverPlaceholder),
    'title', 'cover.chooseHint');
  coverButton.addEventListener('dragover', (event) => {
    event.preventDefault();
    coverButton.classList.add('is-over');
  });
  coverButton.addEventListener('dragleave', () => coverButton.classList.remove('is-over'));
  coverButton.addEventListener('drop', (event) => {
    event.preventDefault();
    coverButton.classList.remove('is-over');
    const file = Array.from(event.dataTransfer?.files ?? []).find((candidate) => candidate.type.startsWith('image/'));
    if (file) void useImage(file);
  });

  const cover = h('div', { class: 'cover' },
    coverButton,
    h('div', { class: 'row' }, ...coverActions, removeCover),
    coverError,
    coverInput,
  );

  store.subscribe(({ metadata, cover: current, presetId }) => {
    for (const [key, control] of inputs) {
      if (control.value !== metadata[key] && document.activeElement !== control) control.value = metadata[key];
    }
    presetSelect.value = presetId;
    coverPreview.hidden = !current;
    coverPlaceholder.hidden = !!current;
    removeCover.hidden = !current;
    if (current) coverPreview.src = current.previewUrl;
  });

  return h('div', { class: 'metadata' }, cover, h('div', { class: 'fields' }, ...fields));
};

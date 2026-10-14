import { AUDIO_PRESETS, type BookMetadata, type BookStore } from '@/entities/book';
import { normalizeCover } from '@/shared/lib/image';
import { h } from '@/shared/ui';

type TextField = { key: keyof BookMetadata; label: string; placeholder?: string; multiline?: boolean; inputMode?: string };

const FIELDS: TextField[] = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'narrator', label: 'Narrator' },
  { key: 'year', label: 'Year', placeholder: 'e.g. 2024', inputMode: 'numeric' },
  { key: 'genre', label: 'Genre' },
  { key: 'description', label: 'Description', multiline: true },
];

export const createMetadataForm = (store: BookStore): HTMLElement => {
  const inputs = new Map<keyof BookMetadata, HTMLInputElement | HTMLTextAreaElement>();

  const fields = FIELDS.map((field) => {
    const id = `meta-${field.key}`;
    const control = field.multiline
      ? h('textarea', { id, rows: 4 })
      : h('input', { id, type: 'text', placeholder: field.placeholder ?? '', inputMode: field.inputMode ?? 'text' });
    control.addEventListener('input', () => store.updateMetadata({ [field.key]: control.value }));
    inputs.set(field.key, control);
    return h('div', { class: field.multiline ? 'field wide' : 'field' }, h('label', { htmlFor: id }, field.label), control);
  });

  const presetSelect = h('select', { id: 'meta-preset', onchange: () => store.setPreset(presetSelect.value) },
    ...AUDIO_PRESETS.map((preset) => h('option', { value: preset.id }, preset.label)));
  fields.push(h('div', { class: 'field wide' }, h('label', { htmlFor: 'meta-preset' }, 'Audio quality'), presetSelect));

  const coverInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const coverPreview = h('img', { class: 'cover-image', alt: 'Cover preview' });
  const coverPlaceholder = h('span', { class: 'cover-placeholder' }, 'Add cover');
  const coverError = h('p', { class: 'error', attrs: { role: 'alert' } });
  const removeCover = h('button', { type: 'button', class: 'btn small', onclick: () => store.setCover(null) }, 'Remove cover');

  coverInput.addEventListener('change', async () => {
    const file = coverInput.files?.[0];
    coverInput.value = '';
    if (!file) return;
    coverError.textContent = '';
    try {
      const image = await normalizeCover(file);
      const previewUrl = URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.mimeType }));
      store.setCover({ ...image, previewUrl });
    } catch {
      coverError.textContent = 'This image could not be read. Try a JPEG or PNG file.';
    }
  });

  const cover = h('div', { class: 'cover' },
    h('button', { type: 'button', class: 'cover-button', title: 'Choose cover image', onclick: () => coverInput.click() },
      coverPreview, coverPlaceholder),
    removeCover,
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

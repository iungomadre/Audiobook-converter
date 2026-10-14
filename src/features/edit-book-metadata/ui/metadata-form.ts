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

type MetadataFormOptions = {
  /** Extra controls shown under the cover, e.g. an online cover search button. */
  coverActions?: HTMLElement[];
  /** Optional help text shown under the cover controls. */
  coverHint?: HTMLElement;
};

export const createMetadataForm = (store: BookStore, { coverActions = [], coverHint }: MetadataFormOptions = {}): HTMLElement => {
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

  const useImage = async (blob: Blob) => {
    coverError.textContent = '';
    try {
      const image = await normalizeCover(blob);
      const previewUrl = URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.mimeType }));
      store.setCover({ ...image, previewUrl });
    } catch {
      coverError.textContent = 'This image could not be read. Try a JPEG or PNG file.';
    }
  };

  coverInput.addEventListener('change', () => {
    const file = coverInput.files?.[0];
    coverInput.value = '';
    if (file) void useImage(file);
  });

  // Paste button: reads an image copied anywhere (store page, Files, mail) via the async clipboard API.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  const pasteButton = typeof clipboard?.read === 'function'
    ? h('button', { type: 'button', class: 'btn small', title: 'Paste an image you copied' }, 'Paste')
    : null;
  pasteButton?.addEventListener('click', async () => {
    try {
      for (const item of await clipboard!.read()) {
        const type = item.types.find((candidate) => candidate.startsWith('image/'));
        if (type) return void (await useImage(await item.getType(type)));
      }
      coverError.textContent = 'The clipboard has no image. Copy a cover image first.';
    } catch {
      coverError.textContent = 'Could not read the clipboard. Allow pasting when the browser asks.';
    }
  });

  // Ctrl/⌘+V anywhere on the page, unless the user is pasting into a text field.
  document.addEventListener('paste', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable]')) return;
    const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith('image/'));
    if (file) {
      event.preventDefault();
      void useImage(file);
    }
  });

  const coverButton = h('button', { type: 'button', class: 'cover-button', title: 'Choose, paste or drop a cover image', onclick: () => coverInput.click() },
    coverPreview, coverPlaceholder);
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
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn small', onclick: () => coverInput.click() }, 'Upload'),
      pasteButton,
      ...coverActions,
      removeCover),
    coverHint,
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

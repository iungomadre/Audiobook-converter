import { tr } from '@/shared/i18n';
import type { BookStore } from '@/entities/book';
import { h } from '@/shared/ui';
import { fromDataTransfer, fromFileList, type PickedFile } from '../lib/collect-files';
import { loadFiles } from '../model/load-files';

export const createFilePicker = (store: BookStore): HTMLElement => {
  const status = h('p', { class: 'muted', attrs: { role: 'status' } });

  const handle = async (files: PickedFile[]) => {
    status.replaceChildren(tr('files.reading'));
    const audioCount = await loadFiles(store, files);
    status.replaceChildren(audioCount ? '' : tr('files.noAudio'));
  };

  const folderInput = h('input', { type: 'file', multiple: true, hidden: true, attrs: { webkitdirectory: '' } });
  const filesInput = h('input', { type: 'file', multiple: true, hidden: true, accept: 'audio/*,.mp3,.m4a,.m4b' });
  for (const input of [folderInput, filesInput]) {
    input.addEventListener('change', () => {
      if (input.files?.length) void handle(fromFileList(input.files));
      input.value = '';
    });
  }

  // Folder picking is unavailable on most mobile browsers; multi-file picking works everywhere.
  const supportsFolders = 'webkitdirectory' in HTMLInputElement.prototype && !/Android|iPhone|iPad/i.test(navigator.userAgent);

  const dropzone = h('div', { class: 'dropzone' },
    h('p', { class: 'dropzone-title' }, tr('files.drop')),
    h('p', { class: 'muted' }, tr('files.or')),
    h('div', { class: 'row center' },
      supportsFolders && h('button', { type: 'button', class: 'btn primary', onclick: () => folderInput.click() }, tr('files.chooseFolder')),
      h('button', { type: 'button', class: supportsFolders ? 'btn' : 'btn primary', onclick: () => filesInput.click() }, tr('files.chooseFiles')),
    ),
    folderInput,
    filesInput,
  );

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-over');
    if (event.dataTransfer) void fromDataTransfer(event.dataTransfer).then(handle);
  });

  return h('div', {}, dropzone, status);
};

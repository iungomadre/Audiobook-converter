import { getPreset, totalDuration, type BookStore } from '@/entities/book';
import { formatBytes, formatDuration, sanitizeFileName } from '@/shared/lib/format';
import { getOutputFile, interruptedFlag, saveFile } from '@/shared/lib/storage';
import { h } from '@/shared/ui';
import { checkStorage, getUnsupportedReason } from '../lib/capabilities';
import { createConversion, type ConversionState } from '../model/conversion';

const outputFileName = (store: BookStore): string => {
  const { title, author } = store.get().metadata;
  return `${sanitizeFileName([author, title].filter(Boolean).join(' - ') || 'Audiobook')}.m4b`;
};

type ConvertPanelOptions = {
  /** Called when a conversion starts (true) or stops for any reason (false). */
  onBusyChange?: (busy: boolean) => void;
};

export const createConvertPanel = (store: BookStore, { onBusyChange }: ConvertPanelOptions = {}): HTMLElement => {
  const wasInterrupted = interruptedFlag.consume();
  const conversion = createConversion();
  const unsupported = getUnsupportedReason();
  const interruptedNotice = h('p', { class: 'notice', hidden: !wasInterrupted, attrs: { role: 'alert' } },
    'Your previous conversion was interrupted and the page was reloaded. On iPhone and iPad this happens when the ' +
    'screen locks, you switch to another app, or Safari runs out of memory. Keep Safari open with the screen on ' +
    'and try again.');

  const estimate = h('p', { class: 'muted' });
  const message = h('p', { attrs: { role: 'status' } });
  const progressBar = h('progress', { max: 1, value: 0 });
  const progressText = h('p', { class: 'muted' });
  const progress = h('div', { class: 'progress' }, progressBar, progressText);

  const convertButton = h('button', { type: 'button', class: 'btn primary large' }, 'Create M4B');
  const cancelButton = h('button', { type: 'button', class: 'btn', onclick: () => conversion.cancel() }, 'Cancel');
  const saveButton = h('button', { type: 'button', class: 'btn primary large' }, 'Save audiobook');
  const againButton = h('button', { type: 'button', class: 'btn', onclick: () => conversion.reset() }, 'Convert again');

  convertButton.addEventListener('click', async () => {
    const book = store.get();
    const total = totalDuration(book.chapters);
    if (total !== null) {
      const warning = await checkStorage((getPreset(book.presetId).bitrate / 8) * total);
      if (warning && !confirm(`${warning}\n\nTry anyway?`)) return;
    }
    interruptedNotice.hidden = true;
    await conversion.start(book);
  });

  saveButton.addEventListener('click', async () => {
    const state = conversion.get();
    if (state.status !== 'done') return;
    saveButton.disabled = true;
    try {
      await saveFile(await getOutputFile(state.outputName), outputFileName(store));
    } catch (error) {
      message.textContent = `Saving failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saveButton.disabled = false;
    }
  });

  const render = (state: ConversionState) => {
    const { chapters, presetId } = store.get();
    const total = totalDuration(chapters);
    const preset = getPreset(presetId);
    const running = state.status === 'running';

    convertButton.hidden = running || state.status === 'done';
    convertButton.disabled = !!unsupported || chapters.length === 0;
    cancelButton.hidden = !running;
    saveButton.hidden = againButton.hidden = state.status !== 'done';
    progress.hidden = !running;

    estimate.hidden = running || state.status === 'done' || chapters.length === 0;
    estimate.textContent = total === null ? '' : `Length ${formatDuration(total)} · estimated size ${formatBytes((preset.bitrate / 8) * total)}`;

    message.className = state.status === 'error' || unsupported ? 'error' : '';
    if (unsupported) message.textContent = unsupported;
    else if (state.status === 'error') message.textContent = `Conversion failed: ${state.message}`;
    else if (state.status === 'done') {
      message.textContent = `Done! ${formatDuration(state.durationSeconds)} of audio, ${formatBytes(state.size)}, ` +
        `converted in ${formatDuration(state.elapsedMs / 1000)}.`;
    } else if (chapters.length === 0) message.textContent = 'Add the audio files of your book to start.';
    else message.textContent = '';

    if (state.status === 'running' && state.progress) {
      const { processedSeconds, totalSeconds, chapterIndex } = state.progress;
      const fraction = totalSeconds ? Math.min(1, processedSeconds / totalSeconds) : 0;
      progressBar.value = fraction;
      const elapsed = (Date.now() - state.startedAt) / 1000;
      const remaining = fraction > 0.01 ? elapsed / fraction - elapsed : null;
      progressText.textContent = [
        `Chapter ${chapterIndex + 1} of ${chapters.length}`,
        totalSeconds ? `${Math.floor(fraction * 100)}%` : formatDuration(processedSeconds),
        remaining !== null ? `about ${formatDuration(remaining)} left` : 'estimating time…',
      ].join(' · ');
    }
  };

  conversion.subscribe(render);
  let busy = false;
  conversion.subscribe((state) => {
    if ((state.status === 'running') === busy) return;
    busy = !busy;
    onBusyChange?.(busy);
  });
  // Keep the estimate and button state in sync with the book being edited.
  store.subscribe(() => render(conversion.get()));

  return h('div', { class: 'convert' },
    interruptedNotice,
    estimate,
    h('div', { class: 'row' }, convertButton, saveButton, cancelButton, againButton),
    progress,
    message,
    h('p', { class: 'muted small' },
      'Everything happens on this device — your files are never uploaded. Keep this tab open and in front while converting; on phones, keep the screen on.'),
  );
};

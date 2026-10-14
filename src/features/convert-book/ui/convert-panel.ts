import { getPreset, totalDuration, type BookStore } from '@/entities/book';
import { onLanguageChange, t, tr } from '@/shared/i18n';
import { formatBytes, formatDuration, sanitizeFileName } from '@/shared/lib/format';
import { getOutputFile, interruptedFlag, saveFile } from '@/shared/lib/storage';
import { h } from '@/shared/ui';
import { getUnsupportedReason, isStorageLow } from '../lib/capabilities';
import { createConversion, type ConversionState } from '../model/conversion';
import type { ErrorInfo } from '../model/errors';

const outputFileName = (store: BookStore): string => {
  const { title, author } = store.get().metadata;
  return `${sanitizeFileName([author, title].filter(Boolean).join(' - ') || t('convert.defaultFileName'))}.m4b`;
};

const describeError = ({ key, params, message }: ErrorInfo): string => (key ? t(key, params) : message);

type ConvertPanelOptions = {
  /** Called when a conversion starts (true) or stops for any reason (false). */
  onBusyChange?: (busy: boolean) => void;
};

export const createConvertPanel = (store: BookStore, { onBusyChange }: ConvertPanelOptions = {}): HTMLElement => {
  const wasInterrupted = interruptedFlag.consume();
  const conversion = createConversion();
  const unsupported = getUnsupportedReason();
  let saveError: string | null = null;

  const interruptedNotice = h('p', { class: 'notice', hidden: !wasInterrupted, attrs: { role: 'alert' } }, tr('convert.interrupted'));
  const estimate = h('p', { class: 'muted' });
  const message = h('p', { attrs: { role: 'status' } });
  const progressBar = h('progress', { max: 1, value: 0 });
  const progressText = h('p', { class: 'muted' });
  const progress = h('div', { class: 'progress' }, progressBar, progressText);

  const convertButton = h('button', { type: 'button', class: 'btn primary large' }, tr('convert.create'));
  const cancelButton = h('button', { type: 'button', class: 'btn', onclick: () => conversion.cancel() }, tr('convert.cancel'));
  const saveButton = h('button', { type: 'button', class: 'btn primary large' }, tr('convert.save'));
  const againButton = h('button', { type: 'button', class: 'btn', onclick: () => conversion.reset() }, tr('convert.again'));

  convertButton.addEventListener('click', async () => {
    const book = store.get();
    const total = totalDuration(book.chapters);
    if (total !== null && await isStorageLow((getPreset(book.presetId).bitrate / 8) * total)) {
      if (!confirm(`${t('convert.lowStorage')}\n\n${t('convert.tryAnyway')}`)) return;
    }
    interruptedNotice.hidden = true;
    saveError = null;
    await conversion.start(book);
  });

  saveButton.addEventListener('click', async () => {
    const state = conversion.get();
    if (state.status !== 'done') return;
    saveButton.disabled = true;
    saveError = null;
    try {
      await saveFile(await getOutputFile(state.outputName), outputFileName(store));
    } catch (error) {
      saveError = error instanceof Error ? error.message : String(error);
    } finally {
      saveButton.disabled = false;
      render(conversion.get());
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
    estimate.textContent = total === null
      ? ''
      : t('convert.estimate', { length: formatDuration(total), size: formatBytes((preset.bitrate / 8) * total) });

    message.className = state.status === 'error' || unsupported || saveError ? 'error' : '';
    if (unsupported) message.textContent = t(unsupported);
    else if (state.status === 'error') message.textContent = t('convert.failed', { reason: describeError(state.error) });
    else if (saveError) message.textContent = t('convert.saveFailed', { reason: saveError });
    else if (state.status === 'done') {
      message.textContent = t('convert.done', {
        length: formatDuration(state.durationSeconds),
        size: formatBytes(state.size),
        time: formatDuration(state.elapsedMs / 1000),
      });
    } else if (chapters.length === 0) message.textContent = t('convert.empty');
    else message.textContent = '';

    if (state.status === 'running' && state.progress) {
      const { processedSeconds, totalSeconds, chapterIndex } = state.progress;
      const fraction = totalSeconds ? Math.min(1, processedSeconds / totalSeconds) : 0;
      progressBar.value = fraction;
      const elapsed = (Date.now() - state.startedAt) / 1000;
      const remaining = fraction > 0.01 ? elapsed / fraction - elapsed : null;
      progressText.textContent = [
        t('convert.progressChapter', { n: chapterIndex + 1, total: chapters.length }),
        totalSeconds ? `${Math.floor(fraction * 100)}%` : formatDuration(processedSeconds),
        remaining !== null ? t('convert.timeLeft', { time: formatDuration(remaining) }) : t('convert.estimating'),
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
  // Keep the estimate and button state in sync with the book and the language.
  store.subscribe(() => render(conversion.get()));
  onLanguageChange(() => render(conversion.get()));

  return h('div', { class: 'convert' },
    interruptedNotice,
    estimate,
    h('div', { class: 'row' }, convertButton, saveButton, cancelButton, againButton),
    progress,
    message,
    h('p', { class: 'muted small' }, tr('convert.privacy')),
  );
};

import { forgetRememberedChapters, getPreset, setConversionPending, totalDuration, type BookStore } from '@/entities/book';
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
  /** Called when the user drops an unfinished conversion to start anew with the files now picked. */
  onStartFresh?: () => void;
};

/** Upper bound of the pinned status bar's height, in CSS pixels. */
const STATUS_BAR_MAX_HEIGHT = 80;

export type ConvertPanel = {
  panel: HTMLElement;
  /** Slim progress bar for the top of the screen, shown while converting and the panel is out of view. */
  statusBar: HTMLElement;
  /** Notices about an interrupted conversion, meant for the top of the page (where a reloaded page opens). */
  banner: HTMLElement;
  /** Cancels any conversion and deletes its unfinished work. */
  discard: () => void;
  /** True if an unfinished conversion is saved on the device. */
  hasSavedProgress: () => boolean;
};

export const createConvertPanel = (store: BookStore, { onBusyChange, onStartFresh }: ConvertPanelOptions = {}): ConvertPanel => {
  const wasInterrupted = interruptedFlag.consume();
  const conversion = createConversion();
  const unsupported = getUnsupportedReason();
  let saveError: string | null = null;

  // Reassurance first; the technical reason is one tap away for those who want it.
  const explanation = () => h('details', { class: 'why' },
    h('summary', {}, h('span', { class: 'why-icon', attrs: { 'aria-hidden': 'true' } }, '?'), tr('interrupted.why')),
    h('p', {}, tr('interrupted.explanation')));
  const interruptedNotice = h('div', { class: 'notice', hidden: true, attrs: { role: 'alert' } },
    h('strong', {}, tr('interrupted.title')), h('p', {}, tr('interrupted.body')), explanation());
  const resumeTitle = h('strong', {});
  const resumeNotice = h('div', { class: 'notice', attrs: { role: 'alert' } },
    resumeTitle, h('p', {}, tr('resume.body')), explanation());
  const startFreshButton = h('button', { type: 'button', class: 'btn small' }, tr('convert.startNew'));
  const differentFilesNotice = h('div', { class: 'notice', attrs: { role: 'alert' } },
    h('p', {}), startFreshButton);
  const banner = h('div', { class: 'banner' }, interruptedNotice, resumeNotice, differentFilesNotice);
  // After a reload that interrupted a conversion, picking the same files again continues it right away.
  let autoContinue = conversion.savedProgress() !== null && !unsupported;
  let showInterrupted = wasInterrupted && !autoContinue;
  const estimate = h('p', { class: 'muted' });
  const message = h('p', { attrs: { role: 'status' } });
  const progressBar = h('progress', { max: 1, value: 0 });
  const progressText = h('p', { class: 'muted' });
  const progress = h('div', { class: 'progress' }, progressBar, progressText);

  const statusProgress = h('progress', { max: 1, value: 0 });
  const statusText = h('span', { class: 'status-bar-text' });
  const statusBar = h('button', { type: 'button', class: 'status-bar', hidden: true }, statusText, statusProgress);
  let panelVisible = true;

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
    showInterrupted = false;
    autoContinue = false;
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
    const showStatusBar = running && !panelVisible;
    if (statusBar.hidden === showStatusBar) {
      statusBar.hidden = !showStatusBar;
      // Make room at the top of the page so the bar never covers the title or anything else.
      document.documentElement.style.setProperty('--status-bar-space', showStatusBar ? `${statusBar.offsetHeight}px` : '0px');
    }

    const idle = state.status === 'idle' || state.status === 'error';
    const resumable = idle ? conversion.resumableFor(store.get()) : null;
    const saved = idle && !resumable ? conversion.savedProgress() : null;
    const differentFiles = !!saved && conversion.isDifferentBook(store.get());
    resumeNotice.hidden = !saved || differentFiles;
    if (saved) resumeTitle.textContent = t('resume.title', saved);
    differentFilesNotice.hidden = !differentFiles;
    if (saved && differentFiles) differentFilesNotice.firstElementChild!.textContent = t('convert.differentFiles', saved);
    interruptedNotice.hidden = !showInterrupted || state.status !== 'idle';

    estimate.hidden = running || state.status === 'done' || chapters.length === 0;
    estimate.textContent = [
      total === null ? '' : t('convert.estimate', { length: formatDuration(total), size: formatBytes((preset.bitrate / 8) * total) }),
      resumable ? t('convert.resumeReady', resumable) : '',
    ].filter(Boolean).join(' · ');

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
      const { processedSeconds, totalSeconds, chapterIndex, remainingSeconds } = state.progress;
      const fraction = totalSeconds ? Math.min(1, processedSeconds / totalSeconds) : 0;
      progressBar.value = fraction;
      progressText.textContent = [
        t('convert.progressChapter', { n: chapterIndex + 1, total: chapters.length }),
        totalSeconds ? `${Math.floor(fraction * 100)}%` : formatDuration(processedSeconds),
        remainingSeconds !== null ? t('convert.timeLeft', { time: formatDuration(remainingSeconds) }) : t('convert.estimating'),
      ].join(' · ');
      statusProgress.value = fraction;
      statusText.textContent = progressText.textContent;
    }
  };

  conversion.subscribe(render);
  // Remember across reloads whether a conversion of these chapters is unfinished.
  let previousStatus = conversion.get().status;
  conversion.subscribe(({ status }) => {
    if (status === previousStatus) return;
    if (status === 'running') setConversionPending(store, true);
    else if (status === 'done' || (status === 'idle' && previousStatus === 'running')) setConversionPending(store, false);
    previousStatus = status;
  });
  let busy = false;
  conversion.subscribe((state) => {
    if ((state.status === 'running') === busy) return;
    busy = !busy;
    onBusyChange?.(busy);
  });
  // Keep the estimate and button state in sync with the book and the language.
  store.subscribe((book) => {
    render(conversion.get());
    // Continue automatically once the same files are picked again and their lengths are known.
    if (autoContinue && conversion.get().status === 'idle' && totalDuration(book.chapters) !== null && conversion.resumableFor(book)) {
      autoContinue = false;
      showInterrupted = false;
      void conversion.start(book);
    }
  });
  onLanguageChange(() => render(conversion.get()));

  const panel = h('div', { class: 'convert' },
    estimate,
    h('div', { class: 'row' }, convertButton, saveButton, cancelButton, againButton),
    progress,
    message,
    h('p', { class: 'muted small' }, tr('convert.privacy')),
  );

  // Show the top status bar only while the progress in the panel is scrolled out of view.
  // Progress hidden under the bar counts as out of view, so adding the page padding can't make the bar flicker.
  new IntersectionObserver(([entry]) => {
    panelVisible = entry.isIntersecting;
    render(conversion.get());
  }, { rootMargin: `-${STATUS_BAR_MAX_HEIGHT}px 0px 0px 0px` }).observe(progress);
  statusBar.addEventListener('click', () => panel.scrollIntoView({ behavior: 'smooth', block: 'center' }));

  const discard = () => {
    autoContinue = false;
    showInterrupted = false;
    saveError = null;
    conversion.cancel();
    setConversionPending(store, false);
  };

  // Different files than the unfinished conversion: drop its progress and start anew with these.
  startFreshButton.addEventListener('click', () => {
    discard();
    forgetRememberedChapters();
    onStartFresh?.();
    render(conversion.get());
  });

  return { panel, statusBar, banner, discard, hasSavedProgress: () => conversion.savedProgress() !== null };
};

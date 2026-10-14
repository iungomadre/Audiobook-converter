import type { MessageKey } from '@/shared/i18n';

/** Error with a translatable message; `message` holds the English text for logs. */
export class LocalizedError extends Error {
  constructor(readonly key: MessageKey, readonly params: Record<string, string> = {}, message: string = key) {
    super(message);
  }
}

/** Serializable error description passed from the worker to the page. */
export type ErrorInfo = { key?: MessageKey; params?: Record<string, string>; message: string };

export const toErrorInfo = (error: unknown): ErrorInfo =>
  error instanceof LocalizedError
    ? { key: error.key, params: error.params, message: error.message }
    : { message: error instanceof Error ? error.message : String(error) };

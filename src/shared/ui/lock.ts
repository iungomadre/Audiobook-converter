/**
 * A lock scope is a <fieldset>: disabling it disables every control inside
 * (inputs, buttons, selects) while the content stays visible and scrollable.
 */
export const isLocked = (element: Element): boolean => element.closest('fieldset:disabled') !== null;

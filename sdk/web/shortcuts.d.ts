export type ShortcutBinding = {id: string; key: string; allowInInputs: boolean; repeat: boolean};
export type ShortcutEvent = {key: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean; isComposing?: boolean; defaultPrevented?: boolean; repeat?: boolean};
export function validateShortcuts(value: unknown): ShortcutBinding[];
export function shortcutStroke(event: ShortcutEvent): string;
export function matchShortcut(items: ShortcutBinding[], event: ShortcutEvent, inInput?: boolean): ShortcutBinding | undefined;

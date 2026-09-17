// Interface language for the host UI.
//
// One module owns the active language so a translation can be looked up from anywhere,
// including code that is not a component (a thrown error, a validation message). React
// components subscribe through `useT`, which re-renders them when the language changes.
//
// The host and its plugins speak BCP-47 tags (`zh-CN`, `en`); a preference may also be
// "system", which is resolved once against the browser's language list.
import { useSyncExternalStore } from "react";
import { en, enCatalog, type Catalog, type Message, type MessageKey } from "./en";
import { zhCN } from "./zh-CN";

export const LOCALES = ["zh-CN", "en"] as const;
export type Locale = (typeof LOCALES)[number];
/** What the user chose: one language, or whatever the system asks for. */
export type LocalePreference = Locale | "system";
/** Used only where the system's language cannot be read at all; the window resolves the
 *  real one before its first paint. */
export const DEFAULT_LOCALE: Locale = "zh-CN";

/** Language names are endonyms: a language is always listed in itself, in every catalog. */
export const LOCALE_NAMES: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

const catalogs: Record<Locale, Catalog> = {
  "zh-CN": zhCN,
  en: enCatalog,
};

/** The locale a BCP-47 tag asks for. Only Chinese is distinguished: every other tag,
 *  including one this build does not know, reads as English. */
export function localeFromTag(tag: string | null | undefined): Locale {
  return (tag ?? "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === "system" || LOCALES.includes(value as Locale);
}

/** The system's preferred language, as far as the WebView reports it. */
export function systemLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const tags = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  return localeFromTag(tags.find((tag) => tag));
}

/** The language actually shown, for a stored preference. */
export function resolveLocale(preference: LocalePreference): Locale {
  return preference === "system" ? systemLocale() : preference;
}

const listeners = new Set<() => void>();
let active: Locale = DEFAULT_LOCALE;

/** The language in force, for code that needs it rather than a translated string. */
export function locale(): Locale {
  return active;
}

/** Switch the interface language. Components re-render; `<html lang>` follows. */
export function setLocale(next: Locale): void {
  if (next === active) return;
  active = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The active language, subscribing the calling component to changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, locale, locale);
}

export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

/** `{name}` placeholders come from the parameters; one with no parameter is left as it
 *  stands, so a missing value shows up instead of quietly reading as an empty string. */
function interpolate(message: string, params: Params | undefined): string {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

/** A plural message is chosen by its `count` parameter; a plain string is used as it is. */
function wording(message: string | { one: string; other: string }, params?: Params): string {
  if (typeof message === "string") return message;
  return Number(params?.count) === 1 ? message.one : message.other;
}

/** A key the active catalog does not carry cannot happen once types are checked; if one
 *  arrives anyway it is echoed rather than crashing the window. */
function lookup(key: MessageKey): Message {
  const catalog: Record<string, Message | undefined> = catalogs[active];
  return catalog[key] ?? en[key] ?? key;
}

export const t: Translate = (key, params) =>
  interpolate(wording(lookup(key), params), params);

/** The translator, for components: using this is what subscribes the component to
 *  language changes. */
export function useT(): Translate {
  useLocale();
  return t;
}

/** Byte sizes the way the current language writes numbers. */
export function formatBytes(bytes: number): string {
  const scale = (value: number, digits: number) =>
    new Intl.NumberFormat(active, { maximumFractionDigits: digits }).format(value);
  if (bytes < 1024) return `${scale(bytes, 0)} B`;
  if (bytes < 1024 ** 2) return `${scale(bytes / 1024, 1)} KB`;
  return `${scale(bytes / 1024 ** 2, 1)} MB`;
}

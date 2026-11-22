// Texts in the three languages of the site, plus number and date formatting
// from operartis-format.js so every module formats alike.
import { useMemo } from 'react';
import type { LangCode } from '../../../app-shared/hooks';
import { de } from './de';
import { en, type TextKey } from './en';
import { vi } from './vi';

const TEXTS: Record<LangCode, Record<TextKey, string>> = { en, vi, de };

const plainFormatter = (): OperartisFormatter => {
  const number = (value: unknown, min = 0, max = 3) => (value == null || value === '' ? '—' : Number(value).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return {
    locale: 'en-US',
    number,
    date: (value) => (value == null ? '' : String(value)),
    dateTime: (value) => (value == null ? '' : String(value)),
    fixed: (value, digits = 0) => number(value, digits, digits),
    currency: (value) => String(value),
  };
};

export interface Translator {
  /** The text for a key; {0}, {1}… are replaced by the extra arguments. */
  (key: TextKey, ...values: Array<string | number>): string;
  format: OperartisFormatter;
  lang: LangCode;
}

export function translator(lang: LangCode): Translator {
  const texts = TEXTS[lang] || en;
  const t = ((key: TextKey, ...values: Array<string | number>) => {
    const text = texts[key] ?? en[key] ?? key;
    return values.length ? text.replace(/\{(\d+)\}/g, (match, index) => String(values[Number(index)] ?? match)) : text;
  }) as Translator;
  t.format = (typeof window !== 'undefined' && window.OperartisFormat?.forLanguage(lang)) || plainFormatter();
  t.lang = lang;
  return t;
}

export const useTranslator = (lang: LangCode) => useMemo(() => translator(lang), [lang]);
export type { TextKey };

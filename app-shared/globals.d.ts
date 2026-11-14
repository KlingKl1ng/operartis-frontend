/// <reference types="vite/client" />

// Globals set by the plain scripts in the frontend root (operartis-*.js),
// which every module page loads before its own code.

type OperartisThemeMode = 'light' | 'dark' | 'system';
type OperartisLang = 'en' | 'vi' | 'de';

interface OperartisFormatter {
  locale: string;
  number: (value: unknown, min?: number, max?: number) => string;
  date: (value: unknown) => string;
  dateTime: (value: unknown, options?: { timeZone?: string }) => string;
  fixed: (value: unknown, digits?: number) => string;
  currency: (value: number) => string;
}

interface Window {
  OperartisApi?: {
    apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
    broadcastDashboardDataChanged: (source?: string) => void;
    getDefaultApiBase: () => string;
    me: () => Promise<{ email: string; display_name?: string; role?: string }>;
  };
  OperartisSecurity?: {
    maxUploadBytes: number;
    validateUploadFile: (file: File, options?: { allowedExtensions?: string[] }) => void;
    validateWorkbook: (workbook: unknown) => void;
    safeFilename: (name: string) => string;
    downloadBlob: (blob: Blob, filename: string) => void;
  };
  OperartisFormat?: { forLanguage: (lang: string) => OperartisFormatter };
  getOperartisTheme?: () => OperartisThemeMode;
  setOperartisTheme?: (theme: OperartisThemeMode) => string;
  persistOperartisTheme?: (theme: OperartisThemeMode) => string;
  applyOperartisThemeClass?: (theme: OperartisThemeMode) => boolean;
  getOperartisLang?: () => OperartisLang;
  setOperartisLang?: (lang: OperartisLang) => string;
  persistOperartisLang?: (lang: OperartisLang) => string;
}

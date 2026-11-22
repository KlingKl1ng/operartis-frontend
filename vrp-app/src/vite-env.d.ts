/// <reference types="vite/client" />

interface Window {
  OperartisApi?: {
    apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
    broadcastDashboardDataChanged: (source?: string) => void;
    getDefaultApiBase: () => string;
    me: () => Promise<{ email: string; display_name?: string; role?: string }>;
  };
  getOperartisTheme?: () => 'light' | 'dark' | 'system';
  setOperartisTheme?: (theme: 'light' | 'dark' | 'system') => string;
  persistOperartisTheme?: (theme: 'light' | 'dark' | 'system') => string;
  applyOperartisThemeClass?: (theme: 'light' | 'dark' | 'system') => boolean;
  getOperartisLang?: () => 'en' | 'vi' | 'de';
  setOperartisLang?: (lang: 'en' | 'vi' | 'de') => string;
  persistOperartisLang?: (lang: 'en' | 'vi' | 'de') => string;
}

interface ImportMetaEnv {
  readonly VITE_VRP_TILE_URL?: string;
  readonly VITE_VRP_DARK_STYLE_URL?: string;
}

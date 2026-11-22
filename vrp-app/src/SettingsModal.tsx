import { useEffect, useState } from 'react';
import { Globe, Monitor, Moon, Palette, Settings2, Sun, X } from 'lucide-react';

type ThemeMode = 'light' | 'dark' | 'system';
type LangCode = 'en' | 'vi' | 'de';
type SettingsTab = 'theme' | 'lang';

const COPY: Record<LangCode, {
  title: string;
  subtitle: string;
  themeMode: string;
  language: string;
  appearance: string;
  light: string;
  dark: string;
  system: string;
  close: string;
}> = {
  en: {
    title: 'Settings',
    subtitle: 'Configure application preferences.',
    themeMode: 'Theme Mode',
    language: 'Language',
    appearance: 'Interface Appearance',
    light: 'Light Mode',
    dark: 'Dark Mode',
    system: 'System Default',
    close: 'Close settings',
  },
  vi: {
    title: 'Cài đặt',
    subtitle: 'Cấu hình tùy chọn ứng dụng.',
    themeMode: 'Giao diện',
    language: 'Ngôn ngữ',
    appearance: 'Giao diện người dùng',
    light: 'Chế độ sáng',
    dark: 'Chế độ tối',
    system: 'Mặc định hệ thống',
    close: 'Đóng cài đặt',
  },
  de: {
    title: 'Einstellungen',
    subtitle: 'Anwendungspräferenzen konfigurieren.',
    themeMode: 'Design-Modus',
    language: 'Sprache',
    appearance: 'Erscheinungsbild',
    light: 'Heller Modus',
    dark: 'Dunkler Modus',
    system: 'Systemstandard',
    close: 'Einstellungen schließen',
  },
};

const LANGUAGES: Array<{ id: LangCode; label: string; flag: string }> = [
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

export function SettingsModal({
  isOpen,
  onClose,
  theme,
  setTheme,
  lang,
  setLang,
}: {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  lang: LangCode;
  setLang: (lang: LangCode) => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');
  const t = COPY[lang] || COPY.en;

  useEffect(() => {
    if (isOpen) setActiveTab('theme');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-layer settings-layer" role="presentation">
      <button className="settings-backdrop" type="button" onClick={onClose} aria-label={t.close} />
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="vrp-settings-title">
        <header className="settings-header">
          <div>
            <span className="entity-dialog-icon"><Settings2 size={18} /></span>
            <span>
              <h2 id="vrp-settings-title">{t.title}</h2>
              <small>{t.subtitle}</small>
            </span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t.close}>
            <X size={18} />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label={t.title}>
            <button className={activeTab === 'theme' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('theme')}>
              <Palette size={18} /> {t.themeMode}
            </button>
            <button className={activeTab === 'lang' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('lang')}>
              <Globe size={18} /> {t.language}
            </button>
          </nav>

          <div className="settings-content scroller">
            {activeTab === 'theme' && (
              <div>
                <h3>{t.appearance}</h3>
                <div className="settings-choice-grid">
                  <button className={theme === 'light' ? 'is-selected' : ''} type="button" onClick={() => setTheme('light')}>
                    <span className="settings-choice-icon is-light"><Sun size={18} /></span>
                    <strong>{t.light}</strong>
                  </button>
                  <button className={theme === 'dark' ? 'is-selected' : ''} type="button" onClick={() => setTheme('dark')}>
                    <span className="settings-choice-icon is-dark"><Moon size={18} /></span>
                    <strong>{t.dark}</strong>
                  </button>
                  <button className={theme === 'system' ? 'is-selected' : ''} type="button" onClick={() => setTheme('system')}>
                    <span className="settings-choice-icon is-system"><Monitor size={18} /></span>
                    <strong>{t.system}</strong>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'lang' && (
              <div>
                <h3>{t.language}</h3>
                <div className="settings-choice-grid">
                  {LANGUAGES.map((item) => (
                    <button key={item.id} className={`settings-lang-choice ${lang === item.id ? 'is-selected' : ''}`} type="button" onClick={() => setLang(item.id)}>
                      <span aria-hidden="true">{item.flag}</span>
                      <strong>{item.label}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

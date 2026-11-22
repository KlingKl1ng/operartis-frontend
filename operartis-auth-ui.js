(function () {
    if (!window.OperartisApi) return;

    var state = { user: null, mode: 'login' };
    var authMutationId = 0;
    var autoPrompt = window.OPERARTIS_AUTH_AUTO_PROMPT !== false;
    var dismissible = window.OPERARTIS_AUTH_DISMISSIBLE === true || !autoPrompt;
    var topbarSlotSelector = window.OPERARTIS_AUTH_TOPBAR_SLOT || '#operartis-auth-topbar-slot';
    var showFloatingAccount = window.OPERARTIS_AUTH_FLOATING_ACCOUNT !== false;
    var themeObserverStarted = false;
    var langObserverStarted = false;
    var topbarObserverStarted = false;
    var topbarMenuOpen = false;
    var topbarMenuListenersBound = false;
    var authCopy = {
        en: {
            title: 'Operartis Login',
            subtitle: 'Sign in with your invited account to use the optimization modules.',
            email: 'Email',
            password: 'Password',
            signIn: 'Sign In',
            signingIn: 'Signing in...',
            closeLogin: 'Close login',
            logout: 'Logout',
            dashboard: 'Dashboard',
            setting: 'Setting',
            login: 'Sign In',
            loginFailed: 'Login failed. Please check your email and password.',
            invalidCredentials: 'Invalid email or password.',
            showPassword: 'Show password',
            hidePassword: 'Hide password',
            forgotPassword: 'Forgot password?',
            backToLogin: 'Back to sign in',
            resetTitle: 'Reset Password',
            resetSubtitle: 'Enter your account email and we will send a secure reset link.',
            resetSubmit: 'Send Reset Link',
            resetting: 'Sending...',
            resetSent: 'If this account exists, a password reset link has been sent.',
            resetFailed: 'Password reset email could not be sent. Please contact Operartis.',
            accountPrompt: "Don't have an account yet?",
            contactOperartis: 'Contact Operartis',
            contactTitle: 'Email Operartis'
        },
        vi: {
            title: 'Đăng Nhập Operartis',
            subtitle: 'Đăng nhập bằng tài khoản đã được mời để sử dụng các module tối ưu hóa.',
            email: 'Email',
            password: 'Mật Khẩu',
            signIn: 'Đăng Nhập',
            signingIn: 'Đang đăng nhập...',
            closeLogin: 'Đóng cửa sổ đăng nhập',
            logout: 'Đăng Xuất',
            dashboard: 'Bảng Điều Khiển',
            setting: 'Cài Đặt',
            login: 'Đăng Nhập',
            loginFailed: 'Đăng nhập không thành công. Vui lòng kiểm tra email và mật khẩu.',
            invalidCredentials: 'Email hoặc mật khẩu không đúng.',
            showPassword: 'Hiển thị mật khẩu',
            hidePassword: 'Ẩn mật khẩu',
            forgotPassword: 'Quên mật khẩu?',
            backToLogin: 'Quay lại đăng nhập',
            resetTitle: 'Đặt Lại Mật Khẩu',
            resetSubtitle: 'Nhập email tài khoản của bạn, chúng tôi sẽ gửi liên kết đặt lại an toàn.',
            resetSubmit: 'Gửi Liên Kết Đặt Lại',
            resetting: 'Đang gửi...',
            resetSent: 'Nếu tài khoản này tồn tại, liên kết đặt lại mật khẩu đã được gửi.',
            resetFailed: 'Không thể gửi email đặt lại mật khẩu. Vui lòng liên hệ Operartis.',
            accountPrompt: 'Bạn vẫn chưa có tài khoản riêng?',
            contactOperartis: 'Liên hệ Operartis',
            contactTitle: 'Gửi email cho Operartis'
        },
        de: {
            title: 'Operartis Anmeldung',
            subtitle: 'Melden Sie sich mit Ihrem eingeladenen Konto an, um die Optimierungsmodule zu nutzen.',
            email: 'E-Mail',
            password: 'Passwort',
            signIn: 'Anmelden',
            signingIn: 'Anmeldung...',
            closeLogin: 'Anmeldung schließen',
            logout: 'Abmelden',
            dashboard: 'Dashboard',
            setting: 'Einstellungen',
            login: 'Anmelden',
            loginFailed: 'Anmeldung fehlgeschlagen. Bitte prüfen Sie E-Mail und Passwort.',
            invalidCredentials: 'E-Mail oder Passwort ist ungültig.',
            showPassword: 'Passwort anzeigen',
            hidePassword: 'Passwort ausblenden',
            forgotPassword: 'Passwort vergessen?',
            backToLogin: 'Zurück zur Anmeldung',
            resetTitle: 'Passwort zurücksetzen',
            resetSubtitle: 'Geben Sie Ihre Konto-E-Mail ein. Wir senden einen sicheren Link zum Zurücksetzen.',
            resetSubmit: 'Reset-Link senden',
            resetting: 'Wird gesendet...',
            resetSent: 'Wenn dieses Konto existiert, wurde ein Link zum Zurücksetzen gesendet.',
            resetFailed: 'Die E-Mail zum Zurücksetzen konnte nicht gesendet werden. Bitte kontaktieren Sie Operartis.',
            accountPrompt: 'Sie haben noch kein eigenes Konto?',
            contactOperartis: 'Operartis kontaktieren',
            contactTitle: 'Operartis per E-Mail kontaktieren'
        }
    };

    function authLang() {
        var lang = '';
        if (typeof window.getOperartisLang === 'function') lang = window.getOperartisLang();
        if (!lang && document.documentElement.lang) lang = document.documentElement.lang;
        lang = String(lang || 'en').toLowerCase().split('-')[0];
        return authCopy[lang] ? lang : 'en';
    }

    function t(key) {
        var copy = authCopy[authLang()] || authCopy.en;
        return copy[key] || authCopy.en[key] || key;
    }

    function localizeError(message) {
        if (!message) return t('loginFailed');
        if (message === authCopy.en.invalidCredentials || message === authCopy.vi.invalidCredentials || message === authCopy.de.invalidCredentials) {
            return t('invalidCredentials');
        }
        if (message === authCopy.en.loginFailed || message === authCopy.vi.loginFailed || message === authCopy.de.loginFailed) {
            return t('loginFailed');
        }
        if (message === authCopy.en.resetSent) return t('resetSent');
        if (message.indexOf('Password reset email could not be sent') === 0) return t('resetFailed');
        return message;
    }

    function getTopbarSlot() {
        try {
            return document.querySelector(topbarSlotSelector);
        } catch (e) {
            return null;
        }
    }

    function useTopbarAccountMode() {
        return !!getTopbarSlot();
    }

    function shouldShowFloatingAccount() {
        return showFloatingAccount && !useTopbarAccountMode();
    }

    function userIconSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (character) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[character];
        });
    }

    function readCachedProfile() {
        try {
            return JSON.parse(localStorage.getItem('operartis_user_profile') || 'null');
        } catch (error) {
            return null;
        }
    }

    function writeCachedProfile(user) {
        if (!user) return;
        try {
            localStorage.setItem('operartis_user_profile', JSON.stringify({
                email: user.email || '',
                full_name: user.full_name || '',
                role: user.role || '',
                avatar_data_url: user.avatar_data_url || ''
            }));
        } catch (error) { }
    }

    function enrichUser(user) {
        if (!user) return user;
        var cached = readCachedProfile();
        if (!cached) return user;
        if (cached.email && user.email && cached.email !== user.email) return user;
        return Object.assign({}, user, {
            full_name: user.full_name || cached.full_name || '',
            avatar_data_url: user.avatar_data_url || cached.avatar_data_url || ''
        });
    }

    function formatNameFromEmail(email) {
        if (!email) return '';
        var local = String(email).split('@')[0] || '';
        return local.split(/[._-]+/).filter(Boolean).map(function (part) {
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }).join(' ');
    }

    function userDisplayName(user) {
        user = enrichUser(user);
        if (!user) return '';
        if (user.full_name && String(user.full_name).trim()) return String(user.full_name).trim();
        var fromEmail = formatNameFromEmail(user.email);
        if (fromEmail) return fromEmail;
        return 'Member';
    }

    function userInitials(user) {
        var name = userDisplayName(user);
        var base = name.replace(/@.*/, '');
        var parts = base.split(/[.\s_-]+/).filter(Boolean);
        var first = parts[0] && parts[0][0] ? parts[0][0] : 'M';
        var second = parts[1] && parts[1][0] ? parts[1][0] : (parts[0] && parts[0][1] ? parts[0][1] : '');
        return (first + second).toUpperCase();
    }

    function renderUserAvatarHtml(user) {
        if (!user) return userIconSvg();
        if (user.avatar_data_url) {
            return '<img class="op-auth-avatar-img" src="' + escapeHtml(user.avatar_data_url) + '" alt="">';
        }
        return '<span class="op-auth-avatar-initials">' + escapeHtml(userInitials(user)) + '</span>';
    }

    function dashboardIconSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"></rect><rect width="7" height="5" x="14" y="3" rx="1"></rect><rect width="7" height="9" x="14" y="12" rx="1"></rect><rect width="7" height="5" x="3" y="16" rx="1"></rect></svg>';
    }

    function settingsIconSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.35a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    }

    function logoutIconSvg() {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
    }

    function openModuleSettings() {
        setTopbarMenuOpen(false);
        window.dispatchEvent(new CustomEvent('operartis:open-settings'));
    }

    function addStyles() {
        if (document.getElementById('operartis-auth-style')) return;
        var style = document.createElement('style');
        style.id = 'operartis-auth-style';
        style.textContent = [
            '.op-auth-overlay{--op-auth-overlay-bg:rgba(2,6,23,.72);--op-auth-card-bg:linear-gradient(180deg,rgba(15,23,42,.94),rgba(15,23,42,.82));--op-auth-card-text:#f8fafc;--op-auth-muted:#94a3b8;--op-auth-label:#cbd5e1;--op-auth-border:rgba(148,163,184,.16);--op-auth-line:rgba(148,163,184,.18);--op-auth-highlight:rgba(255,255,255,.06);--op-auth-accent:#fbbf24;--op-auth-input-bg:rgba(2,6,23,.72);--op-auth-input-text:#f8fafc;--op-auth-input-border:rgba(148,163,184,.22);--op-auth-close-bg:rgba(148,163,184,.16);--op-auth-close-text:#cbd5e1;--op-auth-close-hover-bg:rgba(148,163,184,.28);--op-auth-close-hover-text:#f8fafc;--op-auth-error-text:#fecaca;--op-auth-error-bg:rgba(239,68,68,.14);--op-auth-error-border:rgba(248,113,113,.35);--op-auth-gold:#f59e0b;--op-auth-gold-2:#fbbf24;--op-auth-radius:12px;--op-auth-radius-lg:20px;--op-auth-shadow:0 24px 80px rgba(0,0,0,.32);position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:var(--op-auth-overlay-bg);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;padding:24px}',
            '.op-auth-overlay[data-auth-theme="light"]{--op-auth-overlay-bg:rgba(241,245,249,.78);--op-auth-card-bg:linear-gradient(180deg,rgba(255,255,255,.98),rgba(248,250,252,.95));--op-auth-card-text:#0f172a;--op-auth-muted:#64748b;--op-auth-label:#334155;--op-auth-border:rgba(148,163,184,.32);--op-auth-line:rgba(148,163,184,.28);--op-auth-highlight:rgba(255,255,255,.9);--op-auth-accent:#b45309;--op-auth-input-bg:rgba(255,255,255,.98);--op-auth-input-text:#0f172a;--op-auth-input-border:rgba(148,163,184,.35);--op-auth-close-bg:rgba(15,23,42,.08);--op-auth-close-text:#475569;--op-auth-close-hover-bg:rgba(15,23,42,.14);--op-auth-close-hover-text:#0f172a;--op-auth-error-text:#991b1b;--op-auth-error-bg:rgba(254,226,226,.92);--op-auth-error-border:rgba(248,113,113,.48)}',
            '.op-auth-overlay[data-open="true"]{display:flex}',
            '.op-auth-card,.op-auth-card *{box-sizing:border-box}',
            '.op-auth-card{position:relative;width:min(420px,100%);background:var(--op-auth-card-bg);color:var(--op-auth-card-text);border:1px solid var(--op-auth-border);border-radius:var(--op-auth-radius-lg);padding:32px 30px 24px;box-shadow:var(--op-auth-shadow),inset 0 1px 0 var(--op-auth-highlight);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);overflow:hidden;margin:0;animation:op-auth-card-in .4s cubic-bezier(.16,1,.3,1) both}',
            '@keyframes op-auth-card-in{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}',
            '.op-auth-card::before{content:"";position:absolute;top:0;left:18%;right:18%;height:1px;background:linear-gradient(90deg,transparent,var(--op-auth-gold-2),transparent);opacity:.8;pointer-events:none}',
            '.op-auth-close{position:absolute;right:14px;top:14px;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:10px;background:transparent;color:var(--op-auth-muted);cursor:pointer;z-index:1;transition:background-color .2s cubic-bezier(.4,0,.2,1),color .2s cubic-bezier(.4,0,.2,1)}',
            '.op-auth-close svg{display:block;width:16px;height:16px}',
            '.op-auth-close:focus-visible{outline:2px solid rgba(245,158,11,.6);outline-offset:2px}',
            '.op-auth-close:hover{background:var(--op-auth-close-bg);color:var(--op-auth-close-hover-text)}',
            '.op-auth-title{font-size:24px;font-weight:800;margin:0 0 8px;padding-right:36px;letter-spacing:-.025em;line-height:1.15}',
            '.op-auth-sub{font-size:14.5px;color:var(--op-auth-muted);margin:0 0 24px;line-height:1.6}',
            '.op-auth-field{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}',
            '.op-auth-label{font-size:11px;font-weight:800;color:var(--op-auth-label);text-transform:uppercase;letter-spacing:.06em}',
            '.op-auth-password-head{display:flex;align-items:center;justify-content:space-between;gap:12px}',
            '.op-auth-input{height:44px;width:100%;border-radius:var(--op-auth-radius);border:1px solid var(--op-auth-input-border);background:var(--op-auth-input-bg);color:var(--op-auth-input-text);padding:0 14px;font-family:inherit;font-size:14.5px;font-weight:400;line-height:normal;outline:none;transition:border-color .2s cubic-bezier(.4,0,.2,1),box-shadow .2s cubic-bezier(.4,0,.2,1)}',
            '.op-auth-input:focus{border-color:rgba(245,158,11,.7);box-shadow:0 0 0 3px rgba(245,158,11,.12)}',
            '.op-auth-password-wrap{position:relative;display:flex;align-items:center;width:100%}',
            '.op-auth-password-wrap .op-auth-input{padding-right:46px}',
            '.op-auth-password-toggle{position:absolute;right:7px;top:0;bottom:0;height:32px;margin:auto 0;display:inline-flex;align-items:center;justify-content:center;width:32px;border:0;border-radius:8px;background:transparent;color:var(--op-auth-muted);cursor:pointer;padding:0;transform:none}',
            '.op-auth-password-toggle:hover{background:var(--op-auth-close-bg);color:var(--op-auth-card-text)}',
            '.op-auth-password-toggle:active{transform:none}',
            '.op-auth-password-toggle:focus-visible{outline:2px solid rgba(245,158,11,.6);outline-offset:2px}',
            '.op-auth-password-toggle svg{display:block;flex-shrink:0;width:18px;height:18px;stroke:currentColor}',
            '.op-auth-button{height:46px;width:100%;margin-top:6px;border:0;border-radius:var(--op-auth-radius);background:var(--op-auth-gold);color:#fff;font:inherit;font-weight:700;font-size:14.5px;cursor:pointer;box-shadow:0 8px 22px rgba(245,158,11,.24),inset 0 1px 0 rgba(255,255,255,.28);transition:background-color .2s cubic-bezier(.4,0,.2,1),box-shadow .2s cubic-bezier(.4,0,.2,1),transform .15s cubic-bezier(.4,0,.2,1)}',
            '.op-auth-button:hover:not(:disabled){background:#d97706;box-shadow:0 10px 28px rgba(245,158,11,.38),inset 0 1px 0 rgba(255,255,255,.22)}',
            '.op-auth-button:disabled{opacity:.6;cursor:not-allowed;box-shadow:none}',
            '.op-auth-button:active:not(:disabled){transform:translateY(1px)}',
            '.op-auth-button:focus-visible{outline:2px solid rgba(245,158,11,.55);outline-offset:2px}',
            '.op-auth-link{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--op-auth-accent);font-weight:700;font-size:12.5px;line-height:1.4;text-decoration:none;cursor:pointer;padding:0;margin:0 0 14px}',
            '.op-auth-forgot-inline{margin:0;font-size:12.5px;white-space:nowrap;text-transform:none;letter-spacing:0}',
            '.op-auth-link:hover{text-decoration:underline}',
            '.op-auth-link:focus-visible{outline:2px solid rgba(245,158,11,.55);outline-offset:3px;border-radius:4px}',
            '.op-auth-contact{margin:22px 0 0;padding-top:18px;border-top:1px solid var(--op-auth-line);color:var(--op-auth-muted);font-size:12.5px;line-height:1.5;text-align:center}',
            '.op-auth-contact a{color:var(--op-auth-accent);font-weight:700;text-decoration:none;white-space:nowrap}',
            '.op-auth-contact a:hover{text-decoration:underline}',
            '.op-auth-contact a:focus-visible{outline:2px solid rgba(245,158,11,.55);outline-offset:3px;border-radius:4px}',
            '.op-auth-error{display:none;color:var(--op-auth-error-text);background:var(--op-auth-error-bg);border:1px solid var(--op-auth-error-border);border-radius:var(--op-auth-radius);padding:10px 12px;font-size:13px;font-weight:600;line-height:1.45;margin-bottom:16px}',
            '@media (max-width:520px){.op-auth-overlay{padding:16px}.op-auth-card{padding:28px 22px 20px;border-radius:18px}}',
            '@media (prefers-reduced-motion:reduce){.op-auth-card{animation:none}.op-auth-button,.op-auth-close,.op-auth-input{transition:none}}',
            '.op-auth-error[data-kind="success"]{color:#166534;background:rgba(220,252,231,.95);border-color:rgba(34,197,94,.35)}',
            '.op-auth-overlay[data-auth-theme="dark"] .op-auth-error[data-kind="success"]{color:#bbf7d0;background:rgba(34,197,94,.14);border-color:rgba(74,222,128,.35)}',
            '.op-auth-account{position:fixed;right:18px;bottom:18px;z-index:99990;display:none;gap:8px;align-items:center;background:rgba(15,23,42,.92);color:#e2e8f0;border:1px solid rgba(148,163,184,.28);border-radius:999px;padding:8px 10px;font:700 12px Inter,system-ui,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.22)}',
            '.op-auth-account[data-auth-theme="light"]{background:rgba(255,255,255,.92);color:#0f172a;border-color:rgba(15,23,42,.14)}',
            '.op-auth-account[data-open="true"]{display:flex}',
            '.op-auth-logout{border:0;border-radius:999px;background:#334155;color:#fff;font-weight:800;font-size:11px;padding:6px 9px;cursor:pointer}',
            '.op-auth-topbar{position:relative;display:flex;align-items:center;flex-shrink:0}',
            '.op-auth-topbar-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;margin:0;padding:0;border:0;border-radius:999px;background:linear-gradient(to top right,#f59e0b,#b45309);color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(245,158,11,.28);transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}',
            '.op-auth-topbar-btn:hover{transform:scale(1.06);filter:brightness(1.1);box-shadow:0 8px 28px rgba(245,158,11,.5),0 0 0 2px rgba(251,191,36,.35)}',
            '.op-auth-topbar-btn:active{transform:scale(.94);filter:brightness(1)}',
            '.op-auth-topbar-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(245,158,11,.55)}',
            '.op-auth-topbar-icon{display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;flex-shrink:0;overflow:hidden;border-radius:999px;font-size:12px;font-weight:900;letter-spacing:-.02em}',
            '.op-auth-topbar-icon svg{display:block;width:20px;height:20px}',
            '.op-auth-avatar-img{display:block;width:100%;height:100%;object-fit:cover;border-radius:999px}',
            '.op-auth-avatar-initials{display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;color:#08111f;background:radial-gradient(circle at 30% 25%,rgba(251,191,36,.98),rgba(217,119,6,.9));border-radius:999px}',
            '.op-auth-topbar-status{position:absolute;right:-2px;top:-2px;width:12px;height:12px;border-radius:999px;border:2px solid #020617}',
            '.op-auth-topbar-status[data-signed-in="true"]{background:#34d399;box-shadow:0 0 0 2px rgba(52,211,153,.28),0 0 12px rgba(52,211,153,.9)}',
            '.op-auth-topbar-status[data-signed-in="false"]{background:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.45)}',
            '.op-auth-topbar-menu{position:absolute;right:0;top:calc(100% + 10px);z-index:100;width:240px;overflow:visible;border-radius:10px;border:1px solid rgba(148,163,184,0.28);background:rgba(255,255,255,0.98);box-shadow:0 8px 32px rgba(15,23,42,0.08);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;transform-origin:top right;animation:opAuthMenuIn .18s ease-out}',
            '.op-auth-topbar-menu::before{content:"";position:absolute;top:-6px;right:13px;width:12px;height:12px;background:rgba(255,255,255,0.98);border-left:1px solid rgba(148,163,184,0.28);border-top:1px solid rgba(148,163,184,0.28);transform:rotate(45deg);pointer-events:none;z-index:0}',
            '.op-auth-topbar-menu--portal{position:fixed;left:auto;top:auto;z-index:100000}',
            '.op-auth-topbar-menu[data-auth-theme="dark"]{border-color:rgba(148,163,184,0.18);background:rgba(15,23,42,0.96);box-shadow:0 8px 32px rgba(0,0,0,0.18)}',
            '.op-auth-topbar-menu[data-auth-theme="dark"]::before{background:rgba(15,23,42,0.96);border-left-color:rgba(148,163,184,0.18);border-top-color:rgba(148,163,184,0.18)}',
            '@keyframes opAuthMenuIn{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}',
            '.op-auth-topbar-menu[data-open="true"]{display:block}',
            '.op-auth-topbar-menu[data-open="false"]{display:none}',
            '.op-auth-topbar-menu-head{padding:12px 14px 10px;border-bottom:1px solid rgba(148,163,184,0.28);background:transparent;position:relative;z-index:1;border-radius:10px 10px 0 0}',
            '.op-auth-topbar-menu[data-auth-theme="dark"] .op-auth-topbar-menu-head{border-bottom-color:rgba(148,163,184,0.18)}',
            '.op-auth-topbar-name{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:700;letter-spacing:0;color:#0f172a}',
            '.op-auth-topbar-menu[data-auth-theme="dark"] .op-auth-topbar-name{color:#f8fafc}',
            '.op-auth-topbar-role{margin:3px 0 0;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b}',
            '.op-auth-topbar-menu[data-auth-theme="dark"] .op-auth-topbar-role{color:#94a3b8}',
            '.op-auth-topbar-menu-body{padding:6px;position:relative;z-index:1;border-radius:0 0 10px 10px}',
            '.op-auth-topbar-item{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:10px 12px;text-align:left;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#0f172a;cursor:pointer;border-radius:10px;transition:background .15s ease,color .15s ease,transform .15s ease}',
            '.op-auth-topbar-item-icon{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;flex-shrink:0;color:currentColor;opacity:.88;transition:color .15s ease,opacity .15s ease}',
            '.op-auth-topbar-menu[data-auth-theme="dark"] .op-auth-topbar-item-icon{opacity:.92}',
            '.op-auth-topbar-item-icon svg{display:block;width:100%;height:100%}',
            '.op-auth-topbar-menu[data-auth-theme="dark"] .op-auth-topbar-item{color:#f8fafc}',
            '.op-auth-topbar-item:hover{background:rgba(245,158,11,0.12);color:#b45309;transform:translateX(1px)}',
            '.op-auth-topbar-menu[data-auth-theme="dark"] .op-auth-topbar-item:hover{background:rgba(245,158,11,0.14);color:#fbbf24}',
            '.op-auth-topbar-item--danger:hover{background:rgba(239,68,68,0.1);color:#b91c1c}',
            '.op-auth-topbar-menu[data-auth-theme="dark"] .op-auth-topbar-item--danger:hover{background:rgba(248,113,113,0.12);color:#fca5a5}',
            '.op-auth-topbar-menu-divider{height:1px;margin:4px 10px;background:linear-gradient(90deg,transparent,rgba(148,163,184,0.35),transparent)}',
            '.op-auth-topbar-menu[data-auth-theme="dark"] .op-auth-topbar-menu-divider{background:linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)}'
        ].join('');
        document.head.appendChild(style);
    }

    function passwordIcon(visible) {
        if (visible) {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12a18.15 18.15 0 0 1 5.06-7.94"/><path d="M9.9 4.24A10.86 10.86 0 0 1 12 4c5 0 9.27 3.11 11 8a18.2 18.2 0 0 1-3.22 5.02"/><path d="M14.12 14.12a3 3 0 0 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.06 12.35a11.13 11.13 0 0 1 19.88 0"/><path d="M21.94 11.65a11.13 11.13 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>';
    }

    function updatePasswordToggle() {
        var passwordInput = document.getElementById('operartis-auth-password');
        var passwordToggle = document.getElementById('operartis-auth-password-toggle');
        if (!passwordInput || !passwordToggle) return;
        var visible = passwordInput.type === 'text';
        passwordToggle.setAttribute('aria-label', visible ? t('hidePassword') : t('showPassword'));
        passwordToggle.setAttribute('title', visible ? t('hidePassword') : t('showPassword'));
        passwordToggle.setAttribute('aria-pressed', visible ? 'true' : 'false');
        passwordToggle.innerHTML = passwordIcon(visible);
    }

    function resolveAuthTheme() {
        if (typeof window.getOperartisTheme === 'function') {
            var theme = window.getOperartisTheme();
            if (theme === 'light') return 'light';
            if (theme === 'dark') return 'dark';
            if (theme === 'system') {
                try {
                    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                } catch (e) {
                    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
                }
            }
        }
        if (document.documentElement.classList.contains('dark')) return 'dark';
        if (document.documentElement.classList.contains('light')) return 'light';
        return 'light';
    }

    function syncAuthTheme() {
        var theme = resolveAuthTheme();
        var overlay = document.getElementById('operartis-auth-overlay');
        var account = document.getElementById('operartis-auth-account');
        var topbarMenu = document.getElementById('operartis-auth-topbar-menu');
        if (overlay) overlay.setAttribute('data-auth-theme', theme);
        if (account) account.setAttribute('data-auth-theme', theme);
        if (topbarMenu) topbarMenu.setAttribute('data-auth-theme', theme);
    }

    function positionTopbarMenu() {
        var menu = document.getElementById('operartis-auth-topbar-menu');
        var button = document.getElementById('operartis-auth-topbar-btn');
        if (!menu || !button) return;

        if (menu.parentElement !== document.body) document.body.appendChild(menu);
        menu.classList.add('op-auth-topbar-menu--portal');

        var rect = button.getBoundingClientRect();
        menu.style.top = Math.round(rect.bottom + 8) + 'px';
        menu.style.right = Math.round(window.innerWidth - rect.right) + 'px';
    }

    function restoreTopbarMenu() {
        var menu = document.getElementById('operartis-auth-topbar-menu');
        var wrap = document.getElementById('operartis-auth-topbar');
        if (!menu || !wrap) return;

        menu.classList.remove('op-auth-topbar-menu--portal');
        menu.style.top = '';
        menu.style.right = '';
        if (menu.parentElement !== wrap) wrap.appendChild(menu);
    }

    function bindTopbarMenuListeners() {
        if (topbarMenuListenersBound) return;
        topbarMenuListenersBound = true;

        document.addEventListener('mousedown', function (event) {
            if (!topbarMenuOpen) return;
            var topbar = document.getElementById('operartis-auth-topbar');
            var menu = document.getElementById('operartis-auth-topbar-menu');
            if (topbar && topbar.contains(event.target)) return;
            if (menu && menu.contains(event.target)) return;
            setTopbarMenuOpen(false);
        });
        window.addEventListener('resize', function () {
            if (topbarMenuOpen) positionTopbarMenu();
        });
        window.addEventListener('scroll', function () {
            if (topbarMenuOpen) positionTopbarMenu();
        }, true);
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') setTopbarMenuOpen(false);
        });
    }

    function setTopbarMenuOpen(open) {
        topbarMenuOpen = !!open;
        var menu = document.getElementById('operartis-auth-topbar-menu');
        var button = document.getElementById('operartis-auth-topbar-btn');
        if (menu) menu.setAttribute('data-open', topbarMenuOpen ? 'true' : 'false');
        if (button) button.setAttribute('aria-expanded', topbarMenuOpen ? 'true' : 'false');
        if (topbarMenuOpen) {
            syncAuthTheme();
            syncTopbarLanguage();
            positionTopbarMenu();
        } else {
            restoreTopbarMenu();
        }
    }

    function updateTopbarAccount(user) {
        var topbar = document.getElementById('operartis-auth-topbar');
        var nameEl = document.getElementById('operartis-auth-topbar-name');
        var role = document.getElementById('operartis-auth-topbar-role');
        var status = document.querySelector('#operartis-auth-topbar .op-auth-topbar-status');
        var button = document.getElementById('operartis-auth-topbar-btn');
        var icon = document.querySelector('#operartis-auth-topbar .op-auth-topbar-icon');
        var menu = document.getElementById('operartis-auth-topbar-menu');
        if (!topbar) return;
        topbar.style.display = 'flex';
        if (nameEl) nameEl.textContent = user ? userDisplayName(user) : '';
        if (role) role.textContent = user && user.role ? user.role : '';
        if (status) status.setAttribute('data-signed-in', user ? 'true' : 'false');
        if (icon) icon.innerHTML = renderUserAvatarHtml(user);
        if (button) {
            button.setAttribute('aria-haspopup', user ? 'menu' : undefined);
            button.setAttribute('aria-label', user ? ('Account: ' + userDisplayName(user)) : t('login'));
            button.title = user ? userDisplayName(user) : t('login');
        }
        if (menu) menu.setAttribute('data-open', 'false');
        setTopbarMenuOpen(false);
        syncAuthTheme();
        syncTopbarLanguage();
    }

    function syncTopbarLanguage() {
        var setting = document.getElementById('operartis-auth-topbar-setting-label');
        var dashboard = document.getElementById('operartis-auth-topbar-dashboard-label');
        var logout = document.getElementById('operartis-auth-topbar-logout-label');
        var button = document.getElementById('operartis-auth-topbar-btn');
        if (setting) setting.textContent = t('setting');
        if (dashboard) dashboard.textContent = t('dashboard');
        if (logout) logout.textContent = t('logout');
        if (button && state.user) {
            button.setAttribute('aria-label', 'Account: ' + userDisplayName(state.user));
            button.title = userDisplayName(state.user);
        } else if (button) {
            button.setAttribute('aria-label', t('login'));
            button.title = t('login');
        }
    }

    function buildTopbarAccount() {
        var slot = getTopbarSlot();
        if (!slot || document.getElementById('operartis-auth-topbar')) return;

        var wrap = document.createElement('div');
        wrap.id = 'operartis-auth-topbar';
        wrap.className = 'op-auth-topbar';
        wrap.innerHTML = [
            '<button type="button" class="op-auth-topbar-btn" id="operartis-auth-topbar-btn" aria-haspopup="menu" aria-expanded="false">',
            '<span class="op-auth-topbar-icon" aria-hidden="true">' + userIconSvg() + '</span>',
            '<span class="op-auth-topbar-status" data-signed-in="false" aria-hidden="true"></span>',
            '</button>',
            '<div class="op-auth-topbar-menu" id="operartis-auth-topbar-menu" role="menu" aria-label="Account menu" data-open="false">',
            '<div class="op-auth-topbar-menu-head">',
            '<p class="op-auth-topbar-name" id="operartis-auth-topbar-name"></p>',
            '<p class="op-auth-topbar-role" id="operartis-auth-topbar-role"></p>',
            '</div>',
            '<div class="op-auth-topbar-menu-body">',
            '<button type="button" class="op-auth-topbar-item" id="operartis-auth-topbar-dashboard" role="menuitem"><span class="op-auth-topbar-item-icon" aria-hidden="true">' + dashboardIconSvg() + '</span><span class="op-auth-topbar-item-label" id="operartis-auth-topbar-dashboard-label"></span></button>',
            '<button type="button" class="op-auth-topbar-item" id="operartis-auth-topbar-setting" role="menuitem"><span class="op-auth-topbar-item-icon" aria-hidden="true">' + settingsIconSvg() + '</span><span class="op-auth-topbar-item-label" id="operartis-auth-topbar-setting-label"></span></button>',
            '<div class="op-auth-topbar-menu-divider" role="separator" aria-hidden="true"></div>',
            '<button type="button" class="op-auth-topbar-item op-auth-topbar-item--danger" id="operartis-auth-topbar-logout" role="menuitem"><span class="op-auth-topbar-item-icon" aria-hidden="true">' + logoutIconSvg() + '</span><span class="op-auth-topbar-item-label" id="operartis-auth-topbar-logout-label"></span></button>',
            '</div>',
            '</div>'
        ].join('');
        slot.appendChild(wrap);

        document.getElementById('operartis-auth-topbar-btn').addEventListener('click', function (event) {
            event.stopPropagation();
            if (!state.user) {
                showLogin();
                return;
            }
            setTopbarMenuOpen(!topbarMenuOpen);
        });
        document.getElementById('operartis-auth-topbar-setting').addEventListener('click', function () {
            openModuleSettings();
        });
        document.getElementById('operartis-auth-topbar-dashboard').addEventListener('click', function () {
            setTopbarMenuOpen(false);
            var target = state.user && state.user.role === 'admin' ? './dashboard.html#admin-overview' : './dashboard.html';
            window.location.href = target;
        });
        document.getElementById('operartis-auth-topbar-logout').addEventListener('click', async function () {
            setTopbarMenuOpen(false);
            await logout();
        });
        bindTopbarMenuListeners();

        syncAuthTheme();
        syncTopbarLanguage();
        if (state.user) updateTopbarAccount(state.user);
    }

    function observeTopbarSlot() {
        if (topbarObserverStarted) return;
        topbarObserverStarted = true;

        function tryMount() {
            if (!getTopbarSlot() || document.getElementById('operartis-auth-topbar')) return;
            buildTopbarAccount();
            if (state.user) updateTopbarAccount(state.user);
        }

        tryMount();
        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(tryMount);
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function observeThemeChanges() {
        if (themeObserverStarted) return;
        themeObserverStarted = true;
        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(syncAuthTheme);
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        }
        try {
            window.addEventListener('operartis:theme-change', syncAuthTheme);
        } catch (e) { }
        try {
            var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', syncAuthTheme);
            else if (mediaQuery.addListener) mediaQuery.addListener(syncAuthTheme);
        } catch (e) { }
    }

    function syncAuthLanguage() {
        var title = document.getElementById('operartis-auth-title');
        var subtitle = document.getElementById('operartis-auth-subtitle');
        var emailLabel = document.getElementById('operartis-auth-email-label-text');
        var passwordLabel = document.getElementById('operartis-auth-password-label-text');
        var passwordField = document.getElementById('operartis-auth-password-field');
        var submit = document.getElementById('operartis-auth-submit');
        var close = document.getElementById('operartis-auth-close');
        var logout = document.getElementById('operartis-auth-logout');
        var passwordInput = document.getElementById('operartis-auth-password');
        var passwordToggle = document.getElementById('operartis-auth-password-toggle');
        var forgot = document.getElementById('operartis-auth-forgot');
        var forgotInline = document.getElementById('operartis-auth-forgot-inline');
        var contactPrompt = document.getElementById('operartis-auth-contact-prompt');
        var contactLink = document.getElementById('operartis-auth-contact-link');
        var isReset = state.mode === 'reset';

        if (title) title.textContent = isReset ? t('resetTitle') : t('title');
        if (subtitle) subtitle.textContent = isReset ? t('resetSubtitle') : t('subtitle');
        if (emailLabel) emailLabel.textContent = t('email');
        if (passwordLabel) passwordLabel.textContent = t('password');
        if (passwordField) passwordField.style.display = isReset ? 'none' : 'flex';
        if (passwordInput) {
            passwordInput.required = !isReset;
            passwordInput.disabled = isReset;
        }
        if (submit && !submit.disabled) submit.textContent = isReset ? t('resetSubmit') : t('signIn');
        if (forgot) {
            forgot.textContent = isReset ? t('backToLogin') : t('forgotPassword');
            forgot.style.display = isReset ? 'inline-flex' : 'none';
        }
        if (forgotInline) {
            forgotInline.textContent = t('forgotPassword');
            forgotInline.style.display = isReset ? 'none' : 'inline-flex';
        }
        if (close) {
            close.setAttribute('aria-label', t('closeLogin'));
            close.setAttribute('title', t('closeLogin'));
        }
        if (logout) logout.textContent = t('logout');
        updatePasswordToggle();
        if (contactPrompt) contactPrompt.textContent = t('accountPrompt') + ' ';
        if (contactLink) {
            contactLink.textContent = t('contactOperartis');
            contactLink.setAttribute('title', t('contactTitle'));
        }
        syncTopbarLanguage();
    }

    function observeLanguageChanges() {
        if (langObserverStarted) return;
        langObserverStarted = true;
        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(syncAuthLanguage);
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        }
        window.addEventListener('storage', function (event) {
            if (event.key === 'lang') syncAuthLanguage();
        });
        window.addEventListener('operartis:lang-change', syncAuthLanguage);
    }

    function buildUi() {
        addStyles();
        if (document.getElementById('operartis-auth-overlay')) return;

        var overlay = document.createElement('div');
        overlay.id = 'operartis-auth-overlay';
        overlay.className = 'op-auth-overlay';
        overlay.innerHTML = [
            '<form class="op-auth-card" id="operartis-auth-form">',
            dismissible ? '<button class="op-auth-close" id="operartis-auth-close" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' : '',
            '<h1 class="op-auth-title" id="operartis-auth-title"></h1>',
            '<p class="op-auth-sub" id="operartis-auth-subtitle"></p>',
            '<div class="op-auth-error" id="operartis-auth-error" role="alert" aria-live="polite"></div>',
            '<label class="op-auth-field"><span class="op-auth-label" id="operartis-auth-email-label-text"></span><input class="op-auth-input" id="operartis-auth-email" type="email" autocomplete="email" required></label>',
            '<div class="op-auth-field" id="operartis-auth-password-field"><span class="op-auth-password-head"><label class="op-auth-label" id="operartis-auth-password-label-text" for="operartis-auth-password"></label><button class="op-auth-link op-auth-forgot-inline" id="operartis-auth-forgot-inline" type="button"></button></span><span class="op-auth-password-wrap"><input class="op-auth-input" id="operartis-auth-password" type="password" autocomplete="current-password" required><button class="op-auth-password-toggle" id="operartis-auth-password-toggle" type="button" aria-pressed="false"></button></span></div>',
            '<button class="op-auth-link" id="operartis-auth-forgot" type="button"></button>',
            '<button class="op-auth-button" id="operartis-auth-submit" type="submit"></button>',
            '<p class="op-auth-contact"><span id="operartis-auth-contact-prompt"></span><a id="operartis-auth-contact-link" href="mailto:info@operartis.io"></a></p>',
            '</form>'
        ].join('');
        document.body.appendChild(overlay);

        var account = document.createElement('div');
        account.id = 'operartis-auth-account';
        account.className = 'op-auth-account';
        account.innerHTML = '<span id="operartis-auth-email-label"></span><button class="op-auth-logout" id="operartis-auth-logout" type="button"></button>';
        document.body.appendChild(account);

        document.getElementById('operartis-auth-form').addEventListener('submit', async function (event) {
            event.preventDefault();
            if (state.mode === 'reset') await handlePasswordResetRequest();
            else await handleLogin();
        });
        document.getElementById('operartis-auth-forgot').addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            setAuthMode(state.mode === 'reset' ? 'login' : 'reset');
        });
        document.getElementById('operartis-auth-forgot-inline').addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            setAuthMode('reset');
        });
        document.getElementById('operartis-auth-password-toggle').addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            var passwordInput = document.getElementById('operartis-auth-password');
            if (!passwordInput || state.mode === 'reset') return;
            var visible = passwordInput.type === 'password';
            passwordInput.type = visible ? 'text' : 'password';
            updatePasswordToggle();
            passwordInput.focus();
        });
        if (dismissible) {
            document.getElementById('operartis-auth-close').addEventListener('click', hideUi);
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) hideUi();
            });
            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') hideUi();
            });
        }
        account.querySelector('button').addEventListener('click', async function () {
            await logout();
        });
        observeThemeChanges();
        observeLanguageChanges();
        observeTopbarSlot();
        syncAuthTheme();
        syncAuthLanguage();
        updatePasswordToggle();
    }

    function syncExternalUser(user) {
        if (!user) return;
        showAccount(user);
    }

    function setMessage(message, kind) {
        var error = document.getElementById('operartis-auth-error');
        if (!error) return;
        error.textContent = message || '';
        error.dataset.kind = kind || 'error';
        error.style.display = message ? 'block' : 'none';
    }

    function setError(message) {
        setMessage(message, 'error');
    }

    function setAuthMode(mode) {
        state.mode = mode === 'reset' ? 'reset' : 'login';
        var passwordInput = document.getElementById('operartis-auth-password');
        if (passwordInput && state.mode === 'reset') {
            passwordInput.value = '';
            passwordInput.type = 'password';
        }
        setError('');
        syncAuthLanguage();
    }

    function showLogin() {
        buildUi();
        setAuthMode('login');
        syncAuthTheme();
        syncAuthLanguage();
        document.getElementById('operartis-auth-overlay').setAttribute('data-open', 'true');
        document.getElementById('operartis-auth-account').removeAttribute('data-open');
        setError('');
    }

    function hideUi() {
        buildUi();
        syncAuthTheme();
        syncAuthLanguage();
        setTopbarMenuOpen(false);
        document.getElementById('operartis-auth-overlay').removeAttribute('data-open');
        document.getElementById('operartis-auth-account').removeAttribute('data-open');
        setError('');
    }

    function showAccount(user) {
        buildUi();
        syncAuthTheme();
        syncAuthLanguage();
        user = enrichUser(user);
        state.user = user;
        writeCachedProfile(user);
        document.getElementById('operartis-auth-overlay').removeAttribute('data-open');
        if (useTopbarAccountMode()) {
            buildTopbarAccount();
            updateTopbarAccount(user);
            document.getElementById('operartis-auth-account').removeAttribute('data-open');
        } else if (shouldShowFloatingAccount()) {
            document.getElementById('operartis-auth-account').setAttribute('data-open', 'true');
        } else {
            document.getElementById('operartis-auth-account').removeAttribute('data-open');
        }
        document.getElementById('operartis-auth-email-label').textContent = userDisplayName(user);
        window.dispatchEvent(new CustomEvent('operartis:authenticated', { detail: { user: user } }));
    }

    function markAuthMutation() {
        authMutationId += 1;
        return authMutationId;
    }

    async function handleLogin() {
        var email = document.getElementById('operartis-auth-email').value;
        var password = document.getElementById('operartis-auth-password').value;
        var button = document.getElementById('operartis-auth-submit');
        var mutationId = markAuthMutation();
        button.disabled = true;
        button.textContent = t('signingIn');
        setError('');
        try {
            var user = await window.OperartisApi.login(email, password);
            if (mutationId !== authMutationId) return;
            showAccount(user);
        } catch (error) {
            if (mutationId !== authMutationId) return;
            setError(localizeError(error.message));
        } finally {
            if (mutationId === authMutationId) {
                button.disabled = false;
                button.textContent = t('signIn');
            }
        }
    }

    async function handlePasswordResetRequest() {
        var email = document.getElementById('operartis-auth-email').value;
        var button = document.getElementById('operartis-auth-submit');
        button.disabled = true;
        button.textContent = t('resetting');
        setError('');
        try {
            var data = await window.OperartisApi.requestPasswordReset(email);
            setMessage(localizeError(data.message || t('resetSent')), 'success');
        } catch (error) {
            setError(localizeError(error.message || t('resetFailed')));
        } finally {
            button.disabled = false;
            button.textContent = t('resetSubmit');
        }
    }

    function clearLoginForm() {
        buildUi();
        state.mode = 'login';
        var form = document.getElementById('operartis-auth-form');
        var emailInput = document.getElementById('operartis-auth-email');
        var passwordInput = document.getElementById('operartis-auth-password');
        if (emailInput) emailInput.value = '';
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.type = 'password';
        }
        if (form) form.reset();
        updatePasswordToggle();
        setError('');
    }

    function handleUnauthenticated() {
        state.user = null;
        clearLoginForm();
        setTopbarMenuOpen(false);
        if (useTopbarAccountMode()) updateTopbarAccount(null);
        if (autoPrompt) showLogin();
        else hideUi();
        window.dispatchEvent(new CustomEvent('operartis:auth-state', { detail: { user: null } }));
    }

    async function refresh() {
        buildUi();
        var mutationId = authMutationId;
        try {
            var user = await window.OperartisApi.me();
            if (mutationId !== authMutationId) return state.user;
            showAccount(user);
            window.dispatchEvent(new CustomEvent('operartis:auth-state', { detail: { user: user } }));
            return user;
        } catch (error) {
            if (mutationId === authMutationId) handleUnauthenticated();
            throw error;
        }
    }

    async function logout() {
        markAuthMutation();
        await window.OperartisApi.logout();
        handleUnauthenticated();
    }

    var reauthenticationPromise = null;
    function requestReauthentication() {
        if (reauthenticationPromise) return reauthenticationPromise;
        addStyles();
        var copy = {
            en: { title: 'Confirm your identity', description: 'Enter your password to continue with this sensitive change. Your session expiry stays the same.', confirm: 'Continue', cancel: 'Cancel', error: 'Could not confirm your password. Try again.', limited: 'Too many attempts. Try again in 15 minutes.' },
            vi: { title: 'Xác nhận danh tính', description: 'Nhập mật khẩu để tiếp tục thay đổi quan trọng này. Thời hạn phiên đăng nhập không thay đổi.', confirm: 'Tiếp tục', cancel: 'Hủy', error: 'Không thể xác nhận mật khẩu. Vui lòng thử lại.', limited: 'Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.' },
            de: { title: 'Identität bestätigen', description: 'Geben Sie Ihr Passwort ein, um diese sensible Änderung fortzusetzen. Die Sitzungsdauer bleibt unverändert.', confirm: 'Weiter', cancel: 'Abbrechen', error: 'Das Passwort konnte nicht bestätigt werden. Bitte erneut versuchen.', limited: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' }
        }[authLang()];
        var previousFocus = document.activeElement;
        reauthenticationPromise = new Promise(function (resolve) {
            var dialog = document.createElement('dialog');
            dialog.id = 'operartis-reauthenticate';
            dialog.className = 'op-auth-overlay';
            dialog.dataset.authTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            dialog.style.cssText = 'display:flex;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;overflow:auto';
            dialog.setAttribute('aria-labelledby', 'operartis-reauth-title');
            dialog.innerHTML = '<form class="op-auth-card"><h2 id="operartis-reauth-title" class="op-auth-title"></h2><p class="op-auth-sub"></p><label class="op-auth-field"><span class="op-auth-label"></span><input class="op-auth-input" type="password" name="password" autocomplete="current-password" required maxlength="1024"></label><div class="op-auth-error" role="alert"></div><button type="submit" class="op-auth-button"></button><button type="button" class="op-auth-link"></button></form>';
            var input = dialog.querySelector('input');
            var submit = dialog.querySelector('[type=submit]');
            var cancel = dialog.querySelector('[type=button]');
            var error = dialog.querySelector('.op-auth-error');
            dialog.querySelector('h2').textContent = copy.title;
            dialog.querySelector('p').textContent = copy.description;
            dialog.querySelector('.op-auth-label').textContent = t('password');
            submit.textContent = copy.confirm;
            cancel.textContent = copy.cancel;
            var confirmed = false;
            dialog.addEventListener('close', function () {
                input.value = '';
                dialog.remove();
                previousFocus?.focus?.();
                resolve(confirmed);
            });
            cancel.addEventListener('click', function () { dialog.close(); });
            dialog.querySelector('form').addEventListener('submit', async function (event) {
                event.preventDefault();
                if (submit.disabled) return;
                submit.disabled = true;
                error.style.display = 'none';
                try {
                    await window.OperartisApi.reauthenticate(input.value);
                    confirmed = true;
                    if (dialog.open) dialog.close();
                } catch (failure) {
                    error.textContent = failure.message?.includes('Too many attempts') ? copy.limited : copy.error;
                    error.style.display = 'block';
                    input.value = '';
                    input.focus();
                } finally { submit.disabled = false; }
            });
            document.body.appendChild(dialog);
            dialog.showModal();
            input.focus();
        }).finally(function () { reauthenticationPromise = null; });
        return reauthenticationPromise;
    }

    window.OperartisAuth = {
        requestReauthentication: requestReauthentication,
        showLogin: showLogin,
        refresh: refresh,
        logout: logout,
        mountTopbar: buildTopbarAccount,
        syncUser: syncExternalUser,
        getUser: function () { return state.user; }
    };

    window.addEventListener('operartis:unauthorized', handleUnauthenticated);
    window.addEventListener('operartis:logged-out', handleUnauthenticated);
    window.addEventListener('operartis:login-broadcast', function () { refresh().catch(function () { }); });
    window.addEventListener('operartis:user-updated', function (event) {
        syncExternalUser(event.detail && event.detail.user);
    });
    window.addEventListener('storage', function (event) {
        if (event.key === 'operartis_user_updated') refresh().catch(function () { });
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { refresh().catch(function () { }); });
    else refresh().catch(function () { });
})();

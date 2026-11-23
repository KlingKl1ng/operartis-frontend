(function () {
    var config = window.OPERARTIS_ACCESS_GATE || {};
    if (config.enabled === false) return;

    var appSelector = config.appSelector || '#root';
    var gateId = config.gateId || 'operartis-module-access-gate';
    var backHref = config.backHref || './index.html';
    var root = null;
    var gate = null;
    var styleId = 'operartis-module-access-gate-style';
    var initialized = false;
    var verifying = false;

    var COPY = {
        en: {
            title: 'Sign In to Continue',
            signIn: 'Sign In',
            back: 'Back To Site',
            helpPrompt: "Don't have an account yet?",
            helpLink: 'Contact Operartis',
            dashboard: {
                subtitle: 'Dashboard',
                body: 'Sign in with your invited account to manage your profile, open modules, view retained reports, and change your password.',
                aria: 'Sign in required to continue',
            },
            module: {
                subtitle: 'Module access',
                body: 'Sign in with your invited account to open this optimization module and continue your work.',
                aria: 'Module access requires sign in',
            },
        },
        vi: {
            title: 'Đăng nhập để tiếp tục',
            signIn: 'Đăng nhập',
            back: 'Về trang chủ',
            helpPrompt: 'Bạn vẫn chưa có tài khoản riêng?',
            helpLink: 'Liên hệ Operartis',
            dashboard: {
                subtitle: 'Bảng điều khiển',
                body: 'Đăng nhập bằng tài khoản được mời để quản lý hồ sơ, mở mô-đun, xem báo cáo được lưu và đổi mật khẩu.',
                aria: 'Cần đăng nhập để tiếp tục',
            },
            module: {
                subtitle: 'Truy cập mô-đun',
                body: 'Đăng nhập bằng tài khoản được mời để mở mô-đun tối ưu hóa này và tiếp tục công việc.',
                aria: 'Cần đăng nhập để truy cập mô-đun',
            },
        },
        de: {
            title: 'Anmelden zum Fortfahren',
            signIn: 'Anmelden',
            back: 'Zur Startseite',
            helpPrompt: 'Sie haben noch kein eigenes Konto?',
            helpLink: 'Operartis kontaktieren',
            dashboard: {
                subtitle: 'Dashboard',
                body: 'Melden Sie sich mit Ihrem eingeladenen Konto an, um Ihr Profil zu verwalten, Module zu offnen, gespeicherte Berichte anzusehen und Ihr Passwort zu andern.',
                aria: 'Anmeldung erforderlich',
            },
            module: {
                subtitle: 'Modulzugriff',
                body: 'Melden Sie sich mit Ihrem eingeladenen Konto an, um dieses Optimierungsmodul zu offnen und weiterzuarbeiten.',
                aria: 'Modulzugriff erfordert Anmeldung',
            },
        },
    };

    var MODULE_SUBTITLES = {
        forecaster: {
            en: 'Machine-Learning Forecaster',
            vi: 'Dự Báo Học Máy',
            de: 'Machine-Learning Prognose',
        },
        mlforecaster: {
            en: 'Advanced-ML Forecaster',
            vi: 'Dự Báo Học Máy Nâng Cao',
            de: 'Erweiterte ML-Prognose',
        },
        abcxyz: {
            en: 'ABC-XYZ Analysis',
            vi: 'Phân tích ABC-XYZ',
            de: 'ABC-XYZ Analyse',
        },
        inventory: {
            en: 'Inventory Optimizer',
            vi: 'Tối Ưu Hoá Tồn Kho',
            de: 'Bestandsoptimierung',
        },
        vrp: {
            en: 'Vehicle Routing',
            vi: 'Định Tuyến Phương Tiện',
            de: 'Fahrzeugroutenplanung',
        },
    };

    function resolveModuleKey() {
        if (config.moduleKey) return config.moduleKey;
        var path = String(window.location.pathname || '').toLowerCase();
        var file = path.split('/').pop() || '';
        return file.replace(/\.html$/, '');
    }

    function moduleSubtitle() {
        var bundle = MODULE_SUBTITLES[resolveModuleKey()];
        if (!bundle) return '';
        var lang = currentLang();
        return bundle[lang] || bundle.en || '';
    }

    function resolveGateScope() {
        if (config.gateType === 'dashboard' || config.gateType === 'module') {
            return config.gateType;
        }
        var path = String(window.location.pathname || '').toLowerCase();
        var file = path.split('/').pop() || '';
        if (file === 'dashboard' || file === 'dashboard.html' || file.indexOf('dashboard.html') === 0) {
            return 'dashboard';
        }
        return 'module';
    }

    function currentLang() {
        try {
            if (typeof window.getOperartisLang === 'function') {
                return window.getOperartisLang();
            }
        } catch (error) { }
        var lang = document.documentElement.lang || 'en';
        return String(lang).toLowerCase().split('-')[0];
    }

    function t(key) {
        var lang = currentLang();
        var bundle = COPY[lang] || COPY.en;
        var scope = resolveGateScope();
        if (key === 'subtitle' || key === 'body' || key === 'aria') {
            var scoped = bundle[scope] && bundle[scope][key];
            if (scoped) return scoped;
            return (COPY.en[scope] && COPY.en[scope][key]) || '';
        }
        return bundle[key] || COPY.en[key] || '';
    }

    function authReady() {
        return window.OperartisAuth && typeof window.OperartisAuth.refresh === 'function';
    }

    function addStyles() {
        if (document.getElementById(styleId)) return;
        var link = document.createElement('link');
        link.id = styleId;
        link.rel = 'stylesheet';
        link.href = './operartis-access-shell.css?v=20261123-dark-text-btn';
        document.head.appendChild(link);
    }

    function buildGate() {
        gate = document.getElementById(gateId);
        if (gate) return gate;

        gate = document.createElement('div');
        gate.id = gateId;
        gate.className = 'operartis-access-shell';
        gate.setAttribute('role', 'region');
        gate.hidden = true;
        gate.innerHTML = [
            '<div class="access-card">',
            '  <div class="access-brand">',
            '    <span class="access-mark"><img src="./icononly_transparent_nobuffer.png" alt=""></span>',
            '    <strong>OPERARTIS</strong>',
            '    <span class="access-context"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span data-op-access="subtitle"></span></span>',
            '  </div>',
            '  <h1 data-op-access="title"></h1>',
            '  <p class="sub" data-op-access="body"></p>',
            '  <div class="access-actions">',
            '    <button type="button" class="access-sign-in" data-op-access-login><span data-op-access="signIn"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>',
            '    <a class="button-ghost" data-op-access-back><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg><span data-op-access="back"></span></a>',
            '  </div>',
            '  <p class="access-help"><span data-op-access="helpPrompt"></span> <a href="mailto:info@operartis.io" data-op-access="helpLink"></a></p>',
            '</div>',
        ].join('');
        document.body.appendChild(gate);

        gate.querySelector('[data-op-access-login]').addEventListener('click', function () {
            if (window.OperartisAuth && typeof window.OperartisAuth.showLogin === 'function') {
                window.OperartisAuth.showLogin();
                return;
            }
            var attempts = 0;
            var timer = window.setInterval(function () {
                attempts += 1;
                if (window.OperartisAuth && typeof window.OperartisAuth.showLogin === 'function') {
                    window.clearInterval(timer);
                    window.OperartisAuth.showLogin();
                } else if (attempts > 20) {
                    window.clearInterval(timer);
                }
            }, 100);
        });
        syncText();
        return gate;
    }

    function syncText() {
        if (!gate) return;
        gate.setAttribute('aria-label', t('aria'));
        var subtitle = gate.querySelector('[data-op-access="subtitle"]');
        var title = gate.querySelector('[data-op-access="title"]');
        var body = gate.querySelector('[data-op-access="body"]');
        var login = gate.querySelector('[data-op-access="signIn"]');
        var back = gate.querySelector('[data-op-access-back]');
        var backLabel = gate.querySelector('[data-op-access="back"]');
        var helpPrompt = gate.querySelector('[data-op-access="helpPrompt"]');
        var helpLink = gate.querySelector('[data-op-access="helpLink"]');
        if (subtitle) {
            if (config.subtitle) subtitle.textContent = config.subtitle;
            else if (resolveGateScope() === 'module' && moduleSubtitle()) subtitle.textContent = moduleSubtitle();
            else subtitle.textContent = t('subtitle');
        }
        if (title) title.textContent = t('title');
        if (body) body.textContent = config.body || t('body');
        if (login) login.textContent = t('signIn');
        if (back) back.href = backHref;
        if (backLabel) backLabel.textContent = t('back');
        if (helpPrompt) helpPrompt.textContent = t('helpPrompt');
        if (helpLink) helpLink.textContent = t('helpLink');
    }

    function setAppVisible(visible) {
        root = root || document.querySelector(appSelector);
        if (root) root.classList.toggle('operartis-module-hidden', !visible);
        document.body.classList.toggle('operartis-module-access-active', !visible);
    }

    function showGate() {
        addStyles();
        buildGate();
        setAppVisible(false);
        gate.hidden = false;
        gate.removeAttribute('aria-hidden');
    }

    function hideGate() {
        addStyles();
        buildGate();
        setAppVisible(true);
        gate.hidden = true;
        gate.setAttribute('aria-hidden', 'true');
    }

    function handleUser(user) {
        if (user && user.email) hideGate();
        else showGate();
    }

    function verifyAuth(attempt) {
        if (verifying) return;
        if (!authReady()) {
            if ((attempt || 0) < 40) {
                window.setTimeout(function () { verifyAuth((attempt || 0) + 1); }, 100);
                return;
            }
            showGate();
            return;
        }

        verifying = true;
        window.OperartisAuth.refresh()
            .then(handleUser)
            .catch(function () {
                showGate();
            })
            .finally(function () {
                verifying = false;
            });
    }

    function init() {
        if (initialized) return;
        initialized = true;

        addStyles();
        buildGate();
        setAppVisible(false);
        showGate();
        verifyAuth(0);

        window.addEventListener('operartis:authenticated', function (event) {
            handleUser(event.detail && event.detail.user);
        });
        window.addEventListener('operartis:auth-state', function (event) {
            handleUser(event.detail && event.detail.user);
        });
        window.addEventListener('operartis:logged-out', function () {
            showGate();
        });
        window.addEventListener('operartis:lang-change', syncText);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

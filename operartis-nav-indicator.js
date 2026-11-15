(function (global) {
    var KEY = 'operartis-nav-indicator-handoff';
    var MAX_AGE_MS = 20000;

    function prefersReducedMotion() {
        try {
            return global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (e) {
            return false;
        }
    }

    function trackEl(node) {
        if (node && node.classList && node.classList.contains('header-nav-tabs-track')) return node;
        if (node && node.querySelector) {
            var nested = node.querySelector('.header-nav-tabs-track');
            if (nested) return nested;
        }
        return document.querySelector('.header-nav-tabs-track');
    }

    function saveFromTrack(node) {
        if (prefersReducedMotion()) return false;
        var track = trackEl(node);
        if (!track) return false;
        var indicator = track.querySelector('.header-nav-glass-indicator');
        if (!indicator) return false;
        var trackRect = track.getBoundingClientRect();
        var rect = indicator.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return false;
        try {
            sessionStorage.setItem(KEY, JSON.stringify({
                left: rect.left - trackRect.left - track.clientLeft,
                top: rect.top - trackRect.top - track.clientTop,
                width: rect.width,
                height: rect.height,
                t: Date.now()
            }));
            return true;
        } catch (e) {
            return false;
        }
    }

    function consume() {
        if (prefersReducedMotion()) {
            try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
            return null;
        }
        try {
            var raw = sessionStorage.getItem(KEY);
            if (!raw) return null;
            sessionStorage.removeItem(KEY);
            var data = JSON.parse(raw);
            if (!data || typeof data.t !== 'number' || Date.now() - data.t > MAX_AGE_MS) return null;
            if (!(data.width > 0 && data.height > 0)) return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    function navIdFromLocation() {
        var hash = String(global.location.hash || '').replace(/^#/, '');
        if (!hash) return null;
        if (hash.indexOf('horizon-') === 0) return hash.slice(8);
        if (hash === 'platform') return 'strategic';
        return hash;
    }

    function isContactHref(href) {
        if (!href) return false;
        var path = String(href).split('#')[0].split('?')[0];
        return /(^|\/)contact\/?$/.test(path) || /(^|\/)contact\.html$/.test(path);
    }

    function isOnContactPage() {
        var path = String(global.location.pathname || '');
        return /(^|\/)contact\/?$/.test(path) || /(^|\/)contact\.html$/.test(path);
    }

    function go(href) {
        saveFromTrack();
        global.location.href = href;
    }

    document.addEventListener('click', function (event) {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!anchor) return;
        var href = anchor.getAttribute('href');
        if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0) return;

        var leavingForContact = isContactHref(href) && !isOnContactPage();
        var leavingContact = isOnContactPage() && !isContactHref(href);
        if (!leavingForContact && !leavingContact) return;

        event.preventDefault();
        go(anchor.href);
    }, true);

    global.OperartisNavIndicator = {
        saveFromTrack: saveFromTrack,
        consume: consume,
        navIdFromLocation: navIdFromLocation,
        go: go
    };
})(window);

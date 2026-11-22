// Display formatting only. Keep API values, chart coordinates and input values raw.
(function () {
    function forLanguage(language) {
        const locale = ({ en: 'en-US', vi: 'vi-VN', de: 'de-DE' })[language] || 'en-US';
        function number(value, min = 0, max = 3) {
            if (value == null || value === '') return '—';
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return String(value);
            return new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max }).format(numeric);
        }
        function date(value) {
            if (value == null) return '';
            const text = value instanceof Date ? value.toISOString() : String(value);
            const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?=$|[T ])(.*)$/);
            if (!match) return text;
            const [, year, month, day, time] = match;
            const calendar = language === 'vi' ? `${day}/${month}/${year}`
                : language === 'de' ? `${day}.${month}.${year}` : `${year}-${month}-${day}`;
            return calendar + time.replace(/^T/, ' ');
        }
        // Account events are instants; forecast calendar labels above are not.
        function dateTime(value, { timeZone } = {}) {
            if (value == null || value === '') return '';
            const text = String(value);
            if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return date(text);
            const isIsoTimestamp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text);
            if (!(value instanceof Date) && !isIsoTimestamp) return text;
            // The backend stores UTC, including legacy timestamps without a suffix.
            const normalized = text.replace(' ', 'T');
            const instant = value instanceof Date ? value : new Date(
                /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : normalized + 'Z'
            );
            if (!Number.isFinite(instant.getTime())) return text;
            const options = {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hourCycle: 'h23',
            };
            // An empty/invalid saved timezone falls back to the browser timezone.
            if (timeZone) {
                try {
                    new Intl.DateTimeFormat(locale, { timeZone }).format(instant);
                    options.timeZone = timeZone;
                } catch (_) { /* Use the browser default. */ }
            }
            const parts = Object.fromEntries(new Intl.DateTimeFormat(locale, options)
                .formatToParts(instant).map(part => [part.type, part.value]));
            const calendar = date(`${parts.year}-${parts.month}-${parts.day}`);
            const clock = `${parts.hour}:${parts.minute}:${parts.second}`;
            return `${calendar} ${clock}${parts.dayPeriod ? ' ' + parts.dayPeriod : ''}`;
        }
        return {
            locale, number, date, dateTime,
            fixed: (value, digits = 0) => number(value, digits, digits),
            currency: value => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value),
        };
    }
    window.OperartisFormat = { forLanguage };
})();

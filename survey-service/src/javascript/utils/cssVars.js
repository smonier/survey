/**
 * Resolves a CSS custom property reference to its computed colour string.
 *
 * SVG presentation attributes (Recharts fill, stroke…) do not support
 * CSS variable references — they need real colour values. This utility
 * forces the browser to compute the final value by applying the variable
 * to a hidden DOM element and reading it back via getComputedStyle.
 *
 * Results are memoised so each variable is resolved at most once.
 * Safe to call at module initialisation time: Moonstone CSS is always
 * loaded before jcontent renders UI-extension components.
 *
 * @param {string} varRef   CSS variable reference, e.g. 'var(--color-accent)'
 * @param {string} fallback Hex fallback when the variable is not defined
 * @returns {string} Resolved colour string, e.g. 'rgb(44, 94, 232)', or fallback
 */
const _cache = {};

export const cssColor = (varRef, fallback = '#000000') => {
    if (_cache[varRef] !== undefined) {
        return _cache[varRef];
    }

    if (typeof document === 'undefined') {
        return fallback;
    }

    try {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
        el.style.color = varRef; // forces the browser to resolve the variable
        document.documentElement.appendChild(el);
        const resolved = getComputedStyle(el).color;
        document.documentElement.removeChild(el);

        // 'rgba(0, 0, 0, 0)' means the variable didn't resolve to a valid colour
        if (resolved && resolved !== 'rgba(0, 0, 0, 0)') {
            _cache[varRef] = resolved;
            return resolved;
        }
    } catch {
        // DOM access failed (e.g. JSDOM in tests) — fall through to fallback
    }

    _cache[varRef] = fallback;
    return fallback;
};

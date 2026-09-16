// i18n.js —— 多语言：语言包加载 + 文本解析 + UI 应用
// 语言包：sc.json（简体中文）/ en.json（英文），结构 { ui, crew, fate, hints }
const I18N = (() => {
    let lang = localStorage.getItem('app_lang') || 'sc';
    let dict = null;
    const listeners = [];

    function getLang() { return lang; }

    // 点路径取值：t('ui.common.unknown') → dict.ui.common.unknown
    function t(path) {
        if (!dict) return '';
        let node = dict;
        for (const part of path.split('.')) {
            if (node && typeof node === 'object' && part in node) node = node[part];
            else return '';
        }
        return typeof node === 'string' ? node : '';
    }

    // 带占位符模板：tpl('ui.common.name_role', { name, role }) → 替换 {name} {role}
    function tpl(path, params) {
        let s = t(path);
        if (params && s) {
            for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v);
        }
        return s;
    }

    async function load(targetLang) {
        lang = targetLang || lang;
        const resp = await fetch(`${lang}.json`, { cache: 'no-store' });
        dict = await resp.json();
        localStorage.setItem('app_lang', lang);
        document.documentElement.lang = lang === 'en' ? 'en' : 'zh';
        const title = t('ui.app_title');
        if (title) document.title = title;
    }

    // 应用静态文本：data-i18n（文本）、data-i18n-attr="attr|key"（属性）
    function applyStatic() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const v = t(el.getAttribute('data-i18n'));
            if (v !== '') el.textContent = v;
        });
        document.querySelectorAll('[data-i18n-attr]').forEach(el => {
            const spec = el.getAttribute('data-i18n-attr');
            const sep = spec.indexOf('|');
            const attr = spec.slice(0, sep).trim();
            const key = spec.slice(sep + 1).trim();
            const v = t(key);
            if (v !== '') el.setAttribute(attr, v);
        });
    }

    function onChange(fn) { listeners.push(fn); }

    async function setLanguage(l) {
        await load(l);
        applyStatic();
        for (const fn of listeners) fn(lang);
    }

    return { getLang, load, t, tpl, applyStatic, onChange, setLanguage };
})();

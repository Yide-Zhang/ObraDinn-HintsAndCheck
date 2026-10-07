// i18n.js —— 多语言：语言包加载 + 文本解析 + UI 应用
// 语言包：sc.json（简体中文）/ en.json（英文），结构 { ui, crew, fate, hints }
const I18N = (() => {
    let lang = localStorage.getItem('app_lang') || 'sc';
    let dict = null;
    const listeners = [];

    // ---- 译名标志展开（由 main.js 按当前档位注入）----
    // setTokenMap({ '[CrewNameCaptain]': '罗伯特·威特瑞', ... })；null = 不展开。
    // 正则只由「表里实际存在的标志」逐字转义拼成，因此绝不会误伤提示文本里的
    // 超链接写法 [显示文本](face_XX.png)——那里方括号内不是标志名。
    let tokenMap = null;
    let tokenRe = null;
    let tokenCache = new Map();          // 原文 → 已展开（换档时清空）

    function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function setTokenMap(map) {
        const keys = map ? Object.keys(map) : [];
        tokenMap = keys.length ? map : null;
        tokenCache = new Map();
        tokenRe = tokenMap
            ? new RegExp(keys.sort((a, b) => b.length - a.length).map(escRe).join('|'), 'g')
            : null;
    }

    function expand(text) {
        if (!tokenMap || !text || text.indexOf('[') < 0) return text;
        const cached = tokenCache.get(text);
        if (cached !== undefined) return cached;
        const out = text.replace(tokenRe, (m) => (tokenMap[m] !== undefined ? tokenMap[m] : m));
        tokenCache.set(text, out);
        return out;
    }

    function getLang() { return lang; }

    // 提示槽位的档位可用性声明（语言包顶层 hint_skip）：
    //   { "face_22_identity_0": [4, 5] } → 该槽位在 4/5 档位下不成立：不显示，也不参与「获取新提示」
    // 放在语言包里，是因为它描述的是「这段译文在哪些译名档位下不成立」；英文包不带此键 → 完全不生效。
    function getHintSkip() { return (dict && dict.hint_skip) || null; }

    // 点路径取值：t('ui.common.unknown') → dict.ui.common.unknown
    function t(path) {
        if (!dict) return '';
        let node = dict;
        for (const part of path.split('.')) {
            if (node && typeof node === 'object' && part in node) node = node[part];
            else return '';
        }
        return typeof node === 'string' ? expand(node) : '';
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

    return { getLang, load, t, tpl, applyStatic, onChange, setLanguage, setTokenMap, getHintSkip };
})();

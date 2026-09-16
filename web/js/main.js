// 窗口相对缩放：设计基准 = 2560×1440 物理屏幕 @ DPR 1.5 → CSS 视口 1707×960
// 其余窗口按 min(宽,高) 比例整体缩放；额外放大 10%
function updateWindowScale() {
    const scale = Math.min(window.innerWidth / 1707, window.innerHeight / 960) * 1.1;
    document.documentElement.style.setProperty('--scale', String(scale));
}
updateWindowScale();
window.addEventListener('resize', updateWindowScale);

// Global State
let faces_data = {};
let crew_list = [];
let correct_map = {};
let fates_structure = [];
let correct_fates = {};
let revealed_state = {};

// 不详标记项（选择身份界面；负 id；选择后不允许查验）
const UNKNOWN_ITEMS = [
    { id: -10, cat: null },              // 不详（整行居中）
    { id: -11, cat: 'officer' },         // 不详的官员
    { id: -12, cat: 'passenger' },       // 不详的乘客
    { id: -13, cat: 'steward' },         // 不详的服务员
    { id: -14, cat: 'midshipman' },      // 不详的见习官员
    { id: -15, cat: 'topman' },          // 不详的桅楼守望员
    { id: -16, cat: 'seaman' },          // 不详的水手
];
const CREW_PER_PAGE = 12;               // 每页 12 行

function isUnknownId(id) { return typeof id === 'number' && id < 0; }
function getUnknownItem(id) { return UNKNOWN_ITEMS.find(u => u.id === id) || null; }
// 凶手/身份显示名：敌人/野兽/船员/不详/不详的XX（分类显示笼统身份名）
function getOffenderName(offenderId) {
    if (offenderId === -1) return I18N.t('ui.common.enemy') || '敌人';
    if (offenderId === -2) return I18N.t('ui.common.beast') || '野兽';
    if (isUnknownId(offenderId)) {
        const u = getUnknownItem(offenderId);
        return (u && u.cat)
            ? (I18N.t('ui.unknown.cat_' + u.cat) || I18N.t('ui.common.unknown') || '不详')
            : (I18N.t('ui.common.unknown') || '不详');
    }
    if (offenderId) {
        const c = crew_list.find(c => c.id === offenderId);
        if (c) return I18N.t('crew.abbr_' + c.id) || c.abbr || I18N.t('crew.name_' + c.id) || c.name;
    }
    return I18N.t('ui.common.unknown') || '不详';
}
// 选择器列表：身份/凶手模式都按身份分组（不详+敌人/野兽+该分类船员）
function getCrewSelectList() {
    const byId = new Map(crew_list.map(c => [c.id, c]));
    const result = [];
    const addUnknown = (cat) => { const u = UNKNOWN_ITEMS.find(x => x.cat === cat); if (u) result.push(u); };
    const addRange = (lo, hi) => { for (let i = lo; i <= hi; i++) { const c = byId.get(i); if (c) result.push(c); } };
    // 不详（居中）
    result.push(UNKNOWN_ITEMS[0]);
    // 凶手模式：不详后接敌人、野兽（居中，显示同不详）
    if (crew_mode === 'offender') {
        result.push({ id: -1, cat: 'enemy' });
        result.push({ id: -2, cat: 'beast' });
    }
    // 不详的官员 + 1-18 号
    addUnknown('officer'); addRange(1, 18);
    // 不详的乘客 + 19-26 号
    addUnknown('passenger'); addRange(19, 26);
    // 不详的服务员 + 27-32 号
    addUnknown('steward'); addRange(27, 32);
    // 不详的见习官员 + 33-35 号
    addUnknown('midshipman'); addRange(33, 35);
    // 不详的桅楼守望员 + 36-45 号
    addUnknown('topman'); addRange(36, 45);
    // 不详的水手 + 46-60 号
    addUnknown('seaman'); addRange(46, 60);
    return result;
}

// FolioSketch View State
let sketchImg = null;
let sketchW = 640;
let sketchH = 960;
let annotations = [];          // [{ id, face_file, mask, layer, hasPaint }]
let idToFace = {};             // 船员 id → face_XX.png
let combinedCtx = null;        // 蒙版合并索引图（R=下标+1）
let sketchDisplayW = 0;
let sketchDisplayH = 0;

const sketchCanvas = document.getElementById('sketch-canvas');
const sketchCtx = sketchCanvas ? sketchCanvas.getContext('2d') : null;

let current_detail_filename = "";

// ===== 加载页进度 =====
// 用法：add(任务数) 登记 → 每完成一项 tick() → seal() 表示登记结束 → done>=total 时淡出。
// 兜底：MAX_WAIT 后无论进度如何都放行，避免个别资源卡死页面。
const Loading = (() => {
    const screen = document.getElementById('loading-screen');
    const fill = document.getElementById('loading-fill');
    const percent = document.getElementById('loading-percent');
    const MIN_SHOW = 400;      // 最少显示时长：桌面版本地加载极快，避免加载页一闪而过
    const MAX_WAIT = 20000;
    const startedAt = performance.now();
    let total = 0, done = 0, finished = false, sealed = false;

    function render() {
        const p = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0;
        if (fill) fill.style.width = p + '%';
        if (percent) percent.textContent = p + '%';
    }
    function add(n) { total += n; render(); }
    function tick() { done++; render(); check(); }
    function seal() { sealed = true; check(); }
    function check() { if (!finished && sealed && total > 0 && done >= total) finish(); }
    function finish() {
        if (finished) return;
        finished = true;
        if (fill) fill.style.width = '100%';
        if (percent) percent.textContent = '100%';
        const wait = Math.max(0, MIN_SHOW - (performance.now() - startedAt));
        setTimeout(() => {
            if (!screen) return;
            screen.classList.add('done');                      // 淡出
            setTimeout(() => { screen.classList.add('gone'); }, 400);
        }, wait);
    }
    setTimeout(finish, MAX_WAIT);   // 兜底
    return { add, tick, seal, finish };
})();

// ===== 移动端检测 =====
// 程序是桌面布局（大面积悬停命中 + 鼠标光标），手机上几乎无法操作 → 检测到就建议换设备。
// 桌面版跑在 Edge app 窗口里，UA 永远不是移动端，所以这里不会触发。
function isMobileBrowser() {
    const ua = navigator.userAgent || '';
    if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone|Mobile/i.test(ua)) return true;
    // iPadOS 13+ 的 UA 与 macOS 相同，只能靠触摸点数区分
    if (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1) return true;
    return false;
}

function setupMobileNotice() {
    if (!isMobileBrowser()) return;
    const el = document.getElementById('mobile-notice');
    if (!el) return;
    el.classList.remove('hidden');
    cursorRefresh();
    const btn = document.getElementById('btn-mobile-continue');
    if (btn) {
        btn.addEventListener('mouseenter', () => playSound('SelChange.wav'));
        btn.addEventListener('click', () => {
            playSound('PopupOpen.wav');
            el.classList.add('hidden');
            cursorRefresh();
        });
    }
}

// Initialize App
async function init() {
    Loading.add(8);          // 语言包 1 + 数据 7（getInitData 的 7 个请求）
    await I18N.load();
    Loading.tick();
    I18N.applyStatic();
    const data = await Backend.getInitData(() => Loading.tick());
    faces_data = data.faces_data;
    crew_list = data.crew_list;
    correct_map = data.correct_map;
    fates_structure = data.fates_structure;
    correct_fates = data.correct_fates;
    annotations = (data.annotations || []).filter(a => a && a.mask);
    idToFace = data.id_to_face || {};

    // 预热任务总数（网页版＝字体＋60 张脸图；桌面版＝0）：必须在下一个 await 之前登记，
    // 否则数据阶段的最后一次 tick 会让进度条提前判定完成
    const faceFiles = Object.keys(faces_data || {});
    const preCount = (typeof Backend.warmupTaskCount === 'function') ? Backend.warmupTaskCount(faceFiles) : 0;
    if (preCount) Loading.add(preCount);

    revealed_state = await Backend.loadState();

    // 启动时自动把未填身份/下落初始化为“不详”：缺失 state 或字段为空的 face 全部补上
    // （身份 guessed_id=-10；下落 cause_id=1 不详 + offender_id=-10 不详）
    let migrated = false;
    for (const fn of Object.keys(faces_data)) {
        let st = revealed_state[fn];
        if (!st) {
            revealed_state[fn] = { identity: 0, fate: 0, guessed_id: -10, status: "pending", guessed_fate: { cause_id: 1, weapon: null, offender_id: -10 }, fate_status: "pending" };
            migrated = true;
        } else {
            // 迁移：身份未填 → 不详
            if (st.guessed_id === null || st.guessed_id === undefined) { st.guessed_id = -10; migrated = true; }
            // 迁移：下落未填 → 不详，不详（死因 1 / 凶手 -10）
            const gf = st.guessed_fate || (st.guessed_fate = {});
            if (gf.cause_id === null || gf.cause_id === undefined) { gf.cause_id = 1; migrated = true; }
            if (gf.offender_id === null || gf.offender_id === undefined) { gf.offender_id = -10; migrated = true; }
        }
    }
    if (migrated) await Backend.saveState(revealed_state);

    if (data.sketch_b64 && sketchCanvas) {
        sketchImg = new Image();
        sketchImg.onload = async () => {
            sketchW = sketchImg.naturalWidth || 640;
            sketchH = sketchImg.naturalHeight || 960;
            await setupLayers();
            buildCombinedIndex();
            sizeSketchCanvas();
            renderSketch();
            bindEvents();
        };
        sketchImg.src = data.sketch_b64;
    } else {
        bindEvents();
    }

    // 资源预热：网页版后台预取字体与脸图（桌面版为本地文件，空实现）
    if (typeof Backend.warmupCache === 'function') Backend.warmupCache(faceFiles, () => Loading.tick());

    Loading.seal();   // 任务登记完毕，等剩余 tick 到齐后淡出加载页

    setupMobileNotice();   // 移动端浏览器：提示改用电脑（桌面版不会触发）
}

function bindEvents() {
    // 语言切换按钮：显示目标语言图标（当前中文→英文图标，点击变英文；反之亦然）
    const langBtn = document.getElementById('btn-lang');
    if (langBtn) {
        langBtn.classList.add(I18N.getLang() === 'en' ? 'sc' : 'en');
        langBtn.addEventListener('click', async () => {
            const next = I18N.getLang() === 'en' ? 'sc' : 'en';
            await I18N.setLanguage(next);   // 无刷新切换：applyStatic + onChange 重渲染动态内容
        });
    }
    // 语言切换后：重渲染所有动态内容（图片不重载 → 无黑屏）；按键绑定/关于列表同步刷新
    I18N.onChange(() => { refreshI18nUI(); renderKeybindList(); renderInfoList(); });

    // 格式化按钮：hover 播放 SelChange；点击先停掉未播完的 SelChange 再播 FateOpen（避免双音效）
    const formatBtn = document.getElementById('btn-format');
    formatBtn.addEventListener('mouseenter', () => { formatSelAudio = playSound('SelChange.wav'); });
    formatBtn.addEventListener('click', async (e) => {
        // 圆形碰撞检测：图标为圆形，忽略矩形角落的点击
        const r = formatBtn.getBoundingClientRect();
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        if (Math.sqrt(dx * dx + dy * dy) > r.width / 2) return;
        openFormatConfirm();
    });
    // 确认窗口：是 → 清空并播撕纸音；否 → 关闭并随机播 FateClose；长条按钮 hover 播放 SelChange
    document.getElementById('btn-format-yes').addEventListener('click', async () => {
        fmtSelDeactivate();
        document.getElementById('format-confirm').classList.add('hidden');
        cursorRefresh();   // 先隐藏再刷新：命中主视图元素
        playSound('paper-tear-a-sheet-of-paper.mp3');
        await Backend.resetState();
        revealed_state = {};
        // 格式化后自动把所有 face 初始化为“不详”（身份 -10；下落 不详+不详）
        for (const fn of Object.keys(faces_data)) {
            revealed_state[fn] = { identity: 0, fate: 0, guessed_id: -10, status: "pending", guessed_fate: { cause_id: 1, weapon: null, offender_id: -10 }, fate_status: "pending" };
        }
        await Backend.saveState(revealed_state);
    });
    document.getElementById('btn-format-no').addEventListener('click', () => {
        fmtSelDeactivate();
        document.getElementById('format-confirm').classList.add('hidden');
        cursorRefresh();   // 先隐藏再刷新：命中主视图元素（ESC 退出也走这里）
        playFateCloseSound();
    });
    document.querySelectorAll('.format-confirm-btn').forEach(b => {
        b.addEventListener('mouseenter', () => playSound('SelChange.wav'));
    });

    // FolioSketch 交互：悬停显示名字、点击进入详情
    if (sketchCanvas) {
        sketchCanvas.addEventListener('mousemove', onSketchMove);
        sketchCanvas.addEventListener('mouseleave', hidePortrait);
        sketchCanvas.addEventListener('click', onSketchClick);
    }
    window.addEventListener('resize', () => {
        if (sketchImg) { sizeSketchCanvas(); renderSketch(); }
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        playFateCloseSound();
        detDeactivate();
        document.getElementById('detail-view').classList.remove('active');
        document.getElementById('list-view').classList.add('active');
        cursorRefresh();   // 先切视图再刷新：命中新视图元素
    });

    // Identity Check
    document.getElementById('btn-check-identity').addEventListener('click', () => {
        checkIdentity(current_detail_filename);
    });
    document.getElementById('btn-check-identity').addEventListener('mouseenter', (e) => { if (!e.target.disabled) playSound('SelChange.wav'); });

    // Fate Check
    document.getElementById('btn-check-fate').addEventListener('click', () => {
        checkFate(current_detail_filename);
    });
    document.getElementById('btn-check-fate').addEventListener('mouseenter', (e) => { if (!e.target.disabled) playSound('SelChange.wav'); });

    // Reveals
    document.getElementById('btn-reveal-identity').addEventListener('click', () => {
        revealHint(current_detail_filename, 'identity');
    });
    document.getElementById('btn-reveal-identity').addEventListener('mouseenter', () => playSound('SelChange.wav'));
    document.getElementById('btn-reveal-fate').addEventListener('click', () => {
        revealHint(current_detail_filename, 'fate');
    });
    document.getElementById('btn-reveal-fate').addEventListener('mouseenter', () => playSound('SelChange.wav'));


    // Selectors Nav（翻页角标：左=上一页，右=下一页；点击播 PopupOpen，hover 无音效）
    document.getElementById('btn-crew-page-prev').addEventListener('click', () => { playSound('PopupOpen.wav'); changeCrewPage(-1); });
    document.getElementById('btn-crew-page-next').addEventListener('click', () => { playSound('PopupOpen.wav'); changeCrewPage(1); });
    document.getElementById('btn-crew-cancel').addEventListener('click', () => {
        playFateCloseSound();
        document.getElementById('crew-selector').classList.add('hidden');
        selDeactivate();
        cursorRefresh();
    });

    document.getElementById('btn-fate-page-prev').addEventListener('click', () => { playSound('PopupOpen.wav'); changeFatePage(-1); });
    document.getElementById('btn-fate-page-next').addEventListener('click', () => { playSound('PopupOpen.wav'); changeFatePage(1); });
    document.getElementById('btn-fate-cancel').addEventListener('click', () => {
        playFateCloseSound();
        // 武器页 → 返回一级选项；否则关闭选择器
        if (fate_weapon_mode) {
            renderFatePage();
        } else {
            document.getElementById('fate-selector').classList.add('hidden');
            selDeactivate();
            cursorRefresh();
        }
    });

    // 按键绑定入口
    document.getElementById('btn-keybind').addEventListener('mouseenter', () => playSound('SelChange.wav'));
    document.getElementById('btn-keybind').addEventListener('click', () => {
        playFateOpenSound();
        openKeybindSelector();
    });
    document.getElementById('btn-keybind-cancel').addEventListener('click', () => {
        playFateCloseSound();
        closeKeybindSelector();
    });

    // 关于入口
    document.getElementById('btn-info').addEventListener('mouseenter', () => playSound('SelChange.wav'));
    document.getElementById('btn-info').addEventListener('click', () => {
        playFateOpenSound();
        openInfoSelector();
    });
    document.getElementById('btn-info-cancel').addEventListener('click', () => {
        playFateCloseSound();
        closeInfoSelector();
    });

    // 所有圆形返回/取消按钮（.back-btn：详情页返回、各选择器取消）hover 统一播 SelChange
    document.querySelectorAll('.back-btn').forEach((btn) => {
        btn.addEventListener('mouseenter', () => playSound('SelChange.wav'));
    });

    // 鼠标动起来 → 键盘 hover 转交鼠标（清除 kb-hover，让 CSS hover 独占显示，不并存两个高亮）
    document.getElementById('crew-selector').addEventListener('mousemove', selDeactivate);
    document.getElementById('fate-selector').addEventListener('mousemove', selDeactivate);
    // 详情页：鼠标动起来 → 键盘高亮转交鼠标
    document.getElementById('detail-view').addEventListener('mousemove', detDeactivate);
    // 格式化弹窗：鼠标动起来 → 键盘高亮转交鼠标
    document.getElementById('format-confirm').addEventListener('mousemove', fmtSelDeactivate);
}

// 无刷新语言切换：按当前视图状态重渲染动态内容（图片不重载 → 不黑屏）
function refreshI18nUI() {
    // 语言按钮图标：显示目标语言图标
    const langBtn = document.getElementById('btn-lang');
    if (langBtn) {
        langBtn.classList.remove('sc', 'en');
        langBtn.classList.add(I18N.getLang() === 'en' ? 'sc' : 'en');
    }

    // 详情视图：重渲染身份/下落输入框与提示文本（不重载图片）
    if (current_detail_filename) {
        const faceData = faces_data[current_detail_filename] || {};
        renderGuessWidgets(current_detail_filename);
        const id_hints = faceData.identity_hints || (faceData.identity ? [faceData.identity] : [I18N.t('ui.common.no_identity') || '未记录身份']);
        const fate_hints = faceData.fate_hints || (faceData.fate ? [faceData.fate] : [I18N.t('ui.common.no_fate') || '未记录下落']);
        renderHints(current_detail_filename, 'identity', id_hints);
        renderHints(current_detail_filename, 'fate', fate_hints);
    }

    // 打开的选择器：按当前模式/页/武器页重渲染
    const crewSel = document.getElementById('crew-selector');
    const fateSel = document.getElementById('fate-selector');
    if (crewSel && !crewSel.classList.contains('hidden')) renderCrewPage();
    if (fateSel && !fateSel.classList.contains('hidden')) {
        if (fate_weapon_mode && fate_weapon_obj) renderWeaponPage(fate_weapon_obj);
        else renderFatePage();
    }

    // 草图 hover 肖像：若正显示则刷新文字（名字/身份/下落语言）
    const p = document.getElementById('hover-portrait');
    if (p && !p.classList.contains('hidden') && lastHoverIdx >= 0) {
        showPortrait(lastHoverIdx, lastHoverClientX);
    }
}

// Mixed Font rendering（纯文本段：按中英文分 span、处理换行）
function renderMixedPlain(text) {
    if (!text) return "";
    let html = "";
    let buffer = "";
    let is_en = true;

    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        let char_is_en = char.charCodeAt(0) < 128;
        
        if (char === '\n') {
            if (buffer) {
                html += `<span class="${is_en ? 'en' : 'cn'}">${buffer}</span>`;
                buffer = "";
            }
            html += "<br>";
            continue;
        }

        if (buffer && (char_is_en !== is_en)) {
            html += `<span class="${is_en ? 'en' : 'cn'}">${buffer}</span>`;
            buffer = char;
            is_en = char_is_en;
        } else {
            if (!buffer) is_en = char_is_en;
            buffer += char;
        }
    }
    if (buffer) {
        html += `<span class="${is_en ? 'en' : 'cn'}">${buffer}</span>`;
    }
    return html;
}

// 提示内链接：文本中用 [显示文本](face_XX.png) 标记 → 渲染为可点击跳转详情页的链接
function renderMixedText(text) {
    if (!text) return "";
    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let html = "";
    let last = 0;
    let m;
    while ((m = linkRe.exec(text)) !== null) {
        html += renderMixedPlain(text.slice(last, m.index));
        const face = m[2].trim();
        html += `<span class="hint-link" data-face="${face}">${m[1]}</span>`;
        last = m.index + m[0].length;
    }
    html += renderMixedPlain(text.slice(last));
    return html;
}

// ===== FolioSketch View =====
// 解码标注蒙版到离屏 layer
async function setupLayers() {
    for (let i = 0; i < annotations.length; i++) {
        const a = annotations[i];
        a.hasPaint = false;
        a.layer = document.createElement('canvas');
        a.layer.width = sketchW;
        a.layer.height = sketchH;
        if (a.mask) {
            await new Promise((resolve) => {
                const m = new Image();
                m.onload = () => {
                    a.layer.getContext('2d').drawImage(m, 0, 0);
                    a.hasPaint = true;
                    resolve();
                };
                m.onerror = resolve;
                m.src = a.mask;
            });
        }
    }
}

// 合并蒙版为索引图：R 通道 = 下标+1（阈值化直写，避免抗锯齿混色！）
function buildCombinedIndex() {
    const c = document.createElement('canvas');
    c.width = sketchW; c.height = sketchH;
    const cc = c.getContext('2d', { willReadFrequently: true });
    const imgData = cc.createImageData(sketchW, sketchH);
    const out = imgData.data;

    annotations.forEach((a, i) => {
        if (!a.hasPaint) return;
        const src = a.layer.getContext('2d').getImageData(0, 0, sketchW, sketchH).data;
        const idx = i + 1;
        for (let k = 0; k < src.length; k += 4) {
            if (src[k + 3] > 128) {
                out[k] = idx;
                out[k + 3] = 255;
            }
        }
    });
    cc.putImageData(imgData, 0, 0);
    combinedCtx = cc;
}

// 画布显示尺寸：宽 = 窗口宽 80%
function sizeSketchCanvas() {
    const dpr = window.devicePixelRatio || 1;
    sketchDisplayW = Math.max(200, Math.round(window.innerWidth * 0.8));
    sketchDisplayH = Math.round(sketchDisplayW * sketchH / sketchW);
    sketchCanvas.style.width = sketchDisplayW + 'px';
    sketchCanvas.style.height = sketchDisplayH + 'px';
    sketchCanvas.width = sketchDisplayW * dpr;
    sketchCanvas.height = sketchDisplayH * dpr;
}

function renderSketch() {
    if (!sketchCtx || !sketchImg || !sketchDisplayW) return;
    const dpr = window.devicePixelRatio || 1;
    sketchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sketchCtx.clearRect(0, 0, sketchDisplayW, sketchDisplayH);
    sketchCtx.drawImage(sketchImg, 0, 0, sketchDisplayW, sketchDisplayH);
}

// 屏幕坐标 → 蒙版命中（返回标注下标，-1=未命中）
function hitTestSketch(clientX, clientY) {
    if (!combinedCtx) return -1;
    const rect = sketchCanvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    if (sx < 0 || sy < 0 || sx >= sketchDisplayW || sy >= sketchDisplayH) return -1;
    const ix = Math.floor(sx / sketchDisplayW * sketchW);
    const iy = Math.floor(sy / sketchDisplayH * sketchH);
    if (ix < 0 || iy < 0 || ix >= sketchW || iy >= sketchH) return -1;
    const d = combinedCtx.getImageData(ix, iy, 1, 1).data;
    return d[0] > 0 ? d[0] - 1 : -1;
}

let lastHoverIdx = -1;
let lastHoverClientX = 0;   // 语言切换后重渲染 hover 肖像用
const hoverFaceCache = {};   // 船员 id -> FacesHi base64

function onSketchMove(e) {
    // 键盘移动中（rAF 活跃）：物理鼠标（系统光标）被 eel 跳步驱动，mousemove 会频繁切换人脸 → 频繁音效。
    // 抑制物理 hover，由键盘逻辑位置统一驱动（平滑、不频繁）。
    if (kbRaf) return;
    const idx = hitTestSketch(e.clientX, e.clientY);
    lastHoverClientX = e.clientX;
    if (idx >= 0) {
        // 悬停目标切换时播放 SelChange（游戏风格反馈）
        if (idx !== lastHoverIdx) {
            playSound('SelChange.wav');
            lastHoverIdx = idx;
        }
        showPortrait(idx, e.clientX);
    } else {
        lastHoverIdx = -1;
        hidePortrait();
    }
}

// 在素描对侧上角显示该人 FacesHi（鼠标在左半屏 → 右上角；右半屏 → 左上角）
function showPortrait(idx, clientX) {
    const a = annotations[idx];
    if (!a) return;
    const faceFile = a.face_file || idToFace[a.id];
    const img = document.getElementById('hover-portrait-img');
    const frame = document.getElementById('hover-portrait-frame');
    const p = document.getElementById('hover-portrait');
    if (!faceFile) { hidePortrait(); return; }

    const key = a.id;
    if (!hoverFaceCache[key]) {
        Backend.getImageUrl(faceFile).then(b64 => {
            hoverFaceCache[key] = b64 || '';
            img.src = hoverFaceCache[key];
        });
    } else {
        img.src = hoverFaceCache[key];
    }

    // 锚点基于屏幕尺寸计算：
    //   水平：图片中心固定在屏幕宽的两个四等分点（25% / 75%）
    //   垂直：图片中心固定在屏幕高 38% 处（自上而下）
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    // 图片宽 = 屏幕宽 16%；深色外框 = 屏宽 1%；浅色分隔条 = 屏宽 0.15%
    img.style.width = Math.round(winW * 0.16) + 'px';
    frame.style.padding = Math.round(winW * 0.0015) + 'px';
    frame.style.borderWidth = Math.round(winW * 0.01) + 'px';

    // 字号基准：条高 = 图片显示高 × 15%；身份/姓名字号 = 条高 × 55%；下落字号 = 身份字号 × 75%
    const aspect = (img.naturalHeight && img.naturalWidth) ? img.naturalHeight / img.naturalWidth : 194 / 150;
    const imgWpx = Math.round(winW * 0.16);
    const bandH = imgWpx * aspect * 0.15;
    const idFont = Math.round(bandH * 0.55);
    const fateFont = Math.round(idFont * 0.75);

    const st = revealed_state[faceFile];

    // 顶部身份条：显示已填的该人身份（角色）；已填未验证 → 851 手写；已验证 → 思源宋体；无已填 → 不显示
    // 不详项：不详隐藏身份条；不详的XX 显示笼统身份名
    const roleBand = document.getElementById('portrait-role-band');
    const roleText = document.getElementById('portrait-role-text');
    if (st && st.guessed_id) {
        if (isUnknownId(st.guessed_id)) {
            const u = getUnknownItem(st.guessed_id);
            const role = (u && u.cat) ? (I18N.t('ui.unknown.cat_' + u.cat) || '') : '';
            if (role) {
                roleText.textContent = role;
                roleText.classList.toggle('hand', st.status !== 'verified');
                roleText.classList.toggle('serif', st.status === 'verified');
                roleText.style.fontSize = idFont + 'px';
                roleBand.classList.remove('hidden');
            } else {
                roleBand.classList.add('hidden');
            }
        } else {
            const crew = crew_list.find(c => c.id === st.guessed_id);
            const role = crew ? (I18N.t('role.' + crew.role_id) || crew.role || '') : '';
            if (role) {
                roleText.textContent = role;
                roleText.classList.toggle('hand', st.status !== 'verified');
                roleText.classList.toggle('serif', st.status === 'verified');
                roleText.style.fontSize = idFont + 'px';
                roleBand.classList.remove('hidden');
            } else {
                roleBand.classList.add('hidden');
            }
        }
    } else {
        roleBand.classList.add('hidden');
    }

    // 底部 bar（遮住图片底部，类似顶部条）：姓名 + 下落
    //   姓名：显示逻辑与顶部身份条一致（有 guessed_id 才显示），字号 = 身份字号
    //   下落：始终显示（不详也显示），字号 = 身份字号 × 75%
    const nameLine = document.getElementById('portrait-name-line');
    const nameText = document.getElementById('portrait-name-text');
    const fateText = document.getElementById('portrait-fate-text');
    // 不详项（含分类）都不显示姓名
    if (st && st.guessed_id && !isUnknownId(st.guessed_id)) {
        const crew = crew_list.find(c => c.id === st.guessed_id);
        const crewName = crew ? (I18N.t('crew.name_' + crew.id) || crew.name) : '';
        if (crew && crewName) {
            nameText.textContent = crewName;
            nameText.classList.toggle('hand', st.status !== 'verified');
            nameText.classList.toggle('serif', st.status === 'verified');
            nameText.style.fontSize = idFont + 'px';
            nameLine.classList.remove('hidden');
        } else {
            nameLine.classList.add('hidden');
        }
    } else {
        nameLine.classList.add('hidden');
    }
    fateText.textContent = formatFateText(st);
    fateText.classList.toggle('hand', (st && st.fate_status) !== 'verified');
    fateText.classList.toggle('serif', (st && st.fate_status) === 'verified');
    fateText.style.fontSize = fateFont + 'px';

    // 定位：水平在屏宽四等分点（左半屏 → 75%，右半屏 → 25%）
    // 垂直：图片中心固定在屏高 38%（底部 bar 为 absolute 遮罩，不占文档流，无需补偿）
    if (clientX < winW / 2) {
        // 左半屏 → 图片中心在 75% 宽（右四等分点）
        p.style.left = Math.round(winW * 0.75) + 'px';
        p.style.right = 'auto';
    } else {
        // 右半屏 → 图片中心在 25% 宽（左四等分点）
        p.style.left = Math.round(winW * 0.25) + 'px';
        p.style.right = 'auto';
    }
    p.style.top = Math.round(winH * 0.38) + 'px';
    p.style.transform = 'translate(-50%, -50%)';
    p.classList.remove('hidden');
}

function hidePortrait() {
    document.getElementById('hover-portrait').classList.add('hidden');
}

// 组装底部 bar 的下落文本（与详情视图逻辑一致；未填/不详也返回“不详”）
function formatFateText(state) {
    const guess = (state && state.guessed_fate) || { cause_id: null, weapon: null, offender_id: null };
    const cause_id = guess.cause_id || 1;
    const c_obj = fates_structure.find(c => c.id === cause_id);
    if (!c_obj || cause_id === 1) return I18N.t('ui.common.unknown') || '不详';
    const comma = I18N.t('ui.common.comma') || '，';
    let text = I18N.t('fate.label_' + cause_id) || c_obj.label;
    if (c_obj.has_weapon && guess.weapon) {
        const wi = (c_obj.weapons || []).indexOf(guess.weapon);
        const wt = wi >= 0 ? (I18N.t(`fate.weapon_${cause_id}_${wi}`) || guess.weapon) : guess.weapon;
        text += comma + wt;
    }
    if (c_obj.requires_offender) {
        text += comma + getOffenderName(guess.offender_id);
    }
    return text;
}

function onSketchClick(e) {
    const idx = hitTestSketch(e.clientX, e.clientY);
    if (idx >= 0) {
        const a = annotations[idx];
        const faceFile = a.face_file || idToFace[a.id];
        if (faceFile) {
            playFateOpenSound();
            openDetails(faceFile);
        }
    }
}

// Detail View
async function openDetails(filename) {
    hidePortrait();
    current_detail_filename = filename;
    document.getElementById('list-view').classList.remove('active');
    document.getElementById('detail-view').classList.add('active');

    // Init state if missing（身份=不详；下落=不详+不详）
    if (!revealed_state[filename]) {
        revealed_state[filename] = { identity: 0, fate: 0, guessed_id: -10, status: "pending", guessed_fate: { cause_id: 1, weapon: null, offender_id: -10 }, fate_status: "pending" };
    }
    const state = revealed_state[filename];
    
    // Fallbacks for older structure
    if (!state.guessed_fate) state.guessed_fate = { cause_id: 1, weapon: null, offender_id: -10 };
    if (!state.fate_status) state.fate_status = "pending";

    // Load Image
    const imgEl = document.getElementById('detail-image');
    imgEl.src = await Backend.getImageUrl(filename);

    // Auto verify logic check before render
    const faceData = faces_data[filename] || {};
    let id_hints = faceData.identity_hints || (faceData.identity ? [faceData.identity] : [I18N.t('ui.common.no_identity') || '未记录身份']);
    let fate_hints = faceData.fate_hints || (faceData.fate ? [faceData.fate] : [I18N.t('ui.common.no_fate') || '未记录下落']);

    if (state.identity >= id_hints.length && state.status !== "verified") {
        if (correct_map[filename]) {
            state.guessed_id = correct_map[filename];
            state.status = "verified";
            await Backend.saveState(revealed_state);
        }
    }

    // Dynamic positioning (approximate centering)
    const updatePosition = () => {
        const wrapperLeft = document.querySelector('.guess-widget-wrapper.left');
        const wrapperRight = document.querySelector('.guess-widget-wrapper.right');
        const w = imgEl.clientWidth;
        wrapperLeft.style.right = `calc(50% + ${w/2 + 30}px)`;
        wrapperRight.style.left = `calc(50% + ${w/2 + 30}px)`;
    };
    
    if (imgEl.complete) {
        updatePosition();
    } else {
        imgEl.onload = updatePosition;
    }

    renderGuessWidgets(filename);
    renderHints(filename, 'identity', id_hints);
    renderHints(filename, 'fate', fate_hints);
    detActivate();   // 详情页键盘导航：从身份输入开始
    cursorRefresh(); // 光标图标随视图立即更新（如放大镜→箭头）
}

function renderGuessWidgets(filename) {
    const state = revealed_state[filename];
    
    // Identity Guess
    const lblId = document.getElementById('lbl-identity-guess');
    const btnIdCheck = document.getElementById('btn-check-identity');
    const idContainer = document.getElementById('identity-guess-container');
    
    lblId.className = 'guess-label' + (state.status === 'verified' ? ' verified' : '');
    // 容器同步标记已验证（CSS 用它排除点击反色）+ 清掉可能残留的高亮类
    idContainer.classList.remove('det-hover', 'hover-glow');
    idContainer.classList.toggle('verified', state.status === 'verified');
    
    // Remove old listeners
    const newLblId = lblId.cloneNode(true);
    lblId.parentNode.replaceChild(newLblId, lblId);
    
    if (state.guessed_id) {
        if (isUnknownId(state.guessed_id)) {
            // 不详项：分类显示笼统身份名；不详显示“不详”
            const u = getUnknownItem(state.guessed_id);
            newLblId.textContent = (u && u.cat)
                ? (I18N.t('ui.unknown.cat_' + u.cat) || I18N.t('ui.common.unknown') || '不详')
                : (I18N.t('ui.common.unknown') || '不详');
        } else {
            const crew = crew_list.find(c => c.id === state.guessed_id);
            if (crew) {
                const crewName = I18N.t('crew.name_' + crew.id) || crew.name;
                const crewRole = I18N.t('role.' + crew.role_id) || '';
                // 只有船长：身份在前（“船长罗伯特·威特瑞”）；其他保持“名字（身份）”
                if (crew.role_id === 1) {
                    newLblId.textContent = I18N.tpl('ui.common.role_name', { name: crewName, role: crewRole });
                } else {
                    newLblId.textContent = I18N.tpl('ui.common.name_role', { name: crewName, role: crewRole });
                }
            } else {
                newLblId.textContent = I18N.t('ui.common.unknown') || '不详';
            }
        }
    } else {
        newLblId.textContent = I18N.t('ui.common.unknown') || '不详';
    }

    if (state.status === 'verified') {
        btnIdCheck.classList.add('hidden');
    } else {
        btnIdCheck.classList.remove('hidden');
        // 不详项不允许查验
        btnIdCheck.disabled = !state.guessed_id || isUnknownId(state.guessed_id);
        newLblId.addEventListener('click', () => openCrewSelector('identity'));
    }

    // Fate Guess
    const lblFate1 = document.getElementById('lbl-fate-part1');
    const lblFate2 = document.getElementById('lbl-fate-part2');
    const btnFateCheck = document.getElementById('btn-check-fate');
    
    lblFate1.className = 'guess-label' + (state.fate_status === 'verified' ? ' verified' : '');
    lblFate2.className = 'guess-label' + (state.fate_status === 'verified' ? ' verified' : '');
    
    const newLblFate1 = lblFate1.cloneNode(true);
    lblFate1.parentNode.replaceChild(newLblFate1, lblFate1);
    const newLblFate2 = lblFate2.cloneNode(true);
    lblFate2.parentNode.replaceChild(newLblFate2, lblFate2);

    const guess = state.guessed_fate;
    let cause_id = guess.cause_id || 1;
    let c_obj = fates_structure.find(c => c.id === cause_id);
    
    let offender_needed = false;
    let weapon_ok = true;
    let offender_ok = true;

    if (c_obj) {
        if (c_obj.has_weapon && !guess.weapon) weapon_ok = false;
        if (c_obj.requires_offender) {
            offender_needed = true;
            if (!guess.offender_id) offender_ok = false;
            // 不详系列（-10~-16 模糊身份）不允许查验；敌人/野兽（-1/-2）是确定类别可查验
            else if (isUnknownId(guess.offender_id) && guess.offender_id !== -1 && guess.offender_id !== -2) offender_ok = false;
        }
    }
    
    let is_complete = cause_id !== 1 && weapon_ok && offender_ok;

    let part1Text = I18N.t('ui.common.no_fate') || '未记录下落';
    if (c_obj) {
        part1Text = I18N.t('fate.label_' + c_obj.id) || c_obj.label;
        if (c_obj.has_weapon && guess.weapon) {
            const wi = (c_obj.weapons || []).indexOf(guess.weapon);
            part1Text += (I18N.t('ui.common.comma') || '，')
                + (wi >= 0 ? (I18N.t(`fate.weapon_${c_obj.id}_${wi}`) || guess.weapon) : guess.weapon);
        }
        if (offender_needed) part1Text += I18N.t('ui.common.comma') || '，';
    }
    newLblFate1.textContent = part1Text;

    if (offender_needed) {
        newLblFate2.classList.remove('hidden');
        newLblFate2.textContent = getOffenderName(guess.offender_id);
    } else {
        newLblFate2.classList.add('hidden');
        newLblFate2.textContent = "";
    }

    if (state.fate_status === 'verified') {
        btnFateCheck.classList.add('hidden');
    } else {
        btnFateCheck.classList.remove('hidden');
        btnFateCheck.disabled = !is_complete;
        
        newLblFate1.addEventListener('click', () => openFateSelector());
        if (offender_needed) {
            newLblFate2.addEventListener('click', () => openCrewSelector('offender'));
        }
    }

    // 分段下落（可见标签>1）：容器加 segmented（无边框、各段均分填满）；否则去掉
    const fateContainer = document.getElementById('fate-guess-container');
    fateContainer.classList.toggle('segmented', fateContainer.querySelectorAll('.guess-label:not(.hidden)').length > 1);
    fateContainer.classList.remove('det-hover', 'hover-glow');        // 清残留高亮
    fateContainer.classList.toggle('verified', state.fate_status === 'verified');   // 同上：已验证则不做点击反色
}

function renderHints(filename, type, hints) {
    const state = revealed_state[filename];
    const count = state[type];
    
    let displayHtml = "";
    const base = filename.replace('.png', '');
    for (let i = 0; i < count; i++) {
        if (i < hints.length) {
            if (i > 0) displayHtml += "<br><br>";
            displayHtml += renderMixedText(I18N.t(`hints.${base}_${type}_${i}`) || hints[i]);
        }
    }
    
    document.getElementById(`${type}-text`).innerHTML = displayHtml;
    
    const btnReveal = document.getElementById(`btn-reveal-${type}`);
    const lblDone = document.getElementById(`lbl-${type}-done`);
    
    if (count >= hints.length) {
        btnReveal.classList.add('hidden');
        lblDone.classList.remove('hidden');
    } else {
        btnReveal.classList.remove('hidden');
        lblDone.classList.add('hidden');
    }
}

async function revealHint(filename, type) {
    revealed_state[filename][type]++;
    const faceData = faces_data[filename] || {};
    let hints = faceData[`${type}_hints`] || (faceData[type] ? [faceData[type]] : [type === 'identity' ? (I18N.t('ui.common.no_identity') || '未记录身份') : (I18N.t('ui.common.no_fate') || '未记录下落')]);
    
    // Auto lock checks
    if (type === 'identity' && revealed_state[filename][type] >= hints.length && revealed_state[filename].status !== "verified") {
        if (correct_map[filename]) {
            revealed_state[filename].guessed_id = correct_map[filename];
            revealed_state[filename].status = "verified";
            await Backend.saveState(revealed_state);
            openDetails(filename);
            return;
        }
    } else if (type === 'fate' && revealed_state[filename][type] >= hints.length && revealed_state[filename].fate_status !== "verified") {
        let correct_data = correct_fates[filename];
        if (correct_data) {
            if (Array.isArray(correct_data)) correct_data = correct_data[0];
            let cause_str = correct_data.cause;
            let c_obj = fates_structure.find(c => c.label === cause_str);
            if (c_obj) {
                revealed_state[filename].guessed_fate = {
                    cause_id: c_obj.id,
                    weapon: correct_data.weapon,
                    offender_id: correct_data.offender_id
                };
                revealed_state[filename].fate_status = "verified";
                await Backend.saveState(revealed_state);
                openDetails(filename);
                return;
            }
        }
    }
    
    await Backend.saveState(revealed_state);
    renderHints(filename, type, hints);
}

// Crew Selector
let crew_mode = "identity";
let crew_page = 0;
let sorted_crew = [];

function openCrewSelector(mode) {
    crew_mode = mode;
    document.getElementById('crew-selector').classList.remove('hidden');

    sorted_crew = [...crew_list].sort((a, b) => a.id - b.id);
    crew_page = 0;
    renderCrewPage();
    selActivate();
    cursorRefresh();
}

function changeCrewPage(delta) {
    const total = Math.ceil(getCrewSelectList().length / CREW_PER_PAGE);
    crew_page = (crew_page + delta + total) % total;
    renderCrewPage();
}

function renderCrewPage() {
    const list = getCrewSelectList();
    const total = Math.ceil(list.length / CREW_PER_PAGE);
    document.getElementById('crew-page-info').innerHTML = renderMixedText(`${crew_page + 1} / ${total}`);
    
    const container = document.getElementById('crew-list-container');
    container.innerHTML = '';
    
    const start = crew_page * CREW_PER_PAGE;
    const batch = list.slice(start, start + CREW_PER_PAGE);
    
    batch.forEach(item => {
        const row = document.createElement('div');
        row.className = 'crew-row';
        const id = item.id;
        
        let isSelected = false;
        if (crew_mode === 'identity' && id === revealed_state[current_detail_filename].guessed_id) isSelected = true;
        if (crew_mode === 'offender' && id === revealed_state[current_detail_filename].guessed_fate.offender_id) isSelected = true;
        
        if (isSelected) {
            row.classList.add('selected');
        }

        if (isUnknownId(id)) {
            // 不详项
            const u = getUnknownItem(id);
            const unknownName = I18N.t('ui.unknown.general') || '不详';
            if (u && u.cat) {
                // 不详的XX：编号/国籍空，姓名=不详，身份=笼统身份名
                row.classList.add('unknown-row');
                row.innerHTML = `
                    <div class="col-id"></div>
                    <div class="col-name">${renderMixedText(unknownName)}</div>
                    <div class="col-role">${renderMixedText(I18N.t('ui.unknown.cat_' + u.cat) || '')}</div>
                    <div class="col-origin"></div>
                `;
            } else {
                // 不详 / 敌人 / 野兽：整行居中
                let centerName = unknownName;
                if (id === -1) centerName = I18N.t('ui.common.enemy') || '敌人';
                else if (id === -2) centerName = I18N.t('ui.common.beast') || '野兽';
                row.classList.add('unknown-row', 'unknown-center');
                row.innerHTML = `<div class="col-name unknown-name">${renderMixedText(centerName)}</div>`;
            }
        } else {
            const c = item;
            const crewName = I18N.t('crew.name_' + c.id) || c.name;
            const crewRole = I18N.t('role.' + c.role_id) || '';
            const crewOrigin = I18N.t('origin.' + c.origin_id) || '';
            row.innerHTML = `
                <div class="col-id">${renderMixedText(c.id.toString())}</div>
                <div class="col-name">${renderMixedText(crewName)}</div>
                <div class="col-role">${renderMixedText(crewRole)}</div>
                <div class="col-origin">${renderMixedText(crewOrigin)}</div>
            `;
        }
        row.addEventListener('click', () => selectCrew(id));
        row.addEventListener('mouseenter', () => playSound('SelChange.wav'));
        container.appendChild(row);
    });
    selApply();
}

async function selectCrew(id) {
    if (crew_mode === 'identity') {
        revealed_state[current_detail_filename].guessed_id = id;
    } else {
        revealed_state[current_detail_filename].guessed_fate.offender_id = id;
    }
    await Backend.saveState(revealed_state);
    document.getElementById('crew-selector').classList.add('hidden');
    selDeactivate();
    openDetails(current_detail_filename);
    playScribbleSound();
}

// Fate Selector
let fate_page = 0;
let fate_weapon_mode = false;   // 是否处于武器二级页（此时隐藏翻页角标/页码）
let fate_weapon_obj = null;     // 当前武器二级页的死因对象（语言切换后重渲染用）

// 英文下落一级顺序（LangPack fate_sort 合并一级后的 id 顺序）
const FATE_SORT_EN = [1, 2, 15, 21, 8, 17, 24, 16, 19, 11, 22, 4, 20, 25, 6, 3, 9, 7, 18, 12, 23, 13, 10, 26, 5, 14];
// 英文二级选项顺序（fate_sort 映射到中文存储值；中文保持原顺序）
const FATE_WEAPONS_ORDER_EN = {
    2: ['非洲', '大西洋岛屿', '亚速尔群岛', '加那利群岛', '佛得角', '东印度群岛', '欧洲', '中东', '英国', '西印度群岛'],
    5: ['枪', '小刀', '绳索', '矛'],
    12: ['箭', '炮', '枪'],
    24: ['野兽', '火炮', '货物', '索具', '石头'],
    25: ['船上', '索具', '楼梯'],
    26: ['蹄子', '尾巴', '翅膀'],
};

function openFateSelector() {
    document.getElementById('fate-selector').classList.remove('hidden');
    document.getElementById('fate-selector-title').textContent = I18N.t('ui.fate_selector.title') || '选择死因';
    fate_page = 0;
    renderFatePage();
    selActivate();
    cursorRefresh();
}

function changeFatePage(delta) {
    const total = Math.ceil(fates_structure.length / 9);
    fate_page = (fate_page + delta + total) % total;
    renderFatePage();
}

function renderFatePage() {
    fate_weapon_mode = false;
    // 一级页无标题；武器页显示死因名
    document.getElementById('fate-selector-title').style.display = 'none';
    document.getElementById('fate-nav').classList.remove('hidden');
    document.getElementById('btn-fate-page-prev').style.display = 'block';
    document.getElementById('btn-fate-page-next').style.display = 'block';
    document.getElementById('fate-page-info').style.display = 'block';
    
    // 英文按 fate_sort 顺序；中文按数据原顺序
    let list = fates_structure;
    if (I18N.getLang() === 'en') {
        const byId = new Map(fates_structure.map(f => [f.id, f]));
        list = FATE_SORT_EN.map(id => byId.get(id)).filter(Boolean);
    }
    const total = Math.ceil(list.length / 9);
    document.getElementById('fate-page-info').innerHTML = renderMixedText(`${fate_page + 1} / ${total}`);
    
    const container = document.getElementById('fate-content-container');
    container.innerHTML = '';
    
    const start = fate_page * 9;
    const batch = list.slice(start, start + 9);
    
    batch.forEach(f => {
        const item = document.createElement('div');
        item.className = 'fate-item';
        item.textContent = I18N.t('fate.label_' + f.id) || f.label;
        
        if (f.has_weapon) {
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'submenu-arrow';
            item.appendChild(arrowSpan);
        }
        
        if (f.id === revealed_state[current_detail_filename].guessed_fate.cause_id) {
            item.classList.add('selected');
        }
        
        item.addEventListener('click', () => selectCause(f.id));
        item.addEventListener('mouseenter', () => playSound('SelChange.wav'));
        container.appendChild(item);
    });
    selApply();
}

function selectCause(id) {
    if (revealed_state[current_detail_filename].guessed_fate.cause_id !== id) {
        revealed_state[current_detail_filename].guessed_fate.weapon = null;
    }
    revealed_state[current_detail_filename].guessed_fate.cause_id = id;
    
    const c_obj = fates_structure.find(c => c.id === id);
    if (c_obj && c_obj.has_weapon) {
        playSound('PopupOpen.wav');
        renderWeaponPage(c_obj);
    } else {
        confirmFate();
    }
}

function renderWeaponPage(c_obj) {
    fate_weapon_mode = true;
    fate_weapon_obj = c_obj;
    document.getElementById('fate-selector-title').style.display = 'block';
    document.getElementById('fate-selector-title').textContent = I18N.t('fate.label_' + c_obj.id) || c_obj.label;
    
    // 武器二级页：隐藏翻页角标与页码
    document.getElementById('btn-fate-page-prev').style.display = 'none';
    document.getElementById('btn-fate-page-next').style.display = 'none';
    document.getElementById('fate-page-info').style.display = 'none';
    
    const container = document.getElementById('fate-content-container');
    container.innerHTML = '';
    
    // 英文按 fate_sort 二级顺序（映射中文存储值）；中文按原顺序；存储始终用中文值
    let order = c_obj.weapons;
    if (I18N.getLang() === 'en' && FATE_WEAPONS_ORDER_EN[c_obj.id]) {
        order = FATE_WEAPONS_ORDER_EN[c_obj.id];
    }
    order.forEach((zhW) => {
        const wi = c_obj.weapons.indexOf(zhW);
        const item = document.createElement('div');
        item.className = 'fate-item';
        let display = I18N.t(`fate.weapon_${c_obj.id}_${wi}`);
        if (!display && I18N.getLang() === 'en') display = c_obj.weapons_en[wi];
        if (!display) display = zhW;
        item.textContent = display;
        
        if (zhW === revealed_state[current_detail_filename].guessed_fate.weapon) {
            item.classList.add('selected');
        }
        
        item.addEventListener('click', () => {
            revealed_state[current_detail_filename].guessed_fate.weapon = zhW;
            confirmFate();
        });
        item.addEventListener('mouseenter', () => playSound('SelChange.wav'));
        container.appendChild(item);
    });
    selIdx = 0;   // 武器页：键盘从首项开始
    selApply();
}

async function confirmFate() {
    await Backend.saveState(revealed_state);
    document.getElementById('fate-selector').classList.add('hidden');
    selDeactivate();
    openDetails(current_detail_filename);
    playScribbleSound();
}

// Sound effects
// 浏览器自动播放策略处理（hover 不授予 user activation，无法用作解锁手势）:
//   - Eel 桌面模式（Edge/Chrome + no-user-gesture-required）：play() 立即成功 → 视为已解锁，hover 冷启动即有声音
//   - 受限浏览器（fallback 默认浏览器）：首次 play() 被挂起 → 后续请求丢弃（不堆积，避免解锁后一次性涌出），
//     首次用户手势（pointerdown/keydown/touchstart）时解锁。
let audioUnlocked = false;
let audioPending = false;   // 是否已有未决的播放尝试（受限环境防堆积）
let audioBlocked = false;   // 是否检测到浏览器阻止自动播放
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    audioPending = false;
    audioBlocked = false;
    // 在用户手势上下文中用一次几乎无声的播放触发浏览器解锁
    try {
        const a = new Audio('sound_effects/SelChange.wav');
        a.volume = 0.0001;
        a.play().catch(() => {});
    } catch (e) {}
}
['pointerdown', 'keydown', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, unlockAudio, { capture: true })
);

const correctSounds = ['Correct1.wav', 'Correct2.wav', 'Correct3.wav'];
const incorrectSounds = ['BookHelp0.wav', 'BookHelp1.wav', 'BookHelp2.wav', 'BookHelp3.wav'];
const scribbleSounds = ['Scribble1.wav', 'Scribble2.wav', 'Scribble3.wav'];
const fateOpenSounds = ['FateOpen1.wav', 'FateOpen2.wav', 'FateOpen3.wav'];
const fateCloseSounds = ['FateClose1.wav', 'FateClose2.wav'];
const flipFastSounds = ['FlipFast1.wav', 'FlipFast2.wav', 'FlipFast3.wav', 'FlipFast4.wav', 'FlipFast5.wav'];

function playSound(filename) {
    // 受限且未解锁：丢弃（已有未决尝试或已被阻止），避免浏览器挂起队列堆积
    if (audioBlocked || (!audioUnlocked && audioPending)) return null;
    const a = new Audio(`sound_effects/${filename}`);
    if (!audioUnlocked) audioPending = true;   // 未解锁：标记已有未决尝试（受限环境只保留一个，防堆积）
    a.play().then(() => {
        audioUnlocked = true;      // 播放成功（如 Eel 禁用自动播放策略）→ 视为已解锁
        audioPending = false;
        audioBlocked = false;
    }).catch(() => {
        audioPending = false;      // 被浏览器阻止（受限环境）→ 后续丢弃，等待手势解锁
        audioBlocked = true;
    });
    return a;
}

function playCorrectSound() {
    const snd = correctSounds[Math.floor(Math.random() * correctSounds.length)];
    playSound(snd);
}

function getTwoRandomIncorrectSounds() {
    let shuffled = [...incorrectSounds].sort(() => 0.5 - Math.random());
    return [shuffled[0], shuffled[1]];
}

function playScribbleSound() {
    const snd = scribbleSounds[Math.floor(Math.random() * scribbleSounds.length)];
    playSound(snd);
}

function playFateOpenSound() {
    const snd = fateOpenSounds[Math.floor(Math.random() * fateOpenSounds.length)];
    playSound(snd);
}

function playFateCloseSound() {
    const snd = fateCloseSounds[Math.floor(Math.random() * fateCloseSounds.length)];
    playSound(snd);
}

function playFlipFastSound() {
    const snd = flipFastSounds[Math.floor(Math.random() * flipFastSounds.length)];
    playSound(snd);
}

// Checking animations
async function checkIdentity(filename) {
    const guess_id = revealed_state[filename].guessed_id;
    if (!guess_id) return;
    
    const wrapper = document.querySelector('.guess-widget-wrapper.left');
    
    if (guess_id === correct_map[filename]) {
        playCorrectSound();
        setTimeout(() => {
            wrapper.style.visibility = 'hidden';
            setTimeout(async () => {
                revealed_state[filename].status = "verified";
                const faceData = faces_data[filename] || {};
                let hints = faceData.identity_hints || (faceData.identity ? [faceData.identity] : [I18N.t('ui.common.no_identity') || '未记录身份']);
                revealed_state[filename].identity = hints.length;
                await Backend.saveState(revealed_state);
                await openDetails(filename);
                wrapper.style.visibility = 'visible';
            }, 600);
        }, 400);
    } else {
        const [snd1, snd2] = getTwoRandomIncorrectSounds();
        playSound(snd1);
        animateFailure('identity-guess-container', ['lbl-identity-guess'], () => {
            wrapper.style.visibility = 'hidden';
            setTimeout(async () => {
                revealed_state[filename].guessed_id = -10;   // 查验失败重置为“不详”
                await Backend.saveState(revealed_state);
                await openDetails(filename);
                wrapper.style.visibility = 'visible';
                playSound(snd2);
            }, 600);
        });
    }
}

async function checkFate(filename) {
    const guess = revealed_state[filename].guessed_fate;
    let correct_data = correct_fates[filename];
    if (!correct_data) return;
    
    const wrapper = document.querySelector('.guess-widget-wrapper.right');
    
    if (!Array.isArray(correct_data)) correct_data = [correct_data];
    
    const g_obj = fates_structure.find(c => c.id === guess.cause_id);
    const g_label = g_obj ? g_obj.label : "";
    
    let is_correct = false;
    for (let c of correct_data) {
        let match_cause = g_label === c.cause;
        let match_weapon = guess.weapon === c.weapon;
        let match_offender = true;
        if (g_obj && g_obj.requires_offender) {
            match_offender = guess.offender_id === c.offender_id;
        }
        if (match_cause && match_weapon && match_offender) {
            is_correct = true;
            break;
        }
    }
    
    if (is_correct) {
        playCorrectSound();
        setTimeout(() => {
            wrapper.style.visibility = 'hidden';
            setTimeout(async () => {
                revealed_state[filename].fate_status = "verified";
                const faceData = faces_data[filename] || {};
                let hints = faceData.fate_hints || (faceData.fate ? [faceData.fate] : [I18N.t('ui.common.no_fate') || '未记录下落']);
                revealed_state[filename].fate = hints.length;
                await Backend.saveState(revealed_state);
                await openDetails(filename);
                wrapper.style.visibility = 'visible';
            }, 600);
        }, 400);
    } else {
        const [snd1, snd2] = getTwoRandomIncorrectSounds();
        playSound(snd1);
        animateFailure('fate-guess-container', ['lbl-fate-part1', 'lbl-fate-part2'], () => {
            wrapper.style.visibility = 'hidden';
            setTimeout(async () => {
                revealed_state[filename].guessed_fate = { cause_id: 1, weapon: null, offender_id: -10 };   // 查验失败重置为不详+不详
                await Backend.saveState(revealed_state);
                await openDetails(filename);
                wrapper.style.visibility = 'visible';
                playSound(snd2);
            }, 600);
        });
    }
}

function animateFailure(containerId, textIds, callback) {
    const containerEl = document.getElementById(containerId);
    if (containerEl) containerEl.classList.add('strike-through');
    
    setTimeout(() => {
        if (containerEl) containerEl.classList.remove('strike-through');
        callback();
    }, 1000);
}

// 提示内链接 hover：切换目标时播放 SelChange（事件委托，链接为动态生成）
let lastHintLinkHovered = null;
document.addEventListener('mouseover', (e) => {
    const link = e.target.closest('.hint-link');
    if (link && link !== lastHintLinkHovered) {
        lastHintLinkHovered = link;
        playSound('SelChange.wav');
    } else if (!link && lastHintLinkHovered) {
        lastHintLinkHovered = null;
    }
});

// 输入框 hover 高光 + SelChange 音效：单标签（身份）→ 整个容器高光；分段下落 → 该段各自高光
let lastGuessLabelHovered = null;
document.addEventListener('mouseover', (e) => {
    const lbl = e.target.closest && e.target.closest('.guess-label:not(.verified):not(:empty)');
    if (lbl) {
        if (lbl !== lastGuessLabelHovered) {
            lastGuessLabelHovered = lbl;
            playSound('SelChange.wav');
        }
        const c = lbl.closest('.guess-container');
        if (!c) return;
        if (c.querySelectorAll('.guess-label:not(.hidden)').length > 1) {
            lbl.classList.add('hover-glow-seg');       // 分段：各自高光
        } else {
            c.classList.add('hover-glow');            // 单标签：容器整体高光
        }
    }
});
document.addEventListener('mouseout', (e) => {
    const from = e.target.closest && e.target.closest('.guess-label');
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.guess-label') : null;
    if (from && from !== to) {
        if (from === lastGuessLabelHovered) lastGuessLabelHovered = null;
        from.classList.remove('hover-glow-seg');
        const c = from.closest('.guess-container');
        if (c) c.classList.remove('hover-glow');
    }
});

// Global click sound
document.addEventListener('click', (e) => {
    // 提示内链接：跳转到目标人脸详情页并播放 FateOpen（与草图点击详情一致）
    const hintLink = e.target.closest('.hint-link');
    if (hintLink && hintLink.dataset.face) {
        let face = hintLink.dataset.face.trim();
        if (face && !face.endsWith('.png')) face += '.png';
        playFateOpenSound();
        openDetails(face);
        return;
    }

    const el = e.target.closest('button, .grid-item, .guess-label, .crew-row, .sidebar-item, .fate-item');
    if (!el) return;
    
    // Skip check buttons
    if (el.classList.contains('check-btn')) return;
    
    // Skip verified answer labels（已正确查验的答案按钮，点击不播放音效）
    if (el.classList.contains('guess-label') && el.classList.contains('verified')) return;
    
    // Skip items that will trigger Scribble sound
    if (el.classList.contains('crew-row') || el.classList.contains('sidebar-item')) return;
    if (el.classList.contains('fate-item')) return;
    
    // Skip items that trigger FateOpen
    if (el.classList.contains('grid-item')) return;
    
    // Skip items that trigger FateClose or FlipFast
    if (el.id === 'btn-back' || el.id === 'btn-prev' || el.id === 'btn-next' || el.id === 'btn-crew-cancel' || el.id === 'btn-fate-cancel') return;

    // Skip page-turn corners（翻页角标不播放任何音效，包括全局 PopupOpen）
    if (el.classList.contains('page-turn')) return;

    // Skip format button（自身已播 FateOpen，避免双音效）
    if (el.id === 'btn-format') return;

    // Skip keybind 入口/取消（自身已播 FateOpen/FateClose，避免双音效）
    if (el.id === 'btn-keybind' || el.id === 'btn-keybind-cancel') return;
    // Skip info 入口/取消（自身已播 FateOpen/FateClose，避免双音效）
    if (el.id === 'btn-info' || el.id === 'btn-info-cancel') return;

    // Skip confirm buttons（是/否各自播放专属音效）
    if (el.id === 'btn-format-yes' || el.id === 'btn-format-no') return;

    playSound('PopupOpen.wav');
});

// Mouse wheel navigation
let scrollTimeout = null;

document.addEventListener('wheel', (e) => {
    // Throttle scroll events to prevent bugs with fast scrolling
    if (scrollTimeout) return;
    // Determine which view/modal is active
    const listView = document.getElementById('list-view');
    const crewSelector = document.getElementById('crew-selector');
    const fateSelector = document.getElementById('fate-selector');

    if (!fateSelector.classList.contains('hidden') && !document.getElementById('fate-nav').classList.contains('hidden')) {
        // Fate selector is active and not on weapon page
        if (e.deltaY > 0) {
            changeFatePage(1);
        } else if (e.deltaY < 0) {
            changeFatePage(-1);
        }
        scrollTimeout = setTimeout(() => { scrollTimeout = null; }, 100);
    } else if (!crewSelector.classList.contains('hidden')) {
        // Crew selector is active
        if (e.deltaY > 0) {
            changeCrewPage(1);
        } else if (e.deltaY < 0) {
            changeCrewPage(-1);
        }
        scrollTimeout = setTimeout(() => { scrollTimeout = null; }, 100);
    } else if (listView.classList.contains('active')) {
        // FolioSketch 视图：滚轮垂直滚动素描（不做翻页），速度放缓
        e.preventDefault();
        const scroll = document.getElementById('sketch-scroll');
        if (scroll) scroll.scrollTop += e.deltaY * 0.5;
    }
}, { passive: false });

// ===== 选择器键盘导航（身份/下落选择页）=====
// WS 上下选择（到本页首/末自动翻页继续），AD 左右翻页，Space 确认 = click；
// 选中项用 kb-hover 高亮（模拟 hover 效果），与鼠标操作共存。
let selActive = false;
let selIdx = 0;

function selCurrentItems() {
    if (!document.getElementById('crew-selector').classList.contains('hidden')) {
        return document.querySelectorAll('#crew-list-container .crew-row');
    }
    return document.querySelectorAll('#fate-content-container .fate-item');
}

function selApply() {
    const items = selCurrentItems();
    if (selIdx >= items.length) selIdx = Math.max(0, items.length - 1);
    if (selIdx < 0) selIdx = 0;
    document.querySelectorAll('.kb-hover').forEach(el => el.classList.remove('kb-hover'));
    if (selActive && items[selIdx]) items[selIdx].classList.add('kb-hover');
}

function selActivate() { selActive = true; selIdx = 0; selApply(); }

function selDeactivate() {
    selActive = false;
    document.querySelectorAll('.kb-hover').forEach(el => el.classList.remove('kb-hover'));
}

function selMove(delta) {
    const items = selCurrentItems();
    const count = items.length;
    if (count === 0) return;
    selActive = true;               // 鼠标让位后，键盘再次按下时重新接管并高亮
    playSound('SelChange.wav');     // 键盘 hover 移动也播放 SelChange
    selIdx += delta;
    const inCrew = !document.getElementById('crew-selector').classList.contains('hidden');
    const inFate = !document.getElementById('fate-selector').classList.contains('hidden');
    if (selIdx >= count) {
        // 页末 → 自动翻下一页（从首项继续）
        if (inCrew) { changeCrewPage(1); selIdx = 0; }
        else if (inFate && !fate_weapon_mode) { changeFatePage(1); selIdx = 0; }
        else { selIdx = count - 1; }   // 武器页无翻页：停在末项
    } else if (selIdx < 0) {
        // 页首 → 自动翻上一页（到末项；render 后 clamp）
        if (inCrew) { changeCrewPage(-1); selIdx = 9999; }
        else if (inFate && !fate_weapon_mode) { changeFatePage(-1); selIdx = 9999; }
        else { selIdx = 0; }
    }
    selApply();
}

function selClick() {
    const items = selCurrentItems();
    const el = items[selIdx];
    if (el) el.click();   // 触发原生 click（与鼠标点击完全一致）
}

// ===== 详情页键盘导航（WASD 切换按钮 / Space 确认）=====
// 节点：idInput 身份输入 / idReveal 身份提示 / idCheck 身份查验 /
//      fateInput1 下落输入1 / fateInput2 下落输入2(有凶手时) / fateReveal 下落提示 / fateCheck 下落查验
// 可逆边（反向键返回）：idInput<->idReveal(S/W) idInput<->fateInput1(D/A) idReveal<->fateReveal(D/A)
//   fateReveal<->fateInput1(W/S) idCheck<->idInput(D/A) fateInput1<->fateInput2(D/A, 无2则直连fateCheck)
//   fateInput2<->fateCheck(D/A, 无2则fateCheck-A->fateInput1)
// 不可逆边（单向）：fateInput2-S->fateReveal  idCheck-S->idReveal  fateCheck-S->fateReveal
let detActive = false;
let detNode = 'idInput';

function detEl(key) {
    const map = {
        idInput:    'lbl-identity-guess',
        idReveal:   'btn-reveal-identity',
        idCheck:    'btn-check-identity',
        fateInput1: 'lbl-fate-part1',
        fateInput2: 'lbl-fate-part2',
        fateReveal: 'btn-reveal-fate',
        fateCheck:  'btn-check-fate',
    };
    return document.getElementById(map[key]);
}
function detHas(key) {   // 可达：元素存在、可见、未禁用、未验证
    const el = detEl(key);
    if (!el || el.classList.contains('hidden')) return false;
    if (el.disabled) return false;                          // 禁用按钮（如未完成的查验）不可导航
    if (el.classList.contains('verified')) return false;    // 已查验输入框不可导航
    return true;
}

function detFirstReachable() {
    const order = ['idInput', 'idReveal', 'idCheck', 'fateInput1', 'fateInput2', 'fateReveal', 'fateCheck'];
    for (const k of order) if (detHas(k)) return k;
    return null;   // 无可达节点
}

function detApply() {
    document.querySelectorAll('.det-hover').forEach(el => el.classList.remove('det-hover'));
    if (!detActive) return;
    if (!detHas(detNode)) detNode = detFirstReachable();
    if (!detNode) return;   // 无可达节点：不高亮
    const el = detEl(detNode);
    if (!el) return;
    const c = el.closest('.guess-container');
    if (c && c.querySelectorAll('.guess-label:not(.hidden)').length > 1) {
        el.classList.add('det-hover');      // 分段下落：该段高光（同 hover-glow-seg）
    } else if (c) {
        c.classList.add('det-hover');       // 单标签输入框：容器整体高光（同 hover-glow）
    } else {
        el.classList.add('det-hover');      // nav-btn 等
    }
}

function detActivate() { detActive = true; detNode = detFirstReachable(); detApply(); }

function detDeactivate() {
    detActive = false;
    document.querySelectorAll('.det-hover').forEach(el => el.classList.remove('det-hover'));
}

function detMove(dir) {   // 'up'|'down'|'left'|'right'
    const hasFate2 = detHas('fateInput2');
    const hasFateCheck = detHas('fateCheck');
    const edges = {
        idInput:    { down: 'idReveal',   left: 'idCheck',   right: 'fateInput1' },
        idReveal:   { up: 'idInput',      right: 'fateReveal' },
        idCheck:    { down: 'idReveal',   right: 'idInput' },
        fateInput1: { down: 'fateReveal', left: 'idInput',   right: hasFate2 ? 'fateInput2' : (hasFateCheck ? 'fateCheck' : null) },
        fateInput2: { down: 'fateReveal', left: 'fateInput1', right: hasFateCheck ? 'fateCheck' : null },
        fateReveal: { up: 'fateInput1',   left: 'idReveal' },
        fateCheck:  { down: 'fateReveal', left: hasFate2 ? 'fateInput2' : 'fateInput1' },
    };
    const cand = edges[detNode] && edges[detNode][dir];
    const next = cand && detHas(cand) ? cand : null;   // 所有目标经可达性验证
    if (next) {
        detActive = true;              // 鼠标让位后，键盘再次按下重新接管并高亮
        detNode = next;
        detApply();
        playSound('SelChange.wav');    // 键盘切换也播放 SelChange
    }
}

function detClick() {
    const el = detEl(detNode);
    if (el && !el.classList.contains('hidden')) {
        // 与鼠标 :active 规则一致：单标签输入框 → 容器整体反色；分段 → 该段反色；按钮 → 自身
        const c = el.closest('.guess-container');
        const target = (c && c.querySelectorAll('.guess-label:not(.hidden)').length <= 1) ? c : el;
        target.classList.add('det-active');   // 模拟 :active 反色显示（合成 click 不触发 CSS :active）
        setTimeout(() => target.classList.remove('det-active'), 160);
        el.click();   // 与鼠标点击一致（打开选择器/查验/获取提示）
    }
}

// ===== 格式确认弹窗：打开 + 键盘导航（SW 切换 / Space 确定 / ESC 退出）=====
let formatSelAudio = null;   // 格式化按钮 hover 音效句柄（模块级）
let fmtSelActive = false;
let fmtSelIdx = 1;           // 默认“否”（安全：误按 Space 不格式化）——索引对应下方 [是, 否]

function fmtButtons() { return [document.getElementById('btn-format-yes'), document.getElementById('btn-format-no')]; }

function fmtApply() {
    const btns = fmtButtons();
    document.querySelectorAll('.fmt-hover').forEach(el => el.classList.remove('fmt-hover'));
    if (!fmtSelActive) return;
    if (btns[fmtSelIdx]) btns[fmtSelIdx].classList.add('fmt-hover');
}

function fmtSelActivate() { fmtSelActive = true; fmtSelIdx = 1; fmtApply(); }   // 默认“否”

function fmtSelDeactivate() {
    fmtSelActive = false;
    document.querySelectorAll('.fmt-hover').forEach(el => el.classList.remove('fmt-hover'));
}

function fmtMove(delta) {
    fmtSelActive = true;
    fmtSelIdx = (fmtSelIdx + delta + 2) % 2;   // “是/否”之间来回
    fmtApply();
    playSound('SelChange.wav');
}

function fmtClick() {
    const btns = fmtButtons();
    if (btns[fmtSelIdx]) btns[fmtSelIdx].click();   // 与鼠标点击一致
}

// F 键 / 鼠标点击共用：调出格式化确认窗口（停掉未播完的 SelChange 再播 FateOpen）
function openFormatConfirm() {
    if (formatSelAudio) { try { formatSelAudio.pause(); } catch (err) {} formatSelAudio = null; }
    playFateOpenSound();
    document.getElementById('format-confirm').classList.remove('hidden');
    fmtSelActivate();
    cursorRefresh();
}

// 视图/弹窗切换后刷新光标图标（无需移动鼠标立即变正确）
function cursorRefresh() { if (window.CursorAPI && window.CursorAPI.refresh) window.CursorAPI.refresh(); }

// ===== 按键绑定窗口 =====
// 额外快捷键（非 WASD 移动类）：默认 F/L/K/Esc，支持重绑并持久化
const DEFAULT_EXTRA = { format: 'KeyF', lang: 'KeyL', back: 'Escape', keybind: 'KeyK' };
function loadExtraBinds() {
    try {
        const s = JSON.parse(localStorage.getItem('obra_extra_binds'));
        if (s && typeof s === 'object') return { ...DEFAULT_EXTRA, ...s };   // 旧存档缺字段用默认合并
    } catch (e) {}
    return { ...DEFAULT_EXTRA };
}
const EXTRA_BINDS = loadExtraBinds();
function saveExtraBinds() { try { localStorage.setItem('obra_extra_binds', JSON.stringify(EXTRA_BINDS)); } catch (e) {} }
function saveKeymap() { try { localStorage.setItem('obra_keymap', JSON.stringify(KEYMAP)); } catch (e) {} }

// 功能列表：[i18n 键, 取当前按键的函数, 设置新按键的函数]
const KEYBIND_FUNCS = [
    ['ui.keybind.move_up',    () => KEYMAP.up,        (c) => { KEYMAP.up = c; saveKeymap(); }],
    ['ui.keybind.move_down',  () => KEYMAP.down,      (c) => { KEYMAP.down = c; saveKeymap(); }],
    ['ui.keybind.move_left',  () => KEYMAP.left,      (c) => { KEYMAP.left = c; saveKeymap(); }],
    ['ui.keybind.move_right', () => KEYMAP.right,     (c) => { KEYMAP.right = c; saveKeymap(); }],
    ['ui.keybind.action',     () => KEYMAP.action,    (c) => { KEYMAP.action = c; saveKeymap(); }],
    ['ui.keybind.format',     () => EXTRA_BINDS.format, (c) => { EXTRA_BINDS.format = c; saveExtraBinds(); }],
    ['ui.keybind.lang',       () => EXTRA_BINDS.lang,   (c) => { EXTRA_BINDS.lang = c; saveExtraBinds(); }],
    ['ui.keybind.back',       () => EXTRA_BINDS.back,   (c) => { EXTRA_BINDS.back = c; saveExtraBinds(); }],
    ['ui.keybind.keybind_btn', () => EXTRA_BINDS.keybind, (c) => { EXTRA_BINDS.keybind = c; saveExtraBinds(); }],
];

function keyDisplayName(code) {
    if (!code) return '?';
    if (code === 'Space') return 'Space';
    if (code === 'Escape') return 'Esc';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    return arrows[code] || code;
}

// 录制状态：点击某个绑定的按键 → 显示 ...（保持 click 反色），禁鼠标，提示按键；输入后恢复
let keybindRecording = false;
let keybindRecordIdx = -1;

function startKeybindRecord(row, idx) {
    keybindRecording = true;
    keybindRecordIdx = idx;
    const cap = row.querySelector('.key-cap');
    if (cap) { cap.textContent = '...'; cap.classList.add('recording'); }
    const st = document.getElementById('keybind-status');
    if (st) st.textContent = I18N.t('ui.keybind.listening') || '用键盘输入按键。';
}

function commitKeybind(code) {
    if (keybindConflictTimer) clearTimeout(keybindConflictTimer);
    if (keybindRecordIdx >= 0 && keybindRecordIdx < KEYBIND_FUNCS.length) {
        KEYBIND_FUNCS[keybindRecordIdx][2](code);
    }
    keybindRecording = false;
    keybindRecordIdx = -1;
    renderKeybindList();
    const st = document.getElementById('keybind-status');
    if (st) st.textContent = '';
}

// 冲突检测：新键已被其他功能占用（自己当前项除外）
function keybindIsTaken(code) {
    for (let i = 0; i < KEYBIND_FUNCS.length; i++) {
        if (i === keybindRecordIdx) continue;
        if (KEYBIND_FUNCS[i][1]() === code) return true;
    }
    return false;
}

// 冲突提示：显示“此按键已被占用。”2s，随后恢复“用键盘输入按键。”继续等待
let keybindConflictTimer = null;
function showKeybindConflict() {
    const st = document.getElementById('keybind-status');
    if (st) st.textContent = I18N.t('ui.keybind.conflict') || '此按键已被占用。';
    if (keybindConflictTimer) clearTimeout(keybindConflictTimer);
    keybindConflictTimer = setTimeout(() => {
        if (keybindRecording) {
            const s2 = document.getElementById('keybind-status');
            if (s2) s2.textContent = I18N.t('ui.keybind.listening') || '用键盘输入按键。';
        }
        keybindConflictTimer = null;
    }, 2000);
}

function renderKeybindList() {
    const list = document.getElementById('keybind-list');
    if (!list) return;
    list.innerHTML = '';
    KEYBIND_FUNCS.forEach(([i18nKey, getKey], fi) => {
        const row = document.createElement('div');
        row.className = 'keybind-row';
        const func = document.createElement('span');
        func.className = 'keybind-func';
        func.textContent = I18N.t(i18nKey) || i18nKey;
        const cap = document.createElement('span');
        cap.className = 'key-cap';
        cap.textContent = keyDisplayName(getKey());
        cap.style.cursor = 'pointer';
        cap.addEventListener('mouseenter', () => playSound('SelChange.wav'));
        cap.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!keybindRecording) {
                playSound('PopupOpen.wav');   // 点击键帽进入录制
                startKeybindRecord(row, fi);
            }
        });
        row.appendChild(func);
        row.appendChild(cap);
        list.appendChild(row);
    });

    // 第 10 项：恢复默认键位
    const resetRow = document.createElement('div');
    resetRow.className = 'keybind-row keybind-reset';
    const resetFunc = document.createElement('span');
    resetFunc.className = 'keybind-func';
    resetFunc.textContent = I18N.t('ui.keybind.reset') || '恢复默认键位';
    resetRow.appendChild(resetFunc);
    resetRow.addEventListener('mouseenter', () => playSound('SelChange.wav'));
    resetRow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (keybindRecording) return;
        playSound('PopupOpen.wav');
        resetKeybinds();
    });
    list.appendChild(resetRow);
}

// 恢复默认键位：WASD + Space + F/L/K/Esc，保存并重渲染
function resetKeybinds() {
    Object.assign(KEYMAP, DEFAULT_KEYMAP);
    saveKeymap();
    Object.assign(EXTRA_BINDS, DEFAULT_EXTRA);
    saveExtraBinds();
    renderKeybindList();
    const st = document.getElementById('keybind-status');
    if (st) st.textContent = '';
}

// ===== 关于面板（info）=====
const INFO_LINKS = {
    deepseek: 'https://platform.deepseek.com',
    bilibili: 'https://space.bilibili.com/435437445',
    xhs: 'https://www.xiaohongshu.com/user/profile/66174fb5000000000303367d',
    xhh: 'https://xiaoheihe.cn/app/user/profile/72607465',
    github: 'https://github.com/Yide-Zhang',
};

function infoLogoRow(links) {
    const row = document.createElement('div');
    row.className = 'info-logo-row';
    for (const [name, url] of links) {
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        a.className = 'info-logo';
        const img = document.createElement('img');
        img.src = name + '-normal-styled.png';
        img.alt = name;
        a.appendChild(img);
        a.addEventListener('mouseenter', () => { img.src = name + '-hover-styled.png'; playSound('SelChange.wav'); });
        a.addEventListener('mouseleave', () => { img.src = name + '-normal-styled.png'; });
        a.addEventListener('mousedown', () => { img.src = name + '-click-styled.png'; });
        a.addEventListener('mouseup', () => { img.src = name + '-hover-styled.png'; });
        a.addEventListener('click', () => playSound('PopupOpen.wav'));
        row.appendChild(a);
    }
    return row;
}

function renderInfoList() {
    const content = document.getElementById('info-content');
    if (!content) return;
    content.innerHTML = '';
    const para = (text) => { const p = document.createElement('p'); p.className = 'info-para'; p.textContent = text; content.appendChild(p); };
    para(I18N.t('ui.info.p1'));
    para(I18N.t('ui.info.p2'));
    para(I18N.t('ui.info.p3'));
    // p4 含翻译补丁链接
    const p4 = document.createElement('p');
    p4.className = 'info-para';
    const link = document.createElement('a');
    link.className = 'info-link';
    link.href = 'https://github.com/Yide-Zhang/obradinn_chinese_pack';
    link.target = '_blank'; link.rel = 'noopener';
    link.textContent = I18N.t('ui.info.p4_link');
    link.addEventListener('mouseenter', () => playSound('SelChange.wav'));
    link.addEventListener('click', () => playSound('PopupOpen.wav'));
    const p4Parts = (I18N.t('ui.info.p4') || '').split('{link}');
    p4.appendChild(document.createTextNode(p4Parts[0] || ''));
    p4.appendChild(link);
    p4.appendChild(document.createTextNode(p4Parts[1] || ''));
    content.appendChild(p4);

    para(I18N.t('ui.info.p5'));
    content.appendChild(infoLogoRow([['deepseek', INFO_LINKS.deepseek]]));
    para(I18N.t('ui.info.p6'));
    content.appendChild(infoLogoRow([
        ['bilibili', INFO_LINKS.bilibili],
        ['xhs', INFO_LINKS.xhs],
        ['xhh', INFO_LINKS.xhh],
        ['github', INFO_LINKS.github],
    ]));
}

function openInfoSelector() {
    renderInfoList();
    document.getElementById('info-selector').classList.remove('hidden');
    cursorRefresh();
}
function closeInfoSelector() {
    document.getElementById('info-selector').classList.add('hidden');
    cursorRefresh();
}

function openKeybindSelector() {
    if (keybindConflictTimer) clearTimeout(keybindConflictTimer);
    keybindRecording = false;
    keybindRecordIdx = -1;
    renderKeybindList();
    document.getElementById('keybind-selector').classList.remove('hidden');
    cursorRefresh();
}
function closeKeybindSelector() {
    if (keybindConflictTimer) clearTimeout(keybindConflictTimer);
    keybindRecording = false;
    keybindRecordIdx = -1;
    document.getElementById('keybind-selector').classList.add('hidden');
    cursorRefresh();
}

// 录制期间：capture 阶段优先捕获键盘（阻止其他监听器），禁鼠标点击；输入后恢复
// 修饰键/导航键不作为绑定目标
const KEYBIND_IGNORE = ['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight','CapsLock','NumLock','ScrollLock','Tab'];
document.addEventListener('keydown', (e) => {
    if (!keybindRecording) return;
    e.preventDefault();
    e.stopPropagation();
    if (KEYBIND_IGNORE.includes(e.code)) return;
    if (keybindIsTaken(e.code)) { showKeybindConflict(); return; }   // 已占用：提示 2s，不提交
    commitKeybind(e.code);
}, true);
document.addEventListener('click', (e) => {
    if (keybindRecording) { e.preventDefault(); e.stopPropagation(); }
}, true);

// ===== 键盘控制（主页面素描视图）=====
// 键位配置：默认 WASD + Space；支持 localStorage 'obra_keymap' 自定义（存 e.code，如 "KeyW"）
const DEFAULT_KEYMAP = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: 'Space' };
function loadKeymap() {
    try {
        const saved = JSON.parse(localStorage.getItem('obra_keymap'));
        if (saved && saved.up && saved.down && saved.left && saved.right && saved.action) return saved;
    } catch (e) {}
    return { ...DEFAULT_KEYMAP };
}
const KEYMAP = loadKeymap();

// 键盘直接控制系统鼠标光标（桌面版：Eel 后端 SetCursorPos）→ 与手动鼠标同一套光标，天然无缝。
// 网页版（无后端）回退为自定义光标（虚拟位置）。
const KB_SYSTEM = Backend.supportsKeyboard();
let kbX = 0, kbY = 0;            // 光标位置（client 坐标；mousemove 同步，键盘移动时保持期望值）
let lastMouseRawX = 0, lastMouseRawY = 0;   // 最近一次真实鼠标位置（原始值，不被 clamp 污染，用于校准）
let kbOffsetX = 0, kbOffsetY = 0;   // client→屏幕物理 偏移（键盘启动时校准一次；窗口位置恒定则 offset 恒定）
let kbOffsetReady = false;
const kbHeld = {};               // 当前按住的键码
const KB_SPEED = 300;            // 移动速度（px/秒，按时间计算）。减速后每帧位移小 → eel 延迟对应的滞后少 → 方向锁余波更小
const KB_MARGIN = 30;            // 运动框边距：光标被限制在「略小于窗口」的框内（上下左右各留 30px 缓冲）
// 运动框边界（动态读取可视窗口）
function kbBox() {
    return {
        top: KB_MARGIN,
        bottom: window.innerHeight - KB_MARGIN,
        left: KB_MARGIN,
        right: window.innerWidth - KB_MARGIN
    };
}

// 运动框可视化（红色框，调试观察 WASD 活动范围）
function kbUpdateBoxOverlay() {
    const el = document.getElementById('kb-box-overlay');
    if (!el) return;
    const b = kbBox();
    el.style.left = b.left + 'px';
    el.style.top = b.top + 'px';
    el.style.width = (b.right - b.left) + 'px';
    el.style.height = (b.bottom - b.top) + 'px';
    el.classList.remove('hidden');
}
kbUpdateBoxOverlay();
window.addEventListener('resize', () => { kbUpdateBoxOverlay(); if (KB_SYSTEM) kbCalibrate(); });   // 窗口尺寸变化 → 重新校准

// 测试光标（Cyan 圆）：跟随逻辑位置 kbX/kbY（不经 offset），CV 截图可直接定位验证瞬移
(function () {
    const tc = document.getElementById('test-cursor');
    if (!tc) return;
    tc.style.display = 'block';
    setInterval(() => {
        tc.style.left = kbX + 'px';
        tc.style.top = kbY + 'px';
    }, 50);
})();

// 深蓝圆 = 物理鼠标（系统光标真实位置）：轮询 get_cursor_pos → 换算 client 显示。
// 与 Cyan（逻辑位置）对比，可验证物理鼠标是否到达逻辑位置（offset/时序是否准确）
(function () {
    const rc = document.getElementById('real-cursor-dot');
    if (!rc || !KB_SYSTEM) return;
    rc.style.display = 'block';
    let calibrated = false;
    setInterval(async () => {
        try {
            if (!calibrated) { await kbCalibrate(); calibrated = true; }
            const pos = await Backend.getCursorPos();
            const dpr = window.devicePixelRatio || 1;
            rc.style.left = (pos[0] / dpr - kbOffsetX) + 'px';
            rc.style.top = (pos[1] / dpr - kbOffsetY) + 'px';
        } catch (e) {}
    }, 50);
})();

// 限制死：把光标坐标强制 clamp 到运动框内（WASD 移动、鼠标同步后都调用）
function kbClampToBox() {
    const b = kbBox();
    kbX = Math.max(b.left, Math.min(b.right, kbX));
    kbY = Math.max(b.top, Math.min(b.bottom, kbY));
}
let kbRaf = 0, kbLast = 0;       // rAF 句柄 / 上一帧时间戳
let kbSyncSuppressUntil = 0;     // 键盘停止后短暂抑制 mousemove 同步（防滞后位置写回 → 切换瞬移）
let kbLastSentX = -1, kbLastSentY = -1;   // 上次发送给 move_cursor_to 的目标（节流用）
// 之后绝对定位 move_cursor_to((期望+偏移)*dpr) → 光标精确等于期望位置（clamp 窗口内 → 绝不跑到屏幕边缘）
async function kbCalibrate() {
    if (!KB_SYSTEM) return;
    try {
        const pos = await Backend.getCursorPos();
        if (pos && pos.length === 2) {
            const dpr = window.devicePixelRatio || 1;
            // 用「原始鼠标位置」而非被 clamp 的 kbX/kbY 反推偏移（否则鼠标在框外时算出错误偏移 → 光标跑出框）
            kbOffsetX = pos[0] / dpr - lastMouseRawX;
            kbOffsetY = pos[1] / dpr - lastMouseRawY;
            kbOffsetReady = true;
        }
    } catch (e) {}
}

function kbActive() {
    // 仅主页面且无选择器/确认弹窗时生效
    if (!document.getElementById('list-view').classList.contains('active')) return false;
    if (!document.getElementById('crew-selector').classList.contains('hidden')) return false;
    if (!document.getElementById('fate-selector').classList.contains('hidden')) return false;
    if (!document.getElementById('keybind-selector').classList.contains('hidden')) return false;
    if (!document.getElementById('info-selector').classList.contains('hidden')) return false;
    if (!document.getElementById('format-confirm').classList.contains('hidden')) return false;
    return true;
}

// 边缘归零 + 滚动：光标被限制在「运动框」（略小于窗口）内，到框边缘且朝外 → 该方向位移归零（钉在框边），
// 页面滚动浏览；按相反方向（回内部）→ 位移恢复。框外留有缓冲带，即使系统光标有 eel 延迟/过冲也不会出窗。
function kbEdgeHandle(dx, dy, step) {
    const scroll = document.getElementById('sketch-scroll');
    const b = kbBox();
    if (kbY <= b.top && dy < 0) {        // 框顶部，朝上 → 归零 + 上滚
        dy = 0;
        scroll.scrollTop = Math.max(0, scroll.scrollTop - step);
    }
    if (kbY >= b.bottom && dy > 0) {     // 框底部，朝下 → 归零 + 下滚
        dy = 0;
        scroll.scrollTop = Math.min(scroll.scrollHeight - scroll.clientHeight, scroll.scrollTop + step);
    }
    if (kbX <= b.left && dx < 0) dx = 0; // 框左，朝左 → 归零
    if (kbX >= b.right && dx > 0) dx = 0;// 框右，朝右 → 归零
    return [dx, dy];
}

let kbLastDir = '';            // 上次移动方向（检测切换 → 强制刷新目标）

function kbSendCursor(force) {
    // 绝对定位系统光标；位移节流：目标变化超过阈值才发送，减少 websocket 往返（光标更跟手）
    if (!(KB_SYSTEM && window.eel && kbOffsetReady)) {
        if (window.CursorAPI) window.CursorAPI.setPos(kbX, kbY, 'mag');
        return;
    }
    const dpr = window.devicePixelRatio || 1;
    const tx = Math.round((kbX + kbOffsetX) * dpr);
    const ty = Math.round((kbY + kbOffsetY) * dpr);
    if (force || Math.abs(tx - kbLastSentX) + Math.abs(ty - kbLastSentY) >= 25) {
        kbLastSentX = tx; kbLastSentY = ty;
        Backend.moveCursor(tx, ty);
    }
}

function kbStep(ts) {
    const dt = kbLast ? Math.min(50, Math.max(0, ts - kbLast)) : 16;
    kbLast = ts;
    const step = KB_SPEED * dt / 1000;
    const k = KEYMAP;
    let dx = 0, dy = 0;
    if (kbHeld[k.up]) dy -= step;
    if (kbHeld[k.down]) dy += step;
    if (kbHeld[k.left]) dx -= step;
    if (kbHeld[k.right]) dx += step;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }   // 斜向归一化：W+D 同时按时速度不翻倍（1/√2）
    if (!dx && !dy) { kbRaf = 0; window.kbMoving = false; kbSyncSuppressUntil = performance.now() + 120; return; }   // 无按键：暂停循环，短暂抑制同步
    const [ex, ey] = kbEdgeHandle(dx, dy, step);   // 边缘归零：到窗口边缘朝外 → 位移 0
    const locked = (ex !== dx || ey !== dy);       // 本次是否触发方向锁
    // 方向切换检测：方向改变 → 强制发送最新目标（让新方向命令尽早执行，减少 eel 队列旧命令过冲 → 瞬移）
    const dir = (dx > 0 ? 'R' : dx < 0 ? 'L' : '') + (dy > 0 ? 'D' : dy < 0 ? 'U' : '');
    const dirChanged = dir !== kbLastDir;
    kbLastDir = dir;
    kbX += ex; kbY += ey;
    kbClampToBox();   // 限制死：坐标永远在运动框内
    window.kbMoving = true;   // 键盘移动中：custom_cursor 的 mousemove 抑制（避免闪烁）
    // 功能（hover/音效）用逻辑位置驱动：不依赖物理鼠标 eel 时序（否则会瞬移/过冲）
    const idx = hitTestSketch(kbX, kbY);
    lastHoverClientX = kbX;
    if (idx >= 0) {
        if (idx !== lastHoverIdx) { playSound('SelChange.wav'); lastHoverIdx = idx; }
        showPortrait(idx, kbX);
    } else {
        lastHoverIdx = -1;
        hidePortrait();
    }
    kbSendCursor(dirChanged || locked);   // 物理鼠标仅视觉跟随（best-effort）
    // 游戏光标平滑跟随逻辑位置（避免物理鼠标 eel 跳步导致的闪烁/频繁音效）
    if (window.CursorAPI) window.CursorAPI.setPos(kbX, kbY, 'mag');
    kbRaf = requestAnimationFrame(kbStep);
}

// Space：在光标处点击（进入详情，与鼠标点击一致）
function kbAction() {
    const idx = hitTestSketch(kbX, kbY);
    if (idx >= 0) {
        const a = annotations[idx];
        const faceFile = a.face_file || idToFace[a.id];
        if (faceFile) {
            playFateOpenSound();
            openDetails(faceFile);
        }
    }
}

document.addEventListener('keydown', (e) => {
    const k = KEYMAP;
    // 选择器打开 → 选择器键盘导航（WS 选择 / AD 翻页 / Space 确认）
    const inSel = !document.getElementById('crew-selector').classList.contains('hidden')
        || !document.getElementById('fate-selector').classList.contains('hidden');
    if (inSel) {
        if (e.code !== k.up && e.code !== k.down && e.code !== k.left && e.code !== k.right && e.code !== k.action) return;
        e.preventDefault();
        if (e.code === k.up || e.code === k.down) {
            selMove(e.code === k.down ? 1 : -1);
        } else if (e.code === k.left || e.code === k.right) {
            const delta = e.code === k.right ? 1 : -1;
            const inCrew = !document.getElementById('crew-selector').classList.contains('hidden');
            if (inCrew) { changeCrewPage(delta); playSound('SelChange.wav'); }
            else if (!fate_weapon_mode) { changeFatePage(delta); playSound('SelChange.wav'); }   // 武器页无翻页
        } else {
            selClick();
        }
        return;
    }
    // 详情页 → 详情页键盘导航（WASD 切换按钮 / Space 确认）
    if (document.getElementById('detail-view').classList.contains('active')) {
        if (e.code !== k.up && e.code !== k.down && e.code !== k.left && e.code !== k.right && e.code !== k.action) return;
        e.preventDefault();
        if (e.code === k.action) { detClick(); return; }
        detMove(e.code === k.up ? 'up' : e.code === k.down ? 'down' : e.code === k.left ? 'left' : 'right');
        return;
    }
    if (e.code !== k.up && e.code !== k.down && e.code !== k.left && e.code !== k.right && e.code !== k.action) return;
    if (!kbActive()) return;
    e.preventDefault();
    if (e.code === k.action) { kbAction(); return; }
    kbHeld[e.code] = true;
    if (!kbRaf) {
        kbLast = 0;
        // 键盘接管：光标立即限制在运动框内（略小于窗口，四边 30px 缓冲）
        const b = kbBox();
        kbX = Math.max(b.left, Math.min(b.right, kbX));
        kbY = Math.max(b.top, Math.min(b.bottom, kbY));
        kbCalibrate(); kbStep();   // 校准偏移 + 启动移动循环
    }
});
// Esc 返回：所有界面逐层返回（格式化确认 → 选择器 → 详情页；主视图为顶层无可返回）
document.addEventListener('keydown', (e) => {
    if (e.code !== EXTRA_BINDS.back) return;
    // 1) 格式化确认弹窗 → 等同“否”（取消格式化）
    if (!document.getElementById('format-confirm').classList.contains('hidden')) {
        e.preventDefault();
        document.getElementById('btn-format-no').click();
        return;
    }
    // 2) 选择器 → 等同取消按钮（下落武器页时返回一级选项）
    if (!document.getElementById('crew-selector').classList.contains('hidden')) {
        e.preventDefault();
        document.getElementById('btn-crew-cancel').click();
        return;
    }
    if (!document.getElementById('fate-selector').classList.contains('hidden')) {
        e.preventDefault();
        document.getElementById('btn-fate-cancel').click();
        return;
    }
    // 2.5) 按键绑定窗口 → 关闭
    if (!document.getElementById('keybind-selector').classList.contains('hidden')) {
        e.preventDefault();
        document.getElementById('btn-keybind-cancel').click();
        return;
    }
    // 2.6) 关于面板 → 关闭
    if (!document.getElementById('info-selector').classList.contains('hidden')) {
        e.preventDefault();
        document.getElementById('btn-info-cancel').click();
        return;
    }
    // 3) 详情页 → 返回列表视图
    if (document.getElementById('detail-view').classList.contains('active')) {
        e.preventDefault();
        document.getElementById('btn-back').click();
        return;
    }
    // 4) 主视图（列表/素描）为顶层：无可返回，忽略
});
// 主页面快捷键：F 调出格式化窗口（弹窗内 SW 切换 / Space 确定 / ESC 退出）；L 语言切换
document.addEventListener('keydown', (e) => {
    // 格式弹窗打开：SW 在“是/否”间切换，Space 确定当前项（ESC 由上方处理）
    if (!document.getElementById('format-confirm').classList.contains('hidden')) {
        if (e.code === 'KeyS' || e.code === 'KeyW') {
            e.preventDefault();
            fmtMove(e.code === 'KeyS' ? 1 : -1);
        } else if (e.code === 'Space') {
            e.preventDefault();
            fmtClick();
        }
        return;   // 弹窗内其他键不响应
    }
    // 仅主视图顶层（无选择器 / 详情页 / 其他弹窗）响应 F / L
    const busy = !document.getElementById('crew-selector').classList.contains('hidden')
        || !document.getElementById('fate-selector').classList.contains('hidden')
        || !document.getElementById('keybind-selector').classList.contains('hidden')
        || !document.getElementById('info-selector').classList.contains('hidden')
        || document.getElementById('detail-view').classList.contains('active');
    if (!document.getElementById('list-view').classList.contains('active') || busy) return;
    if (e.code === EXTRA_BINDS.format) { e.preventDefault(); openFormatConfirm(); return; }
    if (e.code === EXTRA_BINDS.lang) {
        e.preventDefault();
        const langBtn = document.getElementById('btn-lang');
        if (langBtn) langBtn.click();
        return;
    }
    if (e.code === EXTRA_BINDS.keybind) { e.preventDefault(); openKeybindSelector(); return; }
});
document.addEventListener('keyup', (e) => { delete kbHeld[e.code]; });
// 光标位置同步：键盘移动循环运行时（rAF 活跃）保护期望位置，不被“程序移动系统光标”产生的滞后 mousemove 拉回
//（否则键盘移动会卡顿）；其余时间 mousemove 同步真实光标，且限制死在运动框内。
// 无模式、无接管、无抑制窗；两者同时操作出现的拉扯是预期表现。
document.addEventListener('mousemove', (e) => {
    lastMouseRawX = e.clientX; lastMouseRawY = e.clientY;   // 原始位置（总是更新，供校准）
    // 键盘停止后 120ms 内不同步（系统光标 eel 追赶中，滞后位置写回会导致切换 WASD 瞬移）
    if (!kbRaf && performance.now() >= kbSyncSuppressUntil) {
        kbX = e.clientX; kbY = e.clientY;
        kbClampToBox();   // 限制死：坐标始终在运动框内
    }
}, { passive: true });

// Start
init();

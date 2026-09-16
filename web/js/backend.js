// backend.js —— 桌面版平台适配层（Eel 后端）
// 与网页版 website/js/backend.js 接口完全一致，main.js 两版共用同一份。
// 平台差异全部收拢在本文件：数据加载、图片地址（base64）、存档（json 文件）、系统光标控制。
const Backend = (() => {
    // ---- 数据加载 ----
    // 返回 { faces_data, crew_list, correct_map, fates_structure, correct_fates, annotations, id_to_face, sketch_b64 }
    // onProgress：网页版按 7 个请求逐项回调；桌面版本地一次读完后补齐 7 个计数，让两边进度条节奏一致
    // sketch_b64 为 "data:image/png;base64,..."（网页版则是图片 URL），main.js 直接赋给 img.src，两版通用
    async function getInitData(onProgress) {
        const data = await eel.get_init_data()();
        if (onProgress) for (let i = 0; i < 7; i++) onProgress();
        return data;
    }

    // ---- 图片 ----
    // 桌面版：Eel 读 FacesHi 文件转 base64（faces 目录在 web/ 之外，不便于直接 URL 访问）
    async function getImageUrl(filename) {
        if (!filename) return '';
        try {
            return await eel.get_image_b64(filename)();
        } catch (e) {
            console.error('[Backend] 图片加载失败:', filename, e);
            return '';
        }
    }

    // ---- 存档（exe/脚本同目录的 hints_used.json）----
    async function loadState() {
        try {
            return await eel.get_hints_state()();
        } catch (e) {
            console.error('[Backend] 存档读取失败:', e);
            return {};
        }
    }

    async function saveState(state) {
        try {
            return await eel.save_hints_state(state)();
        } catch (e) {
            console.error('[Backend] 存档保存失败:', e);
            return false;
        }
    }

    async function resetState() {
        try {
            return await eel.reset_hints_state()();
        } catch (e) {
            console.error('[Backend] 存档重置失败:', e);
            return false;
        }
    }

    // ---- 系统光标控制（桌面版专属）----
    // 键盘 WASD 直接驱动系统鼠标光标（SetCursorPos / CGEvent）→ 与手动鼠标同一套光标，天然无缝。
    // 网页版无此能力（返回 false），main.js 会自动回退到页面内自定义光标。
    function supportsKeyboard() { return true; }

    // 读取系统光标屏幕坐标（物理像素），用于校准 client→屏幕 偏移
    async function getCursorPos() {
        try {
            return await eel.get_cursor_pos()();
        } catch (e) {
            return null;
        }
    }

    // 绝对移动系统光标到屏幕坐标（物理像素）
    async function moveCursor(x, y) {
        try {
            return await eel.move_cursor_to(x, y)();
        } catch (e) {
            return false;
        }
    }

    // ---- 资源预热 ----
    // 桌面版本地文件读取极快（且 getImageUrl 走 base64），无需预热与计数；保留空实现以对齐接口。
    function warmupCache() {}
    function warmupTaskCount() { return 0; }

    return {
        getInitData,
        getImageUrl,
        loadState,
        saveState,
        resetState,
        supportsKeyboard,
        getCursorPos,
        moveCursor,
        warmupCache,
        warmupTaskCount,
    };
})();

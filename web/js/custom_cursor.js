// ---- 自定义光标 ----
// 绕过 Edge/WebView 的 bug：CSS cursor 图片在页面底部区域（约视口下方 60px）
// 不渲染（fallback 成系统默认箭头）。改为隐藏系统光标，用一个跟随鼠标的
// fixed div（普通 DOM，任意位置正常渲染）显示箭头/放大镜。
(function () {
    const cursorEl = document.getElementById('custom-cursor');
    const magImg = document.getElementById('cc-magnifier');
    const arrImg = document.getElementById('cc-arrow');
    const xImg = document.getElementById('cc-x');
    const circleImg = document.getElementById('cc-circle');
    if (!cursorEl || !magImg || !arrImg || !xImg || !circleImg) return;

    // 整个页面隐藏系统光标（统一由自定义光标接管，避免画外区域出现系统光标与自定义光标重叠）
    const HIDE_SEL = 'body, body *';
    const s = document.createElement('style');
    s.textContent = HIDE_SEL + ' { cursor: none !important; }';
    document.head.appendChild(s);

    // 热点（图片像素坐标）：放大镜=镜片(16,17)；箭头=尖端(0,0)；X=中心(16,16)；圈=中心(16,16)
    const HOT = { mag: [16, 17], arrow: [0, 0], x: [16, 16], circle: [16, 16] };
    let mode = 'arrow';
    let shown = false;
    let px = 0, py = 0, raf = 0;

    function setMode(m) {
        if (m === mode) return;
        mode = m;
        magImg.classList.toggle('hidden', m !== 'mag');
        arrImg.classList.toggle('hidden', m !== 'arrow');
        xImg.classList.toggle('hidden', m !== 'x');
        circleImg.classList.toggle('hidden', m !== 'circle');
    }

    function place() {
        raf = 0;
        const hx = HOT[mode][0], hy = HOT[mode][1];
        cursorEl.style.transform = 'translate(' + (px - hx) + 'px,' + (py - hy) + 'px)';
    }

    // 根据目标元素决定光标图标：素描画布→放大镜；禁用查验→X；已验证标签→圈；否则箭头
    function computeMode(t) {
        const canvas = document.getElementById('sketch-canvas');
        let onCanvas = false;
        if (canvas && t) onCanvas = (t === canvas) || !!(canvas.contains && canvas.contains(t));
        let onDisabledCheck = false;
        if (t && t.closest) {
            const btn = t.closest('.check-btn');
            onDisabledCheck = !!(btn && btn.disabled);
        }
        let onVerified = false;
        if (t && t.closest) onVerified = !!t.closest('.guess-label.verified');
        if (onCanvas) return 'mag';
        if (onDisabledCheck) return 'x';
        if (onVerified) return 'circle';
        return 'arrow';
    }

    document.addEventListener('mousemove', function (e) {
        // 键盘移动中：物理鼠标（系统光标被 eel 跳步移动）的 mousemove 不覆盖光标位置，
        // 由 main.js 的 CursorAPI.setPos（逻辑位置）统一驱动，避免两个位置打架闪烁。
        if (window.kbMoving) return;
        px = e.clientX;
        py = e.clientY;
        setMode(computeMode(e.target));
        if (!shown) { cursorEl.style.display = 'block'; shown = true; }
        if (!raf) raf = requestAnimationFrame(place);
    });

    document.addEventListener('mouseleave', function () {
        if (shown) { cursorEl.style.display = 'none'; shown = false; }
    });

    // 供键盘控制（WASD）复用：设置光标位置/模式，与手动鼠标光标完全一致
    window.CursorAPI = {
        setPos: function (x, y, m) {
            px = x; py = y;
            if (m) setMode(m);
            if (!shown) { cursorEl.style.display = 'block'; shown = true; }
            if (!raf) raf = requestAnimationFrame(place);
        },
        // 视图/弹窗切换后按当前鼠标位置重算图标（elementFromPoint 命中当前可见元素）
        refresh: function () {
            const t = document.elementFromPoint(Math.round(px), Math.round(py));
            setMode(computeMode(t));
        },
        hide: function () {
            if (shown) { cursorEl.style.display = 'none'; shown = false; }
        }
    };
})();

// Global State
let faces_data = {};
let crew_list = [];
let correct_map = {};
let fates_structure = [];
let correct_fates = {};
let image_files = [];
let revealed_state = {};

// Pagination State
let current_page = 0;
const images_per_page = 10; // 2x5
let total_pages = 1;

let current_detail_filename = "";

// Initialize App
async function init() {
    const data = await eel.get_init_data()();
    faces_data = data.faces_data;
    crew_list = data.crew_list;
    correct_map = data.correct_map;
    fates_structure = data.fates_structure;
    correct_fates = data.correct_fates;

    image_files = await eel.get_image_list()();
    revealed_state = await eel.get_hints_state()();

    if (image_files.length > 0) {
        total_pages = Math.ceil(image_files.length / images_per_page);
        showPage(0);
    } else {
        document.getElementById('grid-container').innerHTML = "<span>没有找到图片</span>";
    }

    bindEvents();
}

function bindEvents() {
    document.getElementById('btn-format').addEventListener('click', async () => {
        if (confirm("确定要清空所有身份推测和提示进度吗？(此操作不可撤销)")) {
            await eel.reset_hints_state()();
            revealed_state = {};
            showPage(current_page);
            alert("所有进度已重置。");
        }
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
        playFlipFastSound();
        showPage((current_page - 1 + total_pages) % total_pages);
    });
    document.getElementById('btn-next').addEventListener('click', () => {
        playFlipFastSound();
        showPage((current_page + 1) % total_pages);
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        playFateCloseSound();
        document.getElementById('detail-view').classList.remove('active');
        document.getElementById('list-view').classList.add('active');
    });

    // Identity Check
    document.getElementById('btn-check-identity').addEventListener('click', () => {
        checkIdentity(current_detail_filename);
    });
    
    // Fate Check
    document.getElementById('btn-check-fate').addEventListener('click', () => {
        checkFate(current_detail_filename);
    });

    // Reveals
    document.getElementById('btn-reveal-identity').addEventListener('click', () => {
        revealHint(current_detail_filename, 'identity');
    });
    document.getElementById('btn-reveal-fate').addEventListener('click', () => {
        revealHint(current_detail_filename, 'fate');
    });

    // Selectors Nav
    document.getElementById('btn-crew-prev').addEventListener('click', () => changeCrewPage(-1));
    document.getElementById('btn-crew-next').addEventListener('click', () => changeCrewPage(1));
    document.getElementById('btn-crew-cancel').addEventListener('click', () => {
        playFateCloseSound();
        document.getElementById('crew-selector').classList.add('hidden');
    });

    document.getElementById('btn-fate-prev').addEventListener('click', () => changeFatePage(-1));
    document.getElementById('btn-fate-next').addEventListener('click', () => changeFatePage(1));
    document.getElementById('btn-fate-cancel').addEventListener('click', () => {
        playFateCloseSound();
        // If we are in weapon view (prev button is hidden), go back to cause view
        if (document.getElementById('btn-fate-prev').style.display === 'none') {
            renderFatePage();
        } else {
            document.getElementById('fate-selector').classList.add('hidden');
        }
    });
}

// Mixed Font rendering
function renderMixedText(text) {
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

// List View
async function showPage(pageIndex) {
    current_page = pageIndex;
    const start = pageIndex * images_per_page;
    const end = Math.min(start + images_per_page, image_files.length);
    const batch = image_files.slice(start, end);

    const container = document.getElementById('grid-container');
    container.innerHTML = '';

    for (const filename of batch) {
        const btn = document.createElement('button');
        btn.className = 'grid-item';
        
        const img = document.createElement('img');
        img.src = await eel.get_image_b64(filename)();
        
        btn.appendChild(img);
        btn.addEventListener('click', () => {
            playFateOpenSound();
            openDetails(filename);
        });
        container.appendChild(btn);
    }

    const pageInfo = document.getElementById('page-info');
    pageInfo.innerHTML = renderMixedText(`第 ${current_page + 1} 页 / 共 ${total_pages} 页`);
}

// Detail View
async function openDetails(filename) {
    current_detail_filename = filename;
    document.getElementById('list-view').classList.remove('active');
    document.getElementById('detail-view').classList.add('active');

    // Init state if missing
    if (!revealed_state[filename]) {
        revealed_state[filename] = { identity: 0, fate: 0, guessed_id: null, status: "pending", guessed_fate: { cause_id: null, weapon: null, offender_id: null }, fate_status: "pending" };
    }
    const state = revealed_state[filename];
    
    // Fallbacks for older structure
    if (!state.guessed_fate) state.guessed_fate = { cause_id: null, weapon: null, offender_id: null };
    if (!state.fate_status) state.fate_status = "pending";

    // Load Image
    const imgEl = document.getElementById('detail-image');
    imgEl.src = await eel.get_image_b64(filename)();

    // Auto verify logic check before render
    const faceData = faces_data[filename] || {};
    let id_hints = faceData.identity_hints || (faceData.identity ? [faceData.identity] : ["未记录身份"]);
    let fate_hints = faceData.fate_hints || (faceData.fate ? [faceData.fate] : ["未记录下落"]);

    if (state.identity >= id_hints.length && state.status !== "verified") {
        if (correct_map[filename]) {
            state.guessed_id = correct_map[filename];
            state.status = "verified";
            await eel.save_hints_state(revealed_state)();
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
}

function renderGuessWidgets(filename) {
    const state = revealed_state[filename];
    
    // Identity Guess
    const lblId = document.getElementById('lbl-identity-guess');
    const btnIdCheck = document.getElementById('btn-check-identity');
    const idContainer = document.getElementById('identity-guess-container');
    
    lblId.className = 'guess-label' + (state.status === 'verified' ? ' verified' : '');
    
    // Remove old listeners
    const newLblId = lblId.cloneNode(true);
    lblId.parentNode.replaceChild(newLblId, lblId);
    
    if (state.guessed_id) {
        const crew = crew_list.find(c => c.id === state.guessed_id);
        newLblId.textContent = crew ? `${crew.name} (${crew.role})` : "不详";
    } else {
        newLblId.textContent = "不详";
    }

    if (state.status === 'verified') {
        btnIdCheck.classList.add('hidden');
    } else {
        btnIdCheck.classList.remove('hidden');
        btnIdCheck.disabled = !state.guessed_id;
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
        }
    }
    
    let is_complete = cause_id !== 1 && weapon_ok && offender_ok;

    let part1Text = "未记录下落";
    if (c_obj) {
        part1Text = c_obj.label;
        if (c_obj.has_weapon && guess.weapon) part1Text += `，${guess.weapon}`;
        if (offender_needed) part1Text += "，";
    }
    newLblFate1.textContent = part1Text;

    if (offender_needed) {
        newLblFate2.classList.remove('hidden');
        let offName = "不详";
        if (guess.offender_id === -1) offName = "敌人";
        else if (guess.offender_id === -2) offName = "野兽";
        else if (guess.offender_id) {
            const c = crew_list.find(c => c.id === guess.offender_id);
            if (c) offName = c.name;
        }
        newLblFate2.textContent = offName;
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
}

function renderHints(filename, type, hints) {
    const state = revealed_state[filename];
    const count = state[type];
    
    let displayHtml = "";
    for (let i = 0; i < count; i++) {
        if (i < hints.length) {
            if (i > 0) displayHtml += "<br><br>";
            displayHtml += renderMixedText(hints[i]);
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
    let hints = faceData[`${type}_hints`] || (faceData[type] ? [faceData[type]] : [`未记录${type === 'identity'?'身份':'下落'}`]);
    
    // Auto lock checks
    if (type === 'identity' && revealed_state[filename][type] >= hints.length && revealed_state[filename].status !== "verified") {
        if (correct_map[filename]) {
            revealed_state[filename].guessed_id = correct_map[filename];
            revealed_state[filename].status = "verified";
            await eel.save_hints_state(revealed_state)();
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
                await eel.save_hints_state(revealed_state)();
                openDetails(filename);
                return;
            }
        }
    }
    
    await eel.save_hints_state(revealed_state)();
    renderHints(filename, type, hints);
}

// Crew Selector
let crew_mode = "identity";
let crew_page = 0;
let sorted_crew = [];

function openCrewSelector(mode) {
    crew_mode = mode;
    document.getElementById('crew-selector').classList.remove('hidden');
    document.getElementById('crew-selector-title').textContent = mode === 'identity' ? "选择船员" : "选择凶手";
    
    const sidebar = document.getElementById('crew-sidebar');
    if (mode === 'offender') {
        sidebar.classList.remove('hidden');
        // bind special items
        document.querySelectorAll('.sidebar-item').forEach(item => {
            // Remove old listener
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
            
            const sid = parseInt(newItem.dataset.id);
            if (sid === revealed_state[current_detail_filename].guessed_fate.offender_id) {
                newItem.classList.add('selected');
            } else {
                newItem.classList.remove('selected');
            }
            
            newItem.addEventListener('click', () => selectCrew(sid));
            newItem.addEventListener('mouseenter', () => playSound('SelChange.wav'));
        });
    } else {
        sidebar.classList.add('hidden');
    }

    sorted_crew = [...crew_list].sort((a, b) => a.id - b.id);
    crew_page = 0;
    renderCrewPage();
}

function changeCrewPage(delta) {
    const total = Math.ceil(sorted_crew.length / 10);
    crew_page = (crew_page + delta + total) % total;
    renderCrewPage();
}

function renderCrewPage() {
    const total = Math.ceil(sorted_crew.length / 10);
    document.getElementById('crew-page-info').innerHTML = renderMixedText(`${crew_page + 1} / ${total}`);
    
    const container = document.getElementById('crew-list-container');
    container.innerHTML = '';
    
    const start = crew_page * 10;
    const batch = sorted_crew.slice(start, start + 10);
    
    batch.forEach(c => {
        const row = document.createElement('div');
        row.className = 'crew-row';
        
        let isSelected = false;
        if (crew_mode === 'identity' && c.id === revealed_state[current_detail_filename].guessed_id) isSelected = true;
        if (crew_mode === 'offender' && c.id === revealed_state[current_detail_filename].guessed_fate.offender_id) isSelected = true;
        
        if (isSelected) {
            row.classList.add('selected');
        }

        row.innerHTML = `
            <div class="col-id">${renderMixedText(c.id.toString())}</div>
            <div class="col-name">${renderMixedText(c.name)}</div>
            <div class="col-role">${renderMixedText(c.role)}</div>
            <div class="col-origin">${renderMixedText(c.origin)}</div>
        `;
        row.addEventListener('click', () => selectCrew(c.id));
        row.addEventListener('mouseenter', () => playSound('SelChange.wav'));
        container.appendChild(row);
    });
}

async function selectCrew(id) {
    if (crew_mode === 'identity') {
        revealed_state[current_detail_filename].guessed_id = id;
    } else {
        revealed_state[current_detail_filename].guessed_fate.offender_id = id;
    }
    await eel.save_hints_state(revealed_state)();
    document.getElementById('crew-selector').classList.add('hidden');
    openDetails(current_detail_filename);
    playScribbleSound();
}

// Fate Selector
let fate_page = 0;

function openFateSelector() {
    document.getElementById('fate-selector').classList.remove('hidden');
    document.getElementById('fate-selector-title').textContent = "选择死因";
    fate_page = 0;
    renderFatePage();
}

function changeFatePage(delta) {
    const total = Math.ceil(fates_structure.length / 9);
    fate_page = (fate_page + delta + total) % total;
    renderFatePage();
}

function renderFatePage() {
    document.getElementById('fate-nav').classList.remove('hidden');
    document.getElementById('btn-fate-prev').style.display = 'block';
    document.getElementById('btn-fate-next').style.display = 'block';
    document.getElementById('fate-page-info').style.display = 'block';
    
    const total = Math.ceil(fates_structure.length / 9);
    document.getElementById('fate-page-info').innerHTML = renderMixedText(`${fate_page + 1} / ${total}`);
    
    const container = document.getElementById('fate-content-container');
    container.innerHTML = '';
    
    const start = fate_page * 9;
    const batch = fates_structure.slice(start, start + 9);
    
    batch.forEach(f => {
        const item = document.createElement('div');
        item.className = 'fate-item';
        item.textContent = f.label;
        
        if (f.has_weapon) {
            const arrowSpan = document.createElement('span');
            arrowSpan.textContent = '▶';
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
    document.getElementById('fate-selector-title').textContent = c_obj.label;
    
    // Hide original fate nav/cancel and show weapon cancel only if we want?
    // Since we merged them into fate-nav, let's just keep the cancel button functional
    // by changing its behavior or just hiding prev/next
    document.getElementById('btn-fate-prev').style.display = 'none';
    document.getElementById('btn-fate-next').style.display = 'none';
    document.getElementById('fate-page-info').style.display = 'none';
    
    const container = document.getElementById('fate-content-container');
    container.innerHTML = '';
    
    c_obj.weapons.forEach(w => {
        const item = document.createElement('div');
        item.className = 'fate-item';
        item.textContent = w;
        
        if (w === revealed_state[current_detail_filename].guessed_fate.weapon) {
            item.classList.add('selected');
        }
        
        item.addEventListener('click', () => {
            revealed_state[current_detail_filename].guessed_fate.weapon = w;
            confirmFate();
        });
        item.addEventListener('mouseenter', () => playSound('SelChange.wav'));
        container.appendChild(item);
    });
}

async function confirmFate() {
    await eel.save_hints_state(revealed_state)();
    document.getElementById('fate-selector').classList.add('hidden');
    openDetails(current_detail_filename);
    playScribbleSound();
}

// Sound effects
const correctSounds = ['Correct1.wav', 'Correct2.wav', 'Correct3.wav'];
const incorrectSounds = ['BookHelp0.wav', 'BookHelp1.wav', 'BookHelp2.wav', 'BookHelp3.wav'];
const scribbleSounds = ['Scribble1.wav', 'Scribble2.wav', 'Scribble3.wav'];
const fateOpenSounds = ['FateOpen1.wav', 'FateOpen2.wav', 'FateOpen3.wav'];
const fateCloseSounds = ['FateClose1.wav', 'FateClose2.wav'];
const flipFastSounds = ['FlipFast1.wav', 'FlipFast2.wav', 'FlipFast3.wav', 'FlipFast4.wav', 'FlipFast5.wav'];

function playSound(filename) {
    new Audio(`sound_effects/${filename}`).play().catch(e => console.error("Sound play failed:", e));
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
                let hints = faceData.identity_hints || (faceData.identity ? [faceData.identity] : ["未记录身份"]);
                revealed_state[filename].identity = hints.length;
                await eel.save_hints_state(revealed_state)();
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
                revealed_state[filename].guessed_id = null;
                await eel.save_hints_state(revealed_state)();
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
                let hints = faceData.fate_hints || (faceData.fate ? [faceData.fate] : ["未记录下落"]);
                revealed_state[filename].fate = hints.length;
                await eel.save_hints_state(revealed_state)();
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
                revealed_state[filename].guessed_fate = { cause_id: null, weapon: null, offender_id: null };
                await eel.save_hints_state(revealed_state)();
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

// Global click sound
document.addEventListener('click', (e) => {
    const el = e.target.closest('button, .grid-item, .guess-label, .crew-row, .sidebar-item, .fate-item');
    if (!el) return;
    
    // Skip check buttons
    if (el.classList.contains('check-btn')) return;
    
    // Skip items that will trigger Scribble sound
    if (el.classList.contains('crew-row') || el.classList.contains('sidebar-item')) return;
    if (el.classList.contains('fate-item')) return;
    
    // Skip items that trigger FateOpen
    if (el.classList.contains('grid-item')) return;
    
    // Skip items that trigger FateClose or FlipFast
    if (el.id === 'btn-back' || el.id === 'btn-prev' || el.id === 'btn-next' || el.id === 'btn-crew-cancel' || el.id === 'btn-fate-cancel') return;
    
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
        // Main list view is active
        if (e.deltaY > 0) {
            playFlipFastSound();
            showPage((current_page + 1) % total_pages);
        } else if (e.deltaY < 0) {
            playFlipFastSound();
            showPage((current_page - 1 + total_pages) % total_pages);
        }
        scrollTimeout = setTimeout(() => { scrollTimeout = null; }, 200);
    }
});

// Start
init();

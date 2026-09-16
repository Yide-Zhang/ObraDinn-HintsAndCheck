import os
import sys

# PyInstaller Windows fix for gevent's fcntl check
if sys.platform == 'win32':
    # Do NOT force GEVENT_LOOP on Windows to libev, it breaks gevent 26+!
    import types
    if 'fcntl' not in sys.modules:
        sys.modules['fcntl'] = types.ModuleType('fcntl')
    import fcntl
    fcntl.F_GETFD = 1
    fcntl.F_SETFD = 2
    fcntl.FD_CLOEXEC = 1
    fcntl.fcntl = lambda fd, cmd, *args: 0

import json
import eel
import platform
import shutil

def get_app_path():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def get_state_dir():
    """用户数据目录：存档不随程序移动/更新而丢失，也避免写坏 macOS 包签名。"""
    if sys.platform == 'darwin':
        base = os.path.expanduser('~/Library/Application Support/ObraDinnHintsCheck')
    elif sys.platform == 'win32':
        base = os.path.join(os.environ.get('APPDATA') or os.path.expanduser('~'), 'ObraDinnHintsCheck')
    else:
        base = os.path.expanduser('~/.obradinn_hints_check')
    return base

def get_state_path():
    """存档路径（用户目录）。首次运行如发现旧位置（程序旁）有存档，自动迁移过来。"""
    state_dir = get_state_dir()
    new_path = os.path.join(state_dir, 'hints_used.json')
    old_path = os.path.join(get_app_path(), 'hints_used.json')
    try:
        os.makedirs(state_dir, exist_ok=True)
        if (not os.path.exists(new_path) and os.path.exists(old_path)
                and os.path.abspath(old_path) != os.path.abspath(new_path)):
            shutil.copy2(old_path, new_path)
            print("hints state migrated to user data dir")
    except Exception as e:
        print(f"state migration skipped: {e}")
    return new_path

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

# Initialize Eel
eel.init(resource_path('web'))

# Global data variables
faces_data = {}
crew_list = []
correct_map = {}
fates_structure = []
correct_fates = {}
annotations = []
id_to_face = {}
sketch_b64 = ""

def load_file_b64(filename):
    path = resource_path(filename)
    if os.path.exists(path):
        try:
            with open(path, 'rb') as f:
                return "data:image/png;base64," + base64.b64encode(f.read()).decode('utf-8')
        except Exception as e:
            print(f"Error loading {filename}: {e}")
    return ""

def load_data():
    global faces_data, crew_list, correct_map, fates_structure, correct_fates
    global annotations, id_to_face, sketch_b64

    def load_json(filename, default):
        path = resource_path(filename)
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading {filename}: {e}")
        return default

    faces_data = load_json("faces_data.json", {})
    crew_list = load_json("name_lists.json", [])
    correct_map = load_json("correct_name_list.json", {})
    fates_structure = load_json("fates_structure.json", [])
    correct_fates = load_json("correct_fates_list.json", {})

    # 素描人脸标注（点击命中用）
    ann_data = load_json("faces_annotations.json", None)
    if isinstance(ann_data, dict) and isinstance(ann_data.get("annotations"), list):
        annotations = ann_data["annotations"]
    elif isinstance(ann_data, list):
        annotations = ann_data
    else:
        annotations = []

    # id → face 文件反向映射（文件名编号是游戏编号，值才是船员 id）
    id_to_face = {}
    for face_file, cid in correct_map.items():
        if cid is not None:
            try:
                id_to_face[int(cid)] = face_file
            except (TypeError, ValueError):
                pass

    # 风格化素描（优先 obra 版，否则原图）
    sketch_b64 = load_file_b64("FolioSketch_obra.png") or load_file_b64("FolioSketch.png")

@eel.expose
def get_init_data():
    return {
        "faces_data": faces_data,
        "crew_list": crew_list,
        "correct_map": correct_map,
        "fates_structure": fates_structure,
        "correct_fates": correct_fates,
        "annotations": annotations,
        "id_to_face": id_to_face,
        "sketch_b64": sketch_b64
    }

@eel.expose
def get_image_list():
    image_dir = resource_path("FacesHi")
    if not os.path.exists(image_dir):
        return []
    try:
        files = sorted(
            [f for f in os.listdir(image_dir) if f.lower().startswith('face_') and f.lower().endswith(('.png', '.jpg', '.jpeg'))],
            key=lambda x: int(''.join(filter(str.isdigit, x)))
        )
        return files
    except Exception as e:
        print(f"Error loading files: {e}")
        return []

@eel.expose
def get_hints_state():
    state_file = get_state_path()
    if os.path.exists(state_file):
        try:
            with open(state_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            if not content:
                # 空文件：自动修复为合法空状态，避免反复报错
                with open(state_file, 'w', encoding='utf-8') as f:
                    json.dump({}, f, indent=4)
                return {}
            return json.loads(content)
        except Exception as e:
            print(f"Error loading hints state: {e}")
    return {}

@eel.expose
def save_hints_state(state):
    state_file = get_state_path()
    try:
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving hints state: {e}")
        return False

@eel.expose
def reset_hints_state():
    state_file = get_state_path()
    try:
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump({}, f, indent=4)
        return True
    except Exception:
        return False

# 键盘控制：相对移动系统鼠标光标（dx/dy 为屏幕物理像素增量）。
# 用相对移动而非绝对坐标：SetCursorPos 需要屏幕坐标，而 client↔屏幕映射依赖窗口偏移，
# 相对移动从 GetCursorPos 当前点叠加增量，不受窗口位置/DPR 缩放影响。
@eel.expose
def move_cursor_rel(dx, dy):
    try:
        if sys.platform == 'win32':
            import ctypes
            from ctypes import wintypes
            pt = wintypes.POINT()
            ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
            ctypes.windll.user32.SetCursorPos(pt.x + int(dx), pt.y + int(dy))
            return True
        elif sys.platform == 'darwin':
            import Quartz
            # pyobjc: CGEventRef 无 .location 属性，必须用 CGEventGetLocation 取坐标
            loc = Quartz.CGEventGetLocation(Quartz.CGEventCreate(None))
            ev = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved,
                                                (loc.x + dx, loc.y + dy), 0)
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
            return True
    except Exception as e:
        print(f"move_cursor_rel failed: {e}")
    return False

# 键盘控制：读取系统鼠标光标当前屏幕坐标（物理像素），用于校准 client→屏幕 偏移
@eel.expose
def get_cursor_pos():
    try:
        if sys.platform == 'win32':
            import ctypes
            from ctypes import wintypes
            pt = wintypes.POINT()
            ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
            return [pt.x, pt.y]
        elif sys.platform == 'darwin':
            import Quartz
            # pyobjc: 同上，用 CGEventGetLocation 取当前光标位置
            loc = Quartz.CGEventGetLocation(Quartz.CGEventCreate(None))
            return [loc.x, loc.y]
    except Exception as e:
        print(f"get_cursor_pos failed: {e}")
    return [0, 0]

# 键盘控制：绝对移动系统鼠标光标到屏幕坐标（物理像素）。
# 与 move_cursor_rel（相对）配合：先用 get_cursor_pos 校准偏移，再用绝对定位精确落点，
# 光标严格等于期望位置（clamp 在窗口内 → 到窗口边缘滚动，绝不到屏幕边缘）。
@eel.expose
def move_cursor_to(x, y):
    try:
        if sys.platform == 'win32':
            import ctypes
            ctypes.windll.user32.SetCursorPos(int(x), int(y))
            return True
        elif sys.platform == 'darwin':
            import Quartz
            ev = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (float(x), float(y)), 0)
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
            return True
    except Exception as e:
        print(f"move_cursor_to failed: {e}")
    return False

# For image serving, eel can serve local files if they are in the web folder.
# But FacesHi is outside web. We can use a custom route or copy/symlink them.
# The easiest way with Eel is to just use eel.init('web') and we can expose a route,
# OR we can just register the parent directory or read images as base64.
# Let's read images as base64 to avoid path traversal issues.
import base64
@eel.expose
def get_image_b64(filename):
    path = os.path.join(resource_path("FacesHi"), filename)
    if os.path.exists(path):
        with open(path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            return f"data:image/png;base64,{encoded_string}"
    return ""

def start_app():
    load_data()
    print("Data loaded, attempting to start UI...")
    import sys
    
    # 如果是 macOS，或者为了彻底避开寻找 Chrome 导致的卡死，
    # 我们直接使用 mode=None 启动服务器，然后用 python 自带的 webbrowser 打开默认浏览器（如 Safari）
    if sys.platform == 'darwin':
        print("macOS detected.")
        # 启动本地服务，不阻塞。必须指定端口，确保和打开的一致。
        eel.start('index.html', mode=None, host='localhost', port=8000, block=False)
        # 与 Windows 一致：优先用 Edge 应用窗口（无地址栏 + autoplay 参数）；无 Edge 时回退默认浏览器
        url = 'http://localhost:8000/index.html'
        edge = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        if os.path.exists(edge):
            import subprocess
            import tempfile
            print("Opening Microsoft Edge app window with autoplay allowed...")
            subprocess.Popen([
                edge,
                f'--app={url}',
                '--window-size=1600,900',
                '--autoplay-policy=no-user-gesture-required',
                '--user-data-dir=' + tempfile.mkdtemp(prefix='obra_dinn_'),
            ])
        else:
            import webbrowser
            webbrowser.open(url)
        
        # 【关键修复】必须使用 eel.sleep(1) 来挂起，不能用 time.sleep(1)，
        # 因为 time.sleep 会死锁主线程，导致 Eel 的 web 服务器无法响应请求！
        print("Server running. Press Ctrl+C to exit.")
        try:
            while True:
                eel.sleep(1.0)
        except KeyboardInterrupt:
            pass
    else:
        # Windows：Eel 只起服务器；用 subprocess 显式启动带 autoplay 参数的 Edge/Chrome 应用窗口。
        # 确保 --autoplay-policy=no-user-gesture-required 生效：冷启动 hover 即可播放音效，且无挂起队列。
        eel.start('index.html', mode=None, host='localhost', port=8000, block=False)
        import subprocess
        import tempfile
        url = 'http://localhost:8000/index.html'
        candidates = [
            r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        ]
        browser = next((p for p in candidates if os.path.exists(p)), None)
        if browser:
            print(f"Opening {os.path.basename(browser)} with autoplay allowed...")
            subprocess.Popen([
                browser,
                f'--app={url}',
                '--start-maximized',
                '--autoplay-policy=no-user-gesture-required',
                '--user-data-dir=' + tempfile.mkdtemp(prefix='obra_dinn_'),
            ])
        else:
            import webbrowser
            webbrowser.open(url)
        try:
            while True:
                eel.sleep(1.0)
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    start_app()

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

def get_app_path():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

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

def load_data():
    global faces_data, crew_list, correct_map, fates_structure, correct_fates
    
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

@eel.expose
def get_init_data():
    return {
        "faces_data": faces_data,
        "crew_list": crew_list,
        "correct_map": correct_map,
        "fates_structure": fates_structure,
        "correct_fates": correct_fates
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
    state_file = os.path.join(get_app_path(), "hints_used.json")
    if os.path.exists(state_file):
        try:
            with open(state_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading hints state: {e}")
    return {}

@eel.expose
def save_hints_state(state):
    state_file = os.path.join(get_app_path(), "hints_used.json")
    try:
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving hints state: {e}")
        return False

@eel.expose
def reset_hints_state():
    state_file = os.path.join(get_app_path(), "hints_used.json")
    try:
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump({}, f, indent=4)
        return True
    except Exception:
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
        print("macOS detected. Using default system browser...")
        import webbrowser
        # 启动本地服务，不阻塞。必须指定端口，确保和打开的一致。
        eel.start('index.html', mode=None, host='localhost', port=8000, block=False)
        # 用 Safari/默认浏览器 打开界面
        webbrowser.open('http://localhost:8000/index.html')
        
        # 【关键修复】必须使用 eel.sleep(1) 来挂起，不能用 time.sleep(1)，
        # 因为 time.sleep 会死锁主线程，导致 Eel 的 web 服务器无法响应请求！
        print("Server running. Press Ctrl+C to exit.")
        try:
            while True:
                eel.sleep(1.0)
        except KeyboardInterrupt:
            pass
    else:
        # Windows 的正常逻辑
        print("Trying Edge/Chrome mode...")
        try:
            # 也可以改为优先 edge: mode='edge'
            eel.start('index.html', size=(1024, 768), mode='edge', cmdline_args=['--start-maximized'])
        except Exception as e:
            try:
                eel.start('index.html', size=(1024, 768), mode='chrome', cmdline_args=['--start-maximized'])
            except Exception as e:
                import webbrowser
                eel.start('index.html', mode=None, host='localhost', port=8000, block=False)
                webbrowser.open('http://localhost:8000/index.html')
                while True:
                    eel.sleep(1.0)

if __name__ == '__main__':
    start_app()

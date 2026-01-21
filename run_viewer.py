import os
import sys
import math
import ctypes
import ctypes.util
import json
import platform
import tkinter as tk
from tkinter import font  # Explicitly import font submodule

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

def get_app_path():
    """Get the application path (stored next to exe or script)"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))
from tkinter import ttk, messagebox
from PIL import Image, ImageTk

def load_font_resource(font_path):
    """
    Loads a font file manually so Tkinter can use it.
    Supports Windows (GDI) and macOS (CoreText).
    """
    if not os.path.exists(font_path):
        print(f"Warning: Font file not found: {font_path}")
        return False
        
    system = platform.system()
    
    if system == "Darwin": # macOS
        try:
            # Load CoreText and CoreFoundation
            ct = ctypes.CDLL(ctypes.util.find_library("CoreText"))
            cf = ctypes.CDLL(ctypes.util.find_library("CoreFoundation"))
            
            # Create CFURL from file path
            cwd = os.getcwd()
            # Ensure absolute path
            abs_path = os.path.abspath(font_path)
            path_bytes = abs_path.encode('utf-8')
            
            # CFURLCreateFromFileSystemRepresentation(allocator, buffer, bufLen, isDirectory)
            # Return type is CFURLRef (pointer)
            cf.CFURLCreateFromFileSystemRepresentation.restype = ctypes.c_void_p
            cf.CFURLCreateFromFileSystemRepresentation.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_bool]
            
            font_url = cf.CFURLCreateFromFileSystemRepresentation(None, path_bytes, len(path_bytes), False)
            
            if not font_url:
                print(f"Failed to create CFURL for {font_path}")
                return False
            
            # CTFontManagerRegisterFontsForURL(fontURL, scope, error)
            # kCTFontManagerScopeProcess = 1
            ct.CTFontManagerRegisterFontsForURL.restype = ctypes.c_bool
            ct.CTFontManagerRegisterFontsForURL.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
            
            success = ct.CTFontManagerRegisterFontsForURL(font_url, 1, None)
            
            # Clean up
            cf.CFRelease.argtypes = [ctypes.c_void_p]
            cf.CFRelease(font_url)
            
            return success
        except Exception as e:
            print(f"MacOS font load error: {e}")
            return False

    elif system == "Windows":
        try:
            # FR_PRIVATE=0x10 means the font is local to this process
            FR_PRIVATE = 0x10
            path_buf = ctypes.create_unicode_buffer(font_path)
            
            if hasattr(ctypes, 'windll'):
                ctypes.windll.gdi32.RemoveFontResourceExW(path_buf, FR_PRIVATE, 0)
                num_fonts = ctypes.windll.gdi32.AddFontResourceExW(path_buf, FR_PRIVATE, 0)
                return num_fonts > 0
            return False
        except Exception as e:
            print(f"Windows font load error: {e}")
            return False
            
    return True # Other systems (Linux) need manual installation

class FacesGalleryApp:
    def __init__(self, root, image_dir):
        # Auto-detect fonts on Mac/Linux if exact names fail
        self.font_map = {
            "main": "Source Han Serif SC",
            "english": "IM FELL English",
            "hand": "851TegakiZatsu"
        }
        self.resolve_platform_fonts(root)
        
        self.root = root
        self.root.title("《奥伯拉丁的回归》身份与下落提示与查验程序")
        self.root.geometry("800x600")

        # Set Window Icon
        try:
            if platform.system() == "Windows":
                icon_path = resource_path("icon.ico")
                if os.path.exists(icon_path):
                    self.root.iconbitmap(icon_path)
            else:
                # Portable way for macOS/Linux using PNG
                icon_png = resource_path("icon.png")
                if os.path.exists(icon_png):
                    img = tk.PhotoImage(file=icon_png)
                    self.root.iconphoto(True, img)
        except Exception as e:
            print(f"Failed to set icon: {e}")

        # Maximize window
        try:
            if platform.system() == "Windows":
                self.root.state('zoomed')
            else:
                # macOS/Linux fallback to max available size
                w, h = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
                self.root.geometry(f"{w-50}x{h-100}+0+0")
        except:
            pass
        
        # Colors - Obra Dinn Style
        self.bg_color = "#333319"
        self.fg_color = "#E5FEFF"
        
        self.root.configure(bg=self.bg_color)
        
        self.image_dir = image_dir
        
        # Load Faces Data
        self.faces_data = {}
        data_path = resource_path("faces_data.json")
        if os.path.exists(data_path):
            try:
                with open(data_path, 'r', encoding='utf-8') as f:
                    self.faces_data = json.load(f)
            except Exception as e:
                print(f"Error loading faces_data.json: {e}")
                
        # Load new data lists
        self.crew_list = []
        crew_path = resource_path("name_lists.json")
        try:
            with open(crew_path, 'r', encoding='utf-8') as f:
                self.crew_list = json.load(f)
        except Exception as e:
            print(f"Error loading name_lists.json: {e}")

        self.correct_map = {}
        map_path = resource_path("correct_name_list.json")
        try:
            with open(map_path, 'r', encoding='utf-8') as f:
                self.correct_map = json.load(f)
        except Exception as e:
            print(f"Error loading correct_name_list.json: {e}")

        # Load Fate structures
        self.fates_structure = []
        fates_path = resource_path("fates_structure.json")
        try:
            with open(fates_path, 'r', encoding='utf-8') as f:
                self.fates_structure = json.load(f)
        except Exception as e:
            print(f"Error loading fates_structure.json: {e}")

        # Load Correct Fates
        self.correct_fates = {}
        cf_path = resource_path("correct_fates_list.json")
        try:
            with open(cf_path, 'r', encoding='utf-8') as f:
                self.correct_fates = json.load(f)
        except Exception as e:
            print(f"Error loading correct_fates_list.json: {e}")

        # State to track revealed hints: { "face_xx.png": { "identity": count, "fate": count, "guessed_id": int | None, "status": "verified" | "incorrect" } }
        self.state_file = os.path.join(get_app_path(), "hints_used.json")
        self.revealed_state = {}
        self.load_hints_state()
        
        # Load and sort image files numerically
        try:
            self.image_files = sorted(
                [f for f in os.listdir(image_dir) if f.lower().startswith('face_') and f.lower().endswith(('.png', '.jpg', '.jpeg'))],
                key=lambda x: int(''.join(filter(str.isdigit, x)))
            )
        except Exception as e:
            print(f"Error loading files: {e}")
            self.image_files = []

        # self._init_app_fonts() # Fonts are now loaded in main before Tk init

        self.total_images = len(self.image_files)
        # Config 2 rows x 5 columns
        self.rows_per_page = 2
        self.cols_per_row = 5
        self.images_per_page = self.rows_per_page * self.cols_per_row
        
        self.current_page = 0
        self.total_pages = math.ceil(self.total_images / self.images_per_page) if self.total_images > 0 else 1
        
        self.image_refs = [] # Keep references to avoid garbage collection
        
        # Main container for List View
        self.list_view_frame = tk.Frame(self.root, bg=self.bg_color)
        self.list_view_frame.pack(fill="both", expand=True)
        
        self._init_list_ui()
        self.show_page(0)

    # _init_app_fonts removed/deprecated as it's moved to global scope


    def load_hints_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    self.revealed_state = json.load(f)
            except Exception as e:
                print(f"Error loading hints state: {e}")
                self.revealed_state = {}

    def save_hints_state(self):
        try:
            with open(self.state_file, 'w', encoding='utf-8') as f:
                json.dump(self.revealed_state, f, indent=4)
        except Exception as e:
            print(f"Error saving hints state: {e}")

    def prompt_reset_data(self):
        """Show confirmation dialog to reset all data."""
        answer = messagebox.askyesno("确认格式化", "确定要清空所有身份推测和提示进度吗？(此操作不可撤销)")
        if answer:
            self.revealed_state = {}
            self.save_hints_state()
            # Reload current page to refresh UI
            self.show_page(self.current_page)
            messagebox.showinfo("已初始化", "所有进度已重置。")

    def resolve_platform_fonts(self, root):
        if platform.system() == "Windows": return
        
        # Fuzzy matching for fonts on macOS
        available = {f.lower(): f for f in tk.font.families(root=root)}
        
        # 1. Source Han Serif SC
        target = "Source Han Serif SC"
        if target.lower() not in available:
            # Try finding alternatives
            candidates = [f for f in available.keys() if "source" in f and "han" in f and "serif" in f]
            if candidates:
                # Pick shortest or best match (e.g. "Source Han Serif CN")
                best = candidates[0]
                if "cn" in best: best = best # Prefer CN
                self.font_map["main"] = available[best]
                print(f"Font Mapping: '{target}' not found, using '{available[best]}'")
            else:
                 # Fallback to standard
                 self.font_map["main"] = "Songti SC" # macOS standard Song font
                 print(f"Font Mapping: '{target}' not found, using 'Songti SC'")

        # 2. IM FELL English
        target = "IM FELL English"
        if target.lower() not in available:
            candidates = [f for f in available.keys() if "fell" in f and "english" in f]
            if candidates:
                self.font_map["english"] = available[candidates[0]]
                print(f"Font Mapping: '{target}' not found, using '{available[candidates[0]]}'")
            else:
                self.font_map["english"] = "Times New Roman"
                print(f"Font Mapping: '{target}' not found, using 'Times New Roman'")

    def get_font(self, font_key, size, styling=""):
        name = self.font_map.get(font_key, "Arial")
        if styling:
            return (name, size, styling)
        return (name, size)

    def create_hover_item(self, parent, text, font_spec, command_func, pady=5):
        """Cross-platform hoverable item with border"""
        # Outer Frame = Border
        # On hover, we change outer frame BG to fg_color
        # Default BG is bg_color (invisible border)
        
        container = tk.Frame(parent, bg=self.bg_color, padx=2, pady=2)
        container.pack(fill="x", pady=pady)
        
        # Inner content (Label)
        lbl = tk.Label(container, text=text, font=font_spec,
                       bg=self.bg_color, fg=self.fg_color, cursor="hand2")
        lbl.pack(fill="both", expand=True)
        
        def on_enter(e):
            if container.winfo_exists():
                container.config(bg=self.fg_color)
                
        def on_leave(e):
            if container.winfo_exists():
                container.config(bg=self.bg_color)
        
        # Bind to everything
        for w in [container, lbl]:
            w.bind("<Enter>", on_enter)
            w.bind("<Leave>", on_leave)
            w.bind("<Button-1>", lambda e: command_func())
            
        return container

    def _init_list_ui(self):
        # Configure Styles
        style = ttk.Style()
        style.theme_use('default')
        
        # Define a custom style for navigation buttons
        # Inverted colors: Light background, Dark text
        style.configure("Nav.TButton", 
                        font=self.get_font("main", 14), 
                        padding=10,
                        background=self.fg_color,     # Light BG
                        foreground=self.bg_color,     # Dark Text
                        fieldbackground=self.fg_color,
                        borderwidth=1,
                        bordercolor=self.bg_color, # Dark Border
                        relief="solid")
                        
        style.map("Nav.TButton",
                  background=[('active', self.fg_color)], # Keep light on hover
                  foreground=[('active', self.bg_color)], 
                  relief=[('pressed', 'sunken'), ('!pressed', 'solid')],
                  bordercolor=[('active', self.bg_color), ('!active', self.bg_color)])
        
        # Header Tools Frame
        tools_frame = tk.Frame(self.list_view_frame, bg=self.bg_color)
        tools_frame.pack(fill="x", side="top", padx=20, pady=(10, 0))
        
        # Reset/Format Button
        ttk.Button(tools_frame, text="格式化", style="Nav.TButton", 
                   command=self.prompt_reset_data).pack(side="right")

        # Content Frame (Grid)
        self.grid_frame = tk.Frame(self.list_view_frame, bg=self.bg_color)
        self.grid_frame.pack(expand=True, fill="both", padx=20, pady=20)
        
        # Navigation Frame - Increased bottom padding to move it up
        self.nav_frame = tk.Frame(self.list_view_frame, height=80, bg=self.bg_color)
        self.nav_frame.pack(fill="x", side="bottom", pady=(10, 40))
        
        # Using custom style Nav.TButton
        self.btn_prev = ttk.Button(self.nav_frame, text="<< 上一页", command=self.prev_page, style="Nav.TButton")
        self.btn_prev.pack(side="left", padx=20)
        
        # Page info Text widget for mixed fonts (to support English numbers with Chinese text)
        # Width increased to 40. Height set to 2 to prevent cutting off large fonts.
        self.txt_page_info = tk.Text(self.nav_frame, height=2, width=40, bd=0, highlightthickness=0, bg=self.bg_color, fg=self.fg_color)
            
        self.txt_page_info.pack(side="left", expand=True)
        
        # Configure fonts for page info
        # Numbers use IM FELL English, Text uses Source Han Serif SC
        font_en_nav = self.get_font("english", 18)
        font_cn_nav = self.get_font("main", 16)
        
        self.txt_page_info.tag_config("en", font=font_en_nav)
        self.txt_page_info.tag_config("cn", font=font_cn_nav)
        self.txt_page_info.tag_config("center", justify='center')
        
        # Using custom style Nav.TButton
        self.btn_next = ttk.Button(self.nav_frame, text="下一页 >>", command=self.next_page, style="Nav.TButton")
        self.btn_next.pack(side="right", padx=20)

    def show_page(self, page_index):
        if not self.image_files:
            tk.Label(self.grid_frame, text="FacesHi 目录下没有找到图片").pack()
            return
            
        # Clear existing widgets
        for widget in self.grid_frame.winfo_children():
            widget.destroy()
            
        self.image_refs = [] # Clear references
        self.current_page = page_index
        
        start_idx = page_index * self.images_per_page
        end_idx = min(start_idx + self.images_per_page, self.total_images)
        current_batch = self.image_files[start_idx:end_idx]
        
        # Configure grid weight
        for c in range(self.cols_per_row):
            self.grid_frame.columnconfigure(c, weight=1)
        for r in range(self.rows_per_page):
            self.grid_frame.rowconfigure(r, weight=1)

        for i, filename in enumerate(current_batch):
            row = i // self.cols_per_row
            col = i % self.cols_per_row
            
            file_path = os.path.join(self.image_dir, filename)
            
            # Container for each face - No Border, No extra decorations
            item_frame = tk.Frame(self.grid_frame, bd=0, bg=self.bg_color)
            item_frame.grid(row=row, column=col, padx=10, pady=10, sticky="nsew")
            
            try:
                pil_image = Image.open(file_path)
                # Resize for thumbnail - increased size (approx 2x)
                pil_image.thumbnail((240, 240))
                tk_image = ImageTk.PhotoImage(pil_image)
                self.image_refs.append(tk_image)
                
                # Image Button - No text label
                btn = tk.Button(item_frame, image=tk_image, command=lambda f=filename: self.open_details(f),
                                bg=self.bg_color, activebackground=self.bg_color, bd=0, relief="flat")
                btn.pack(expand=True)
                
            except Exception as e:
                print(f"Error loading {filename}: {e}")
                
        self.update_nav()

    def update_nav(self):
        text_str = f"第 {self.current_page + 1} 页 / 共 {self.total_pages} 页"
        
        self.txt_page_info.config(state="normal")
        self.txt_page_info.delete("1.0", "end")
        self.insert_mixed_text(self.txt_page_info, text_str)
        # Apply center alignment to all text
        self.txt_page_info.tag_add("center", "1.0", "end")
        
        # Remove empty newline at the end that Text widget adds automatically
        # This helps in centering vertically if needed, though simple here.
        # But crucially, disable it to prevent scrolling/editing
        self.txt_page_info.config(state="disabled")
        
        # Enable circular navigation
        self.btn_prev.state(['!disabled'])
        self.btn_next.state(['!disabled'])

    def next_page(self):
        new_page = (self.current_page + 1) % self.total_pages
        self.show_page(new_page)

    def prev_page(self):
        new_page = (self.current_page - 1 + self.total_pages) % self.total_pages
        self.show_page(new_page)

    def open_details(self, filename):
        # Hide List View
        self.list_view_frame.pack_forget()
        
        # Create Detail View Frame
        # Ensure we don't stack multiple detail frames if not cleaned up properly
        if hasattr(self, 'detail_frame') and self.detail_frame:
            self.detail_frame.destroy()
            
        self.detail_frame = tk.Frame(self.root, bg=self.bg_color)
        self.detail_frame.pack(fill="both", expand=True)
        
        path = os.path.join(self.image_dir, filename)
        
        try:
            # Top Bar: Back Button
            top_bar = tk.Frame(self.detail_frame, height=50, bg=self.bg_color)
            top_bar.pack(fill="x", padx=10, pady=10)
            
            # Use same Custom Style for Back button
            btn_back = ttk.Button(top_bar, text="<< 返回列表", command=self.back_to_list, style="Nav.TButton")
            btn_back.pack(side="left")

            # Top Container (Guess + Image)
            # Use Pack for Image to strictly center it, and Place for Guess Widget to hang off the left
            top_container = tk.Frame(self.detail_frame, bg=self.bg_color)
            top_container.pack(fill="x", padx=0, pady=10) # Full width to allow accurate centering

            # --- Image Processing ---
            pil_image = Image.open(path)
            # Resize for better view
            screen_height = self.root.winfo_screenheight()
            base_height = min(200, int(screen_height * 0.25))
            
            w_percent = (base_height / float(pil_image.size[1]))
            w_size = int((float(pil_image.size[0]) * float(w_percent)))
            pil_image = pil_image.resize((w_size, base_height), Image.Resampling.LANCZOS)
            
            tk_image = ImageTk.PhotoImage(pil_image)
            
            # --- Image Display (Center) ---
            lbl_img = tk.Label(top_container, image=tk_image, bg=self.bg_color)
            lbl_img.image = tk_image # Keep reference
            lbl_img.pack(side="top", anchor="center")
            
            # --- Guess Widget (Left of Image) ---
            guess_frame = tk.Frame(top_container, bg=self.bg_color)
            self.build_guess_widget(guess_frame, filename)
            
            # Position Calculation:
            padding = 30
            # Identity (Left)
            offset_x_left = -(w_size // 2 + padding)
            guess_frame.place(relx=0.5, rely=0.5, x=offset_x_left, y=0, anchor="e")
            
            # Fate Guess (Right of Image)
            fate_guess_frame = tk.Frame(top_container, bg=self.bg_color)
            self.build_fate_guess_widget(fate_guess_frame, filename)
            
            offset_x_right = (w_size // 2 + padding)
            fate_guess_frame.place(relx=0.5, rely=0.5, x=offset_x_right, y=0, anchor="w")

            
            # Fetch Data
            face_data = self.faces_data.get(filename, {})
            # Handle list based hints or fallback to string
            id_data = face_data.get("identity_hints", [])
            if not id_data and "identity" in face_data: # Fallback to old structure
                id_data = [face_data["identity"]]
            if not id_data: id_data = ["未记录身份"]
                
            fate_data = face_data.get("fate_hints", [])
            if not fate_data and "fate" in face_data: # Fallback
                fate_data = [face_data["fate"]]
            if not fate_data: fate_data = ["未记录下落"]

            # Initialize revealed state if not present
            if filename not in self.revealed_state:
                self.revealed_state[filename] = {"identity": 0, "fate": 0} 
            
            # Ensure keys exist for NEW state (guessed_id, status)
            if "guessed_id" not in self.revealed_state[filename]: self.revealed_state[filename]["guessed_id"] = None
            if "status" not in self.revealed_state[filename]: self.revealed_state[filename]["status"] = "pending"
            
            # Ensure Fate keys
            if "guessed_fate" not in self.revealed_state[filename]: 
                self.revealed_state[filename]["guessed_fate"] = { "cause_id": None, "weapon": None, "offender_id": None }
            if "fate_status" not in self.revealed_state[filename]: self.revealed_state[filename]["fate_status"] = "pending"
            
            # Check if all hints used -> Auto solve (as per prompt req?)
            # Prompt: "If user used all hints, also fixed on page".
            # Modified: "If all IDENTITY hints are revealed, auto lock identity"
            len_id = len(id_data)
            used_id = self.revealed_state[filename].get("identity", 0)
            
            if used_id >= len_id:
                 if self.revealed_state[filename]["status"] != "verified":
                     # Auto verify/fix
                     correct_id = self.correct_map.get(filename)
                     if correct_id:
                        self.revealed_state[filename]["guessed_id"] = correct_id
                        self.revealed_state[filename]["status"] = "verified"
                        self.save_hints_state()
            
            if "identity" not in self.revealed_state[filename]: self.revealed_state[filename]["identity"] = 0
            if "fate" not in self.revealed_state[filename]: self.revealed_state[filename]["fate"] = 0

            # Info Container
            info_container = tk.Frame(self.detail_frame, bg=self.bg_color)
            info_container.pack(fill="both", expand=True, padx=40, pady=10)
            
            # Fonts
            font_title = self.get_font("main", 24)
            font_en_content = self.get_font("english", 17)
            font_cn_content = self.get_font("main", 15)
            font_btn = self.get_font("main", 12)

            # --- Left Column: Identity ---
            left_frame = tk.Frame(info_container, bg=self.bg_color)
            left_frame.pack(side="left", fill="both", expand=True)
            
            lbl_id_title = tk.Label(left_frame, text="身份", font=font_title, bg=self.bg_color, fg=self.fg_color)
            lbl_id_title.pack(anchor="n", pady=(0, 20))

            txt_identity = tk.Text(left_frame, wrap="word", bd=0, bg=self.bg_color, fg=self.fg_color, highlightthickness=0, height=10)
            txt_identity.pack(fill="both", expand=True, padx=10)
            
            txt_identity.tag_config("en", font=font_en_content, justify='center')
            txt_identity.tag_config("cn", font=font_cn_content, justify='center')
            txt_identity.tag_config("center", justify='center')

            # --- Reveal Button for Identity ---
            btn_id_hint = ttk.Button(left_frame, text="获取新提示", style="Nav.TButton")
            btn_id_hint.pack(pady=10)
            
            lbl_id_done = tk.Label(left_frame, text="已显示所有提示", font=font_cn_content, bg=self.bg_color, fg=self.fg_color)
            
            self.update_hint_column(filename, "identity", id_data, txt_identity, btn_id_hint, lbl_id_done)
            
            # --- Separator ---
            separator = tk.Frame(info_container, width=2, bg=self.fg_color)
            separator.pack(side="left", fill="y", padx=20, pady=20)

            # --- Right Column: Fate ---
            right_frame = tk.Frame(info_container, bg=self.bg_color)
            right_frame.pack(side="right", fill="both", expand=True)

            lbl_fate_title = tk.Label(right_frame, text="下落", font=font_title, bg=self.bg_color, fg=self.fg_color)
            lbl_fate_title.pack(anchor="n", pady=(0, 20))

            txt_fate = tk.Text(right_frame, wrap="word", bd=0, bg=self.bg_color, fg=self.fg_color, highlightthickness=0, height=10)
            txt_fate.pack(fill="both", expand=True, padx=10)
            
            txt_fate.tag_config("en", font=font_en_content, justify='center')
            txt_fate.tag_config("cn", font=font_cn_content, justify='center')
            txt_fate.tag_config("center", justify='center')

            # --- Reveal Button for Fate ---
            btn_fate_hint = ttk.Button(right_frame, text="获取新提示", style="Nav.TButton")
            btn_fate_hint.pack(pady=10)
            
            lbl_fate_done = tk.Label(right_frame, text="已显示所有提示", font=font_cn_content, bg=self.bg_color, fg=self.fg_color)

            self.update_hint_column(filename, "fate", fate_data, txt_fate, btn_fate_hint, lbl_fate_done)
            
        except Exception as e:

            tk.Label(self.detail_frame, text=f"无法加载图像: {e}").pack()
            # Still show back button (redundant if top bar shows, but good for safety)
            if not 'top_bar' in locals():
                 ttk.Button(self.detail_frame, text="<< 返回列表", command=self.back_to_list).pack(pady=20)

    def back_to_list(self):
        # Destroy detail frame to free memory and state
        if hasattr(self, 'detail_frame'):
            self.detail_frame.destroy()
        # Show list view again
        self.list_view_frame.pack(fill="both", expand=True)
        
        # Force refresh/update on macOS to ensure redrawing
        if platform.system() != "Windows":
             self.root.update_idletasks()
             self.list_view_frame.update()
             # Re-show current page to ensure widgets are valid
             self.show_page(self.current_page)

    def update_hint_column(self, filename, hint_type, all_hints, txt_widget, btn_widget, lbl_done_widget):
        current_count = self.revealed_state[filename][hint_type]
        total_hints = len(all_hints)
        
        # Build text to display
        display_text = ""
        for i in range(current_count):
            if i < total_hints:
                if i > 0: display_text += "\n\n"
                display_text += all_hints[i]
        
        txt_widget.config(state="normal")
        txt_widget.delete("1.0", "end")
        self.insert_mixed_text(txt_widget, display_text)
        txt_widget.tag_add("center", "1.0", "end")
        txt_widget.config(state="disabled")
        
        # Configure button command
        btn_widget.configure(command=lambda: self.reveal_next_hint(filename, hint_type, all_hints, txt_widget, btn_widget, lbl_done_widget))

        # Check visibility
        if current_count >= total_hints:
            btn_widget.pack_forget()
            lbl_done_widget.pack(pady=10)
        else:
            lbl_done_widget.pack_forget()
            btn_widget.pack(pady=10)

    def reveal_next_hint(self, filename, hint_type, all_hints, txt_widget, btn_widget, lbl_done_widget):
        self.revealed_state[filename][hint_type] += 1
        
        # Check if this was the last IDENTITY or FATE hint
        if hint_type == "identity":
            used = self.revealed_state[filename][hint_type]
            total = len(all_hints)
            if used >= total and self.revealed_state[filename].get("status") != "verified":
                # Auto lock Identity
                correct_id = self.correct_map.get(filename)
                if correct_id:
                    self.revealed_state[filename]["guessed_id"] = correct_id
                    self.revealed_state[filename]["status"] = "verified"
                    self.save_hints_state()
                    self.open_details(filename) # Reloads page
                    return

        elif hint_type == "fate":
            used = self.revealed_state[filename][hint_type]
            total = len(all_hints)
            if used >= total and self.revealed_state[filename].get("fate_status") != "verified":
                # Auto lock Fate
                correct_data = self.correct_fates.get(filename)
                if correct_data:
                    # If multiple correct answers exist, pick the first one to auto-fill
                    if isinstance(correct_data, list):
                        correct_fate = correct_data[0]
                    else:
                        correct_fate = correct_data

                    # Map Cause String to ID
                    cause_str = correct_fate.get("cause")
                    cause_obj = next((c for c in self.fates_structure if c["label"] == cause_str), None)
                    cause_id = cause_obj["id"] if cause_obj else None
                    
                    if cause_id:
                        self.revealed_state[filename]["guessed_fate"] = {
                            "cause_id": cause_id,
                            "weapon": correct_fate.get("weapon"),
                            "offender_id": correct_fate.get("offender_id")
                        }
                        self.revealed_state[filename]["fate_status"] = "verified"
                        self.save_hints_state()
                        self.open_details(filename) # Reloads page
                        return

        self.save_hints_state()
        self.update_hint_column(filename, hint_type, all_hints, txt_widget, btn_widget, lbl_done_widget)

    def insert_mixed_text(self, text_widget, text_content):
        """Helper to insert text with mixed fonts for EN/CN"""
        buffer = ""
        is_en = True # assume start with en or empty
        
        for char in text_content:
            # Check if character is ASCII (English/Numbers/Symbols)
            # You can adjust this threshold or logic if needed
            char_is_en = ord(char) < 128
            
            if buffer and (char_is_en != is_en):
                # State changed, flush buffer
                tag = "en" if is_en else "cn"
                text_widget.insert("end", buffer, tag)
                buffer = char
                is_en = char_is_en
            else:
                if not buffer:
                    is_en = char_is_en
                buffer += char
                
        if buffer:
            tag = "en" if is_en else "cn"
            text_widget.insert("end", buffer, tag)

    def build_guess_widget(self, parent, filename):
        state = self.revealed_state.get(filename, {})
        guessed_id = state.get("guessed_id")
        status = state.get("status", "pending")
        
        # Display Text
        display_text = "不详"
        
        if guessed_id:
            # Find crew member
            crew = next((c for c in self.crew_list if c["id"] == guessed_id), None)
            if crew:
                display_text = f"{crew['name']} ({crew['role']})"
                
        # Font Logic: verified -> standard, unverified -> handwriting
        if status == "verified":
            font_label = ("Source Han Serif SC", 16)
        else:
            font_label = ("851tegakizatsu", 20)
        
        # Container with border
        border_color = "#AAAA88" 
        
        container = tk.Frame(parent, bg=self.bg_color, highlightbackground=border_color, highlightthickness=1)
        container.pack(side="left", ipadx=10, ipady=5)
        
        self.lbl_guess = tk.Label(container, text=display_text, font=font_label, bg=self.bg_color, fg=self.fg_color, cursor="hand2")
        self.lbl_guess.pack()
        
        if status != "verified":
             # Mode="identity" implied context logic in selector
             action = lambda e: self.open_crew_selector(filename, mode="identity")
             self.lbl_guess.bind("<Button-1>", action)
             container.bind("<Button-1>", action)
        
        # Check Button
        if status != "verified":
            self.btn_check = ttk.Button(parent, text="查验", style="Nav.TButton", 
                                        command=lambda: self.check_guess(filename))
            self.btn_check.pack(side="left", padx=10)

    def build_fate_guess_widget(self, parent, filename):
        state = self.revealed_state.get(filename, {})
        guess = state.get("guessed_fate", {})
        status = state.get("fate_status", "pending")
        
        # Determine completeness
        cause_id = guess.get("cause_id")
        if cause_id is None: cause_id = 1 # Default to Unknown

        c_obj = next((c for c in self.fates_structure if c["id"] == cause_id), None)
        
        offender_needed = False
        weapon_ok = True
        offender_ok = True
        
        if c_obj:
             if c_obj.get("has_weapon") and not guess.get("weapon"): weapon_ok = False
             if c_obj.get("requires_offender"):
                 offender_needed = True
                 if not guess.get("offender_id"): offender_ok = False
        
        is_complete = cause_id and weapon_ok and offender_ok
        
        # Determine if default "Unknown" (Id 1)
        # Assuming ID 1 is "Unknown"/"不详" based on request and structure
        if cause_id == 1:
             is_complete = False

        # Check Button - Only active if complete
        chk_state = "normal" if is_complete else "disabled"
        if status == "verified": chk_state = "disabled"
        
        if status != "verified":
             ttk.Button(parent, text="查验", style="Nav.TButton", 
                       command=lambda: self.check_fate(filename), state=chk_state).pack(side="left", padx=10)

        # Font Logic
        if status == "verified":
             font_label = ("Source Han Serif SC", 16)
        else:
             font_label = ("851tegakizatsu", 18)
             
        # Container
        border_color = "#AAAA88"
        container = tk.Frame(parent, bg=self.bg_color, highlightbackground=border_color, highlightthickness=1)
        container.pack(side="left", ipadx=10, ipady=5)
        
        # Part 1: Cause + [Weapon]
        part1_text = "未记录下落"
        if c_obj:
            part1_text = c_obj["label"]
            if c_obj.get("has_weapon") and guess.get("weapon"):
                part1_text += f"，{guess['weapon']}"
            if offender_needed:
                part1_text += "，" # Trailing comma implies more to come
        
        lbl_part1 = tk.Label(container, text=part1_text, font=font_label, bg=self.bg_color, fg=self.fg_color, cursor="hand2")
        lbl_part1.pack(side="left")
        self.lbl_fate = lbl_part1 # Assign for animation
        
        if status != "verified":
             lbl_part1.bind("<Button-1>", lambda e: self.open_fate_selector(filename))
        
        # Part 2: Offender (if needed)
        self.lbl_fate_off = None
        if offender_needed:
            off_id = guess.get("offender_id")
            off_name = "不详"
            if off_id:
                if off_id == -1: off_name = "敌人"
                elif off_id == -2: off_name = "野兽"
                else:
                    crew = next((c for c in self.crew_list if c["id"] == off_id), None)
                    if crew: off_name = crew["name"]
            
            lbl_off = tk.Label(container, text=off_name, font=font_label, bg=self.bg_color, fg=self.fg_color, cursor="hand2")
            lbl_off.pack(side="left")
            self.lbl_fate_off = lbl_off # Assign for animation
            
            if status != "verified":
                 lbl_off.bind("<Button-1>", lambda e: self.show_offender_selector(filename))

    def open_fate_selector(self, filename):
        self.fate_overlay = tk.Frame(self.detail_frame, bg=self.bg_color)
        self.fate_overlay.place(relx=0, rely=0, relwidth=1, relheight=1)
        
        self.lbl_fate_title = tk.Label(self.fate_overlay, text="选择死因", font=self.get_font("main", 20),
                 bg=self.bg_color, fg=self.fg_color)
        self.lbl_fate_title.pack(pady=20)
        
        self.content_frame = tk.Frame(self.fate_overlay, bg=self.bg_color)
        self.content_frame.pack(expand=True, fill="both", padx=40)
        
        # Add Navigation Frame for Fates (Hidden by default, shown in cause list)
        self.fate_nav_frame = tk.Frame(self.fate_overlay, bg=self.bg_color)
        self.fate_nav_frame.pack(side="bottom", pady=(0, 10))
        
        ttk.Button(self.fate_nav_frame, text="<<", style="Nav.TButton", 
                   command=lambda: self.change_cause_page(-1, filename)).pack(side="left", padx=20)
        
        self.lbl_cause_page = tk.Label(self.fate_nav_frame, text="", font=self.get_font("english", 16), bg=self.bg_color, fg=self.fg_color)
        self.lbl_cause_page.pack(side="left", padx=10)
        
        ttk.Button(self.fate_nav_frame, text=">>", style="Nav.TButton", 
                   command=lambda: self.change_cause_page(1, filename)).pack(side="right", padx=20)

        
        ttk.Button(self.fate_overlay, text="取消", style="Nav.TButton", 
                   command=self.fate_overlay.destroy).pack(side="bottom", pady=20)
        
        self.current_cause_page = 0
        self.show_cause_list_grid(filename)

    def change_cause_page(self, delta, filename):
        total_pages = math.ceil(len(self.fates_structure) / 9)
        self.current_cause_page = (self.current_cause_page + delta) % total_pages
        self.show_cause_list_grid(filename)

    def show_cause_list_grid(self, filename):
        for w in self.content_frame.winfo_children(): w.destroy()
        
        # Ensure Nav Frame is visible
        self.fate_nav_frame.pack(side="bottom", pady=(0, 10), before=self.fate_overlay.winfo_children()[-1])
        
        font_item = self.get_font("main", 16)
        
        items_per_page = 9
        total_pages = math.ceil(len(self.fates_structure) / items_per_page)
        self.lbl_cause_page.config(text=f"{self.current_cause_page + 1} / {total_pages}")

        start = self.current_cause_page * items_per_page
        end = min(start + items_per_page, len(self.fates_structure))
        
        # Container for vertical centering
        inner_container = tk.Frame(self.content_frame, bg=self.bg_color)
        inner_container.pack(expand=True, anchor="center")
        
        for i in range(start, end):
            c = self.fates_structure[i]
            # OLD LABEL CODE REPLACED WITH HELPER
            self.create_hover_item(inner_container, c["label"], font_item, 
                                   lambda cid=c["id"]: self.select_cause_logic(filename, cid))

    def show_weapon_list_grid(self, filename, cause_id):
        # Update Title using cause label
        c_obj = next((c for c in self.fates_structure if c["id"] == cause_id), None)
        if not c_obj: return
        self.lbl_fate_title.config(text=c_obj["label"])
        
        # Hide Nav Frame
        self.fate_nav_frame.pack_forget()
                
        for w in self.content_frame.winfo_children(): w.destroy()
        
        weapons = c_obj.get("weapons", [])
        font_item = self.get_font("main", 16)
        
        # Container for vertical centering
        inner_container = tk.Frame(self.content_frame, bg=self.bg_color)
        inner_container.pack(expand=True, anchor="center")
        
        for i, weapon in enumerate(weapons):
             # OLD LABEL CODE REPLACED WITH HELPER
             self.create_hover_item(inner_container, weapon, font_item,
                                    lambda wp=weapon: self.select_weapon_logic(filename, wp))

    def select_cause_logic(self, filename, cause_id):
        self.revealed_state[filename]["guessed_fate"]["cause_id"] = cause_id
        # Reset weapon if changed
        self.revealed_state[filename]["guessed_fate"]["weapon"] = None
        
        c_obj = next((c for c in self.fates_structure if c["id"] == cause_id), None)
        if c_obj and c_obj.get("has_weapon"):
            self.show_weapon_list_grid(filename, cause_id)
        else:
            self.confirm_fate_selection(filename)

    def select_weapon_logic(self, filename, weapon):
        self.revealed_state[filename]["guessed_fate"]["weapon"] = weapon
        self.confirm_fate_selection(filename)
    
    def confirm_fate_selection(self, filename):
        self.save_hints_state()
        self.fate_overlay.destroy()
        self.open_details(filename)
    
    # Removed outdated refresh_fate_ui, update_fate_display, show_fate_step, show_offender_step_button logic

    def show_offender_selector(self, filename):
        self.open_crew_selector(filename, mode="offender")

    def open_crew_selector(self, filename, mode="identity"):
        self.selector_frame = tk.Frame(self.detail_frame, bg=self.bg_color)
        self.selector_frame.place(relx=0, rely=0, relwidth=1, relheight=1)
        
        title_text = "选择船员" if mode == "identity" else "选择凶手"
        tk.Label(self.selector_frame, text=title_text, font=("Source Han Serif SC", 20), 
                 bg=self.bg_color, fg=self.fg_color).pack(pady=20)
        
        if not self.crew_list:
            tk.Label(self.selector_frame, text="无法加载船员名单", bg=self.bg_color, fg="red").pack()
            ttk.Button(self.selector_frame, text="关闭", command=self.selector_frame.destroy, style="Nav.TButton").pack(pady=20)
            return

        # Main Layout: Sidebar + Content
        main_layout = tk.Frame(self.selector_frame, bg=self.bg_color)
        main_layout.pack(expand=True, fill="both", padx=40)

        # Left Sidebar (For Offender options)
        if mode == "offender":
            side_frame = tk.Frame(main_layout, bg=self.bg_color)
            side_frame.pack(side="left", fill="y", padx=(0, 20), anchor="n")
            
            font_side = self.get_font("main", 16)
            tk.Label(side_frame, text="特殊", font=self.get_font("main", 14, "bold"), bg=self.bg_color, fg="#888866").pack(pady=(0,10), anchor="w")

            self.create_hover_item(side_frame, "敌人", font_side, lambda: self.select_crew(filename, -1, mode), pady=2)
            self.create_hover_item(side_frame, "野兽", font_side, lambda: self.select_crew(filename, -2, mode), pady=2)

        sorted_crew = sorted(self.crew_list, key=lambda x: x['id'])
        items_per_page = 10
        self.sel_total_pages = math.ceil(len(sorted_crew) / items_per_page)
        self.sel_current_page = 0
        
        # Grid content frame (centered within remaining space)
        self.sel_content_frame = tk.Frame(main_layout, bg=self.bg_color)
        self.sel_content_frame.pack(side="left", expand=True) # Removed fill="both" to keep it centered properly if that was desired, or kept pack default behavior

        
        nav_frame = tk.Frame(self.selector_frame, bg=self.bg_color)
        nav_frame.pack(fill="x", side="bottom", pady=20)
        
        ttk.Button(nav_frame, text="<<", style="Nav.TButton", 
                   command=lambda: self.change_sel_page(-1, sorted_crew, filename, mode)).pack(side="left", padx=40)
        
        self.lbl_sel_page = tk.Label(nav_frame, text="", font=("IM FELL English", 16), bg=self.bg_color, fg=self.fg_color)
        self.lbl_sel_page.pack(side="left", expand=True)
        
        ttk.Button(nav_frame, text=">>", style="Nav.TButton", 
                   command=lambda: self.change_sel_page(1, sorted_crew, filename, mode)).pack(side="right", padx=40)
                   
        ttk.Button(nav_frame, text="取消", style="Nav.TButton", command=self.selector_frame.destroy).pack(side="bottom", pady=10)

        self.show_sel_page(0, sorted_crew, filename, mode)

    def change_sel_page(self, delta, sorted_crew, filename, mode):
        new_page = (self.sel_current_page + delta) % self.sel_total_pages
        self.show_sel_page(new_page, sorted_crew, filename, mode)

    def show_sel_page(self, page_index, sorted_crew, filename, mode):
        self.sel_current_page = page_index
        for widget in self.sel_content_frame.winfo_children():
            widget.destroy()
            
        self.lbl_sel_page.config(text=f"{page_index + 1} / {self.sel_total_pages}")
        
        # Header Frame
        header_frame = tk.Frame(self.sel_content_frame, bg=self.bg_color)
        header_frame.pack(fill="x", pady=(0, 10))
        
        header_font = self.get_font("main", 16, "bold")
        headers = ["编号", "姓名", "身份", "籍贯"]
        col_widths = [8, 24, 15, 15]
        
        for i, h in enumerate(headers):
             tk.Label(header_frame, text=h, font=header_font, bg=self.bg_color, fg=self.fg_color, width=col_widths[i], anchor="w").grid(row=0, column=i, padx=5)
            
        start_idx = page_index * 10
        end_idx = min(start_idx + 10, len(sorted_crew))
        current_batch = sorted_crew[start_idx:end_idx]
        
        font_en = self.get_font("english", 16)
        
        def enter_row(e, f):
            if f.winfo_exists():
                f.config(bg=self.fg_color)
            
        def leave_row(e, f):
            if not f.winfo_exists(): return
            x, y = self.root.winfo_pointerxy()
            try:
                target = self.root.winfo_containing(x, y)
                if target:
                    # Check if target is the frame itself or a child of it
                    if target == f or str(target).startswith(str(f)):
                        return
            except: pass
            f.config(bg=self.bg_color)

        def click_row(e, cid):
             self.select_crew(filename, cid, mode)

        for crew in current_batch:
            # Row Container - Frame acts as border via Padding
            padding_frame = tk.Frame(self.sel_content_frame, bg=self.bg_color, padx=1, pady=1)
            padding_frame.pack(fill="x", pady=2)
            
            # Inner Row
            row_frame = tk.Frame(padding_frame, bg=self.bg_color, cursor="hand2")
            row_frame.pack(fill="both", expand=True)
            
            cols = [str(crew['id']), crew['name'], crew['role'], crew['origin']]
            labels = []
            for i, val in enumerate(cols):
                l = tk.Label(row_frame, text=val, font=font_en, bg=self.bg_color, fg=self.fg_color, width=col_widths[i], anchor="w", cursor="hand2")
                l.grid(row=0, column=i, padx=5)
                labels.append(l)
            
            # Bindings - Target the PADDING FRAME (Outer Border)
            padding_frame.bind("<Enter>", lambda e, f=padding_frame: enter_row(e, f))
            padding_frame.bind("<Leave>", lambda e, f=padding_frame: leave_row(e, f))
            padding_frame.bind("<Button-1>", lambda e, cid=crew['id']: click_row(e, cid))
            
            row_frame.bind("<Enter>", lambda e, f=padding_frame: enter_row(e, f))
            row_frame.bind("<Leave>", lambda e, f=padding_frame: leave_row(e, f))
            row_frame.bind("<Button-1>", lambda e, cid=crew['id']: click_row(e, cid))
            
            for l in labels:
                l.bind("<Enter>", lambda e, f=padding_frame: enter_row(e, f))
                l.bind("<Leave>", lambda e, f=padding_frame: leave_row(e, f))
                l.bind("<Button-1>", lambda e, cid=crew['id']: click_row(e, cid))

    def select_crew(self, filename, crew_id, mode):
        if mode == "identity":
            self.revealed_state[filename]["guessed_id"] = crew_id
            self.save_hints_state()
            self.selector_frame.destroy()
            self.open_details(filename)
        elif mode == "offender":
            self.revealed_state[filename]["guessed_fate"]["offender_id"] = crew_id
            self.save_hints_state()
            self.selector_frame.destroy()
            if hasattr(self, 'fate_overlay') and self.fate_overlay.winfo_exists():
                 self.update_fate_display(filename)
            else:
                 self.open_details(filename)

    def check_guess(self, filename):
        guess_id = self.revealed_state[filename]["guessed_id"]
        if not guess_id: return
        correct_id = self.correct_map.get(filename)
        if guess_id == correct_id:
            self.revealed_state[filename]["status"] = "verified"
            face_data = self.faces_data.get(filename, {})
            id_data = face_data.get("identity_hints", [])
            if not id_data and "identity" in face_data: id_data = [face_data["identity"]]
            if not id_data: id_data = ["未记录身份"]
            self.revealed_state[filename]["identity"] = len(id_data)
            self.save_hints_state()
            self.open_details(filename)
        else:
            self.animate_failure(filename, target="identity")

    def check_fate(self, filename):
        guess = self.revealed_state[filename].get("guessed_fate", {})
        correct_data = self.correct_fates.get(filename)
        if not correct_data: return

        # Support list of correct answers
        if isinstance(correct_data, list):
            possible_fates = correct_data
        else:
            possible_fates = [correct_data]

        g_id = guess.get("cause_id")
        g_obj = next((c for c in self.fates_structure if c["id"] == g_id), None)
        g_label = g_obj["label"] if g_obj else ""
        
        is_correct = False
        
        for correct in possible_fates:
            match_cause = (g_label == correct.get("cause"))
            match_weapon = (guess.get("weapon") == correct.get("weapon"))
            match_offender = True
            if g_obj and g_obj.get("requires_offender"):
                 match_offender = (guess.get("offender_id") == correct.get("offender_id"))
            
            if match_cause and match_weapon and match_offender:
                 is_correct = True
                 break

        if is_correct:
             self.revealed_state[filename]["fate_status"] = "verified"
             face_data = self.faces_data.get(filename, {})
             fate_data = face_data.get("fate_hints", [])
             if not fate_data and "fate" in face_data: fate_data = [face_data["fate"]]
             if not fate_data: fate_data = ["未记录下落"]
             self.revealed_state[filename]["fate"] = len(fate_data)
             self.save_hints_state()
             self.open_details(filename)
        else:
             self.animate_failure(filename, target="fate")

    def animate_failure(self, filename, target="identity"):
        # Gather widgets to animate
        widgets = []
        if target == "identity":
             if hasattr(self, 'lbl_guess'): widgets.append(self.lbl_guess)
        else:
             if hasattr(self, 'lbl_fate') and self.lbl_fate: widgets.append(self.lbl_fate)
             if hasattr(self, 'lbl_fate_off') and self.lbl_fate_off: widgets.append(self.lbl_fate_off)
        
        if not widgets: return

        lines = []
        for w in widgets:
            line = tk.Frame(w.master, bg=self.fg_color, height=2)
            line.place(in_=w, relx=0, rely=0.5, relwidth=1)
            lines.append(line)
            
        steps = 20
        delay = 50 
        def fade_step(step):
            if step >= steps:
                for l in lines: l.destroy()
                if target == "identity":
                    self.revealed_state[filename]["guessed_id"] = None
                else:
                    self.revealed_state[filename]["guessed_fate"] = {}
                self.save_hints_state()
                self.open_details(filename)
                return

            if step == steps - 1:
                # Only hide text if we are clearing the state (Identity)
                if target == "identity":
                     for w in widgets: w.config(fg=self.bg_color)
                     for l in lines: l.config(bg=self.bg_color)

            self.root.after(delay, lambda: fade_step(step + 1))
        fade_step(0)

def load_custom_fonts():
    """Load all custom fonts before app starts."""
    fonts_dir = resource_path("fonts")
    
    fonts = [
        ("IMFeENrm28P.ttf", "IM FELL English"),
        ("SourceHanSerifSC-SemiBold.otf", "Source Han Serif SC"),
        ("851tegakizatsu.otf", "851TegakiZatsu")
    ]
    
    for filename, font_name in fonts:
        font_path = os.path.join(fonts_dir, filename)
        if load_font_resource(font_path):
            print(f"Successfully loaded font: {font_name} from {font_path}")
        else:
            print(f"Failed to load font: {font_name}")

if __name__ == "__main__":
    # macOS/Linux Check: Verify if fonts are actually loaded
    if platform.system() != "Windows":
        # Try to load fonts manually on macOS/Linux using the new logic
        load_custom_fonts()
        
        # Create a temp root to check font families
        temp_root = tk.Tk()
        available_fonts = set(tk.font.families(root=temp_root))
        temp_root.destroy()
        
        required_fonts = ["IM FELL English", "Source Han Serif SC"]
        # Convert available fonts to lowercase for case-insensitive comparison
        available_fonts_lower = {f.lower() for f in available_fonts}
        
        missing = []
        for req in required_fonts:
            if req.lower() not in available_fonts_lower:
                missing.append(req)
        
        if missing:
            print("WARNING: Custom fonts not detected!")
            print(f"Missing: {', '.join(missing)}")
            print(f"Available fonts sample: {list(available_fonts)[:10]}")
            print("On macOS/Linux, ensure fonts are in ~/Library/Fonts or configured in Info.plist")
        else:
             print("Custom fonts detected successfully.")
    else:
         # Windows: Load fonts manually
         load_custom_fonts()

    target_image_dir = resource_path("FacesHi")
    if not os.path.exists(target_image_dir):
        print(f"Error: 'FacesHi' folder not found at {target_image_dir}")
        root = tk.Tk()
        tk.Label(root, text=f"错误：未找到 'FacesHi' 文件夹。\n路径: {target_image_dir}", padx=20, pady=20).pack()
        root.mainloop()
    else:
        root = tk.Tk()
        app = FacesGalleryApp(root, target_image_dir)
        root.mainloop()

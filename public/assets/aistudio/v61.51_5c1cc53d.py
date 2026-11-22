"""
FB & Insta Pro Auto-Scheduler — Modern SaaS Booster Edition (v61.5)
Trending Dark-Slate Dashboard UI + Smooth Non-Blocking Engine + v60.25 System B Fetch Core (Deduplicated)
"""

from datetime import datetime
import os
from pathlib import Path
import subprocess
import platform
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk, simpledialog

# Selenium with auto driver management
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.common.action_chains import ActionChains
    from selenium.webdriver.chrome.service import Service as ChromeService
    from selenium.webdriver.edge.options import Options as EdgeOptions
    from selenium.webdriver.edge.service import Service as EdgeService
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        CHROME_DRIVER_MANAGER = True
    except ImportError:
        CHROME_DRIVER_MANAGER = False
    try:
        from webdriver_manager.microsoft import EdgeChromiumDriverManager
        EDGE_DRIVER_MANAGER = True
    except ImportError:
        EDGE_DRIVER_MANAGER = False
except ImportError:
    webdriver = None
    CHROME_DRIVER_MANAGER = False
    EDGE_DRIVER_MANAGER = False


# =========================================================================
# --- MODERN SAAS DESIGN SYSTEM TOKENS ---
# =========================================================================
THEME = {
    "bg_app": "#0b1120",
    "bg_sidebar": "#0f172a",
    "bg_card": "#111827",
    "bg_card_alt": "#1e293b",
    "bg_hover": "#1d283a",
    "border": "#1f2937",
    "border_accent": "#334155",
    "text_primary": "#f8fafc",
    "text_secondary": "#94a3b8",
    "text_muted": "#64748b",
    "accent": "#6366f1",
    "accent_hover": "#4f46e5",
    "success": "#10b981",
    "success_bg": "#064e3b",
    "warning": "#f59e0b",
    "danger": "#ef4444",
    "danger_bg": "#7f1d1d",
    "info": "#06b6d4",
    "purple": "#8b5cf6",
    "term_bg": "#060913",
    "term_fg": "#34d399",
}


class ModernButton(tk.Button):
    """Flat, crisp SaaS button with subtle hover feedback."""
    def __init__(self, master, bg_color=THEME["accent"], hover_color=None, fg_color="#ffffff", **kwargs):
        self._bg = bg_color
        self._hover = hover_color or self._darken(bg_color)
        super().__init__(
            master,
            bg=self._bg,
            fg=fg_color,
            activebackground=self._hover,
            activeforeground=fg_color,
            relief="flat",
            bd=0,
            cursor="hand2",
            font=kwargs.pop("font", ("Segoe UI", 9, "bold")),
            padx=kwargs.pop("padx", 14),
            pady=kwargs.pop("pady", 7),
            **kwargs
        )
        self.bind("<Enter>", lambda e: self.config(bg=self._hover))
        self.bind("<Leave>", lambda e: self.config(bg=self._bg))

    @staticmethod
    def _darken(hex_color):
        hex_color = hex_color.lstrip("#")
        if len(hex_color) != 6:
            return "#334155"
        rgb = [max(0, int(hex_color[i:i+2], 16) - 22) for i in (0, 2, 4)]
        return "#{:02x}{:02x}{:02x}".format(*rgb)


class SystemBProApp:
    def __init__(self, root):
        self.root = root
        self.root.title("FB & Insta Pro Auto-Scheduler — Booster Pro UI (v61.5 System B)")
        self.root.configure(bg=THEME["bg_app"])

        try:
            self.root.state('zoomed')
        except Exception:
            self.root.geometry("1380x920")

        self.deleted_rows_stack = []
        self.page_urls_map = {"Asif Ahmad": "https://www.facebook.com/"}

        self.profiles_dir = os.path.join(os.getcwd(), "browser_profiles")
        self.proofs_dir = os.path.join(os.getcwd(), "execution_proofs")
        os.makedirs(self.profiles_dir, exist_ok=True)
        os.makedirs(self.proofs_dir, exist_ok=True)

        self.custom_chrome_exe_path = ""
        self.custom_profile_path = ""
        self.custom_profile_dir_name = ""

        # Single shared browser session state
        self.active_driver = None
        self._active_session_signature = None
        self._driver_session_lock = threading.Lock()

        self.engine_running = False
        self._scheduler_after_id = None
        self._scheduled_attempted = set()
        self._scheduler_workers = set()
        self._scheduler_lock = threading.Lock()
        self._browser_execution_lock = threading.Lock()
        self._system_b_fetch_running = False

        # Log buffer for smooth non-blocking terminal updates
        self._log_buffer = []
        self._log_lock = threading.Lock()

        self._configure_ttk_styles()
        self._build_modern_shell()

        self._auto_detect_installed_browser()
        self._refresh_profile_summary_ui()
        self._update_kpi_badges()

        self.start_live_clock()
        self._flush_log_buffer_loop()
        self.root.bind("<Control-z>", lambda e: self.undo_last_delete())
        self.root.protocol("WM_DELETE_WINDOW", self.on_app_close)

    # =========================================================================
    # --- MODERN TTK STYLING & LAYOUT SHELL ---
    # =========================================================================
    def _configure_ttk_styles(self):
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        style.configure(
            "Modern.Treeview",
            background=THEME["bg_card"],
            foreground=THEME["text_primary"],
            fieldbackground=THEME["bg_card"],
            borderwidth=0,
            rowheight=34,
            font=("Segoe UI", 9)
        )
        style.configure(
            "Modern.Treeview.Heading",
            background=THEME["bg_card_alt"],
            foreground=THEME["text_primary"],
            relief="flat",
            borderwidth=0,
            font=("Segoe UI", 9, "bold"),
            padding=(8, 8)
        )
        style.map(
            "Modern.Treeview",
            background=[("selected", THEME["accent"])],
            foreground=[("selected", "#ffffff")]
        )
        style.map(
            "Modern.Treeview.Heading",
            background=[("active", THEME["border_accent"])]
        )

    def _create_card(self, parent, title=None, subtitle=None, accent_color=THEME["accent"]):
        outer = tk.Frame(
            parent,
            bg=THEME["bg_card"],
            highlightbackground=THEME["border_accent"],
            highlightthickness=1
        )
        if title:
            hdr = tk.Frame(outer, bg=THEME["bg_card"])
            hdr.pack(fill="x", padx=16, pady=(14, 6))

            bar = tk.Frame(hdr, bg=accent_color, width=4, height=18)
            bar.pack(side=tk.LEFT, padx=(0, 10))

            tk.Label(
                hdr,
                text=title,
                bg=THEME["bg_card"],
                fg=THEME["text_primary"],
                font=("Segoe UI", 11, "bold")
            ).pack(side=tk.LEFT)

            if subtitle:
                tk.Label(
                    hdr,
                    text=subtitle,
                    bg=THEME["bg_card"],
                    fg=THEME["text_muted"],
                    font=("Segoe UI", 9)
                ).pack(side=tk.RIGHT)

        body = tk.Frame(outer, bg=THEME["bg_card"])
        body.pack(fill="both", expand=True, padx=16, pady=(4, 14))
        return outer, body

    def _build_modern_shell(self):
        self.shell = tk.Frame(self.root, bg=THEME["bg_app"])
        self.shell.pack(fill="both", expand=True)

        self.sidebar = tk.Frame(self.shell, bg=THEME["bg_sidebar"], width=250)
        self.sidebar.pack(side=tk.LEFT, fill="y")
        self.sidebar.pack_propagate(False)

        brand_box = tk.Frame(self.sidebar, bg=THEME["bg_sidebar"])
        brand_box.pack(fill="x", padx=18, pady=(22, 18))

        tk.Label(
            brand_box,
            text="⚡ BOOSTER RPA",
            bg=THEME["accent"],
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=3
        ).pack(anchor="w")

        tk.Label(
            brand_box,
            text="Social Auto-Scheduler",
            bg=THEME["bg_sidebar"],
            fg=THEME["text_primary"],
            font=("Segoe UI", 13, "bold")
        ).pack(anchor="w", pady=(8, 2))

        tk.Label(
            brand_box,
            text="System B • v60.25 Fetch Core",
            bg=THEME["bg_sidebar"],
            fg=THEME["text_muted"],
            font=("Segoe UI", 8)
        ).pack(anchor="w")

        tk.Frame(self.sidebar, bg=THEME["border"], height=1).pack(fill="x", padx=16, pady=(0, 14))

        self.nav_buttons = {}
        self.pages = {}
        self.active_page_key = None

        nav_specs = [
            ("login", "01  Browser & Profile", "Setup & Fetch Pages"),
            ("content", "02  Pages & Media", "Bulk Caption & Video"),
            ("scheduler", "03  Master Scheduler", "Modes 1–4 & Auto-Run"),
            ("terminal", "04  Live RPA Terminal", "Real-Time Logs"),
        ]

        for key, label, sub in nav_specs:
            btn_wrap = tk.Frame(self.sidebar, bg=THEME["bg_sidebar"], cursor="hand2")
            btn_wrap.pack(fill="x", padx=12, pady=4)

            indicator = tk.Frame(btn_wrap, bg=THEME["bg_sidebar"], width=4)
            indicator.pack(side=tk.LEFT, fill="y")

            inner = tk.Frame(btn_wrap, bg=THEME["bg_sidebar"], padx=12, pady=10)
            inner.pack(side=tk.LEFT, fill="both", expand=True)

            lbl_main = tk.Label(
                inner,
                text=label,
                bg=THEME["bg_sidebar"],
                fg=THEME["text_secondary"],
                font=("Segoe UI", 10, "bold"),
                anchor="w"
            )
            lbl_main.pack(fill="x")

            lbl_sub = tk.Label(
                inner,
                text=sub,
                bg=THEME["bg_sidebar"],
                fg=THEME["text_muted"],
                font=("Segoe UI", 8),
                anchor="w"
            )
            lbl_sub.pack(fill="x")

            for widget in (btn_wrap, inner, lbl_main, lbl_sub):
                widget.bind("<Button-1>", lambda e, k=key: self.select_page(k))

            self.nav_buttons[key] = (btn_wrap, indicator, inner, lbl_main, lbl_sub)

        sidebar_footer = tk.Frame(
            self.sidebar,
            bg=THEME["bg_card_alt"],
            highlightbackground=THEME["border_accent"],
            highlightthickness=1
        )
        sidebar_footer.pack(side=tk.BOTTOM, fill="x", padx=14, pady=16)

        tk.Label(
            sidebar_footer,
            text="ENGINE QUICK CONTROL",
            bg=THEME["bg_card_alt"],
            fg=THEME["text_muted"],
            font=("Segoe UI", 8, "bold")
        ).pack(anchor="w", padx=12, pady=(10, 4))

        self.lbl_sidebar_engine = tk.Label(
            sidebar_footer,
            text="● STOPPED",
            bg=THEME["bg_card_alt"],
            fg=THEME["danger"],
            font=("Segoe UI", 10, "bold")
        )
        self.lbl_sidebar_engine.pack(anchor="w", padx=12, pady=(0, 8))

        btn_row_side = tk.Frame(sidebar_footer, bg=THEME["bg_card_alt"])
        btn_row_side.pack(fill="x", padx=10, pady=(0, 10))

        ModernButton(
            btn_row_side,
            text="▶ Start",
            bg_color=THEME["success"],
            padx=10,
            pady=5,
            command=self.launch_automation_engine
        ).pack(side=tk.LEFT, fill="x", expand=True, padx=(0, 4))

        ModernButton(
            btn_row_side,
            text="■ Stop",
            bg_color=THEME["danger"],
            padx=10,
            pady=5,
            command=self.stop_automation_engine
        ).pack(side=tk.LEFT, fill="x", expand=True, padx=(4, 0))

        self.workspace = tk.Frame(self.shell, bg=THEME["bg_app"])
        self.workspace.pack(side=tk.LEFT, fill="both", expand=True)

        self.topbar = tk.Frame(
            self.workspace,
            bg=THEME["bg_sidebar"],
            height=64,
            highlightbackground=THEME["border"],
            highlightthickness=1
        )
        self.topbar.pack(fill="x")
        self.topbar.pack_propagate(False)

        self.lbl_page_title = tk.Label(
            self.topbar,
            text="Browser & Profile Setup",
            bg=THEME["bg_sidebar"],
            fg=THEME["text_primary"],
            font=("Segoe UI", 14, "bold")
        )
        self.lbl_page_title.pack(side=tk.LEFT, padx=22)

        pills_frame = tk.Frame(self.topbar, bg=THEME["bg_sidebar"])
        pills_frame.pack(side=tk.RIGHT, padx=20)

        self.lbl_live_clock = tk.Label(
            pills_frame,
            text="🕒 --:--:--",
            bg=THEME["bg_card_alt"],
            fg=THEME["text_primary"],
            font=("Consolas", 10, "bold"),
            padx=12,
            pady=6
        )
        self.lbl_live_clock.pack(side=tk.RIGHT, padx=(8, 0))

        self.lbl_top_status_pill = tk.Label(
            pills_frame,
            text="● ENGINE STOPPED",
            bg=THEME["danger_bg"],
            fg="#fca5a5",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=6
        )
        self.lbl_top_status_pill.pack(side=tk.RIGHT, padx=6)

        self.lbl_top_pages_pill = tk.Label(
            pills_frame,
            text="📄 0 Pages",
            bg=THEME["bg_card_alt"],
            fg=THEME["info"],
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=6
        )
        self.lbl_top_pages_pill.pack(side=tk.RIGHT, padx=6)

        self.page_container = tk.Frame(self.workspace, bg=THEME["bg_app"])
        self.page_container.pack(fill="both", expand=True, padx=20, pady=16)

        self.tab_login = tk.Frame(self.page_container, bg=THEME["bg_app"])
        self.tab_content = tk.Frame(self.page_container, bg=THEME["bg_app"])
        self.tab_scheduler = tk.Frame(self.page_container, bg=THEME["bg_app"])
        self.tab_live_terminal = tk.Frame(self.page_container, bg=THEME["bg_app"])

        self.pages = {
            "login": (self.tab_login, "Browser & Profile Setup"),
            "content": (self.tab_content, "Pages & Inline Media Studio"),
            "scheduler": (self.tab_scheduler, "Master Scheduler & Execution Modes"),
            "terminal": (self.tab_live_terminal, "Live RPA Execution Terminal"),
        }

        self.setup_login_tab()
        self.setup_content_tab()
        self.setup_scheduler_tab()
        self.setup_live_terminal_tab()

        self.select_page("login")

    def select_page(self, key):
        if key not in self.pages:
            return
        self.active_page_key = key

        for k, (frame, _) in self.pages.items():
            frame.pack_forget()

        target_frame, title_text = self.pages[key]
        target_frame.pack(fill="both", expand=True)
        self.lbl_page_title.config(text=title_text)

        for k, (wrap, ind, inner, l_main, l_sub) in self.nav_buttons.items():
            if k == key:
                ind.config(bg=THEME["accent"])
                inner.config(bg=THEME["bg_hover"])
                l_main.config(bg=THEME["bg_hover"], fg=THEME["text_primary"])
                l_sub.config(bg=THEME["bg_hover"], fg=THEME["info"])
            else:
                ind.config(bg=THEME["bg_sidebar"])
                inner.config(bg=THEME["bg_sidebar"])
                l_main.config(bg=THEME["bg_sidebar"], fg=THEME["text_secondary"])
                l_sub.config(bg=THEME["bg_sidebar"], fg=THEME["text_muted"])

    def _update_kpi_badges(self):
        try:
            count_p = len(self.tree.get_children()) if hasattr(self, "tree") else 0
            count_s = len(self.tree_sch.get_children()) if hasattr(self, "tree_sch") else 0
            self.lbl_top_pages_pill.config(text=f"📄 {count_p} Pages • 🕒 {count_s} Queued")
        except Exception:
            pass

    # =========================================================================
    # --- UNIFIED SYSTEM B PROFILE & BROWSER OPTIONS (NO DUPLICATION) ---
    # =========================================================================
    def _auto_detect_installed_browser(self):
        if self.custom_chrome_exe_path and os.path.exists(self.custom_chrome_exe_path):
            return

        home = Path.home()
        local_app = os.environ.get("LOCALAPPDATA", "")
        prog_files = os.environ.get("ProgramFiles", "")
        prog_files_x86 = os.environ.get("ProgramFiles(x86)", "")

        candidates = [
            os.path.join(prog_files, "Google", "Chrome", "Application", "chrome.exe") if prog_files else "",
            os.path.join(prog_files_x86, "Google", "Chrome", "Application", "chrome.exe") if prog_files_x86 else "",
            os.path.join(local_app, "Google", "Chrome", "Application", "chrome.exe") if local_app else "",
            os.path.join(prog_files_x86, "Microsoft", "Edge", "Application", "msedge.exe") if prog_files_x86 else "",
            os.path.join(prog_files, "Microsoft", "Edge", "Application", "msedge.exe") if prog_files else "",
            os.path.join(local_app, "Microsoft", "Edge", "Application", "msedge.exe") if local_app else "",
            os.path.join(prog_files, "BraveSoftware", "Brave-Browser", "Application", "brave.exe") if prog_files else "",
            os.path.join(local_app, "BraveSoftware", "Brave-Browser", "Application", "brave.exe") if local_app else "",
            str(home / "AppData" / "Local" / "Google" / "Chrome" / "Application" / "chrome.exe"),
            str(home / "AppData" / "Local" / "Microsoft" / "Edge" / "Application" / "msedge.exe"),
        ]

        for exe in candidates:
            if exe and os.path.isfile(exe):
                self.custom_chrome_exe_path = os.path.abspath(exe)
                self.lbl_selected_exe.config(
                    text=f"✅ Auto-Detected: {os.path.basename(self.custom_chrome_exe_path)}",
                    fg=THEME["success"]
                )
                break

    def _is_edge_browser(self):
        exe_name = os.path.basename(self.custom_chrome_exe_path or "").lower()
        return "msedge" in exe_name or "edge" in exe_name

    def _get_external_browser_profile_info(self):
        """Persistent, writable System B profile kept separate from normal Chrome."""
        if self.custom_profile_path and os.path.isdir(self.custom_profile_path):
            return self.custom_profile_path, (self.custom_profile_dir_name or "Default")

        browser_key = os.path.basename(self.custom_chrome_exe_path or "chrome.exe").lower()
        if "msedge" in browser_key or "edge" in browser_key:
            folder = "Edge"
        elif "brave" in browser_key:
            folder = "Brave"
        elif "vivaldi" in browser_key:
            folder = "Vivaldi"
        else:
            folder = "Chrome"
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        root = os.path.join(base, "FBInstaProAutomation", "SystemBProfiles")
        profile_path = os.path.join(root, folder)
        os.makedirs(profile_path, exist_ok=True)
        return profile_path, "Default"

    def _build_system_b_options(self):
        """Single source of truth for System B browser Options & profile args."""
        is_edge = self._is_edge_browser()
        options = EdgeOptions() if is_edge else Options()
        if self.custom_chrome_exe_path and os.path.exists(self.custom_chrome_exe_path):
            options.binary_location = self.custom_chrome_exe_path
        options.page_load_strategy = "eager"
        for arg in (
            "--disable-notifications",
            "--start-maximized",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-popup-blocking",
        ):
            options.add_argument(arg)

        ext_profile_path, ext_profile_name = self._get_external_browser_profile_info()
        os.makedirs(ext_profile_path, exist_ok=True)
        options.add_argument(f"--user-data-dir={ext_profile_path}")
        options.add_argument(f"--profile-directory={ext_profile_name}")
        return options, ext_profile_path, ext_profile_name

    def _current_browser_profile_signature(self):
        exe = os.path.abspath(self.custom_chrome_exe_path or "")
        prof_path, prof_dir = self._get_external_browser_profile_info()
        return (exe.lower(), os.path.abspath(prof_path).lower(), prof_dir)

    # =========================================================================
    # --- SHARED BROWSER SESSION HELPERS ---
    # =========================================================================
    def _is_driver_alive(self, driver):
        if driver is None:
            return False
        try:
            _ = driver.current_url
            _ = driver.window_handles
            return True
        except Exception:
            return False

    def _get_or_create_shared_driver(self, options=None):
        current_sig = self._current_browser_profile_signature()
        with self._driver_session_lock:
            if self._is_driver_alive(self.active_driver) and self._active_session_signature == current_sig:
                self.log_message("♻️ Reusing already open System B browser session.")
                return self.active_driver

            if self.active_driver is not None:
                try:
                    self.active_driver.quit()
                except Exception:
                    pass
                self.active_driver = None
                self._active_session_signature = None

            if options is None:
                options, ext_profile_path, ext_profile_name = self._build_system_b_options()
            else:
                ext_profile_path, ext_profile_name = self._get_external_browser_profile_info()

            self.log_message(
                f"🌐 System B starting {os.path.basename(self.custom_chrome_exe_path)} "
                f"with profile: {ext_profile_path} [{ext_profile_name}]"
            )
            driver = self.get_chrome_driver(is_external=True, options=options)
            if driver is None:
                raise RuntimeError("Selenium ne browser session create nahi ki.")

            try:
                driver.set_page_load_timeout(60)
            except Exception:
                pass

            self.active_driver = driver
            self._active_session_signature = current_sig
            return self.active_driver

    def _navigate_in_same_browser(self, driver, url):
        handles = driver.window_handles
        if handles:
            driver.switch_to.window(handles[0])
        driver.get(url)

    def _close_shared_driver_if_needed(self, force=False):
        if not force:
            return
        with self._driver_session_lock:
            if self.active_driver is not None:
                try:
                    self.active_driver.quit()
                except Exception:
                    pass
                self.active_driver = None
                self._active_session_signature = None

    def _has_remaining_queue_items(self, exclude_target=None):
        """Check if any pending item remains in scheduler queue."""
        try:
            for item in self.tree_sch.get_children():
                vals = self.tree_sch.item(item, "values")
                if not vals:
                    continue
                name = str(vals[0]).strip()
                if exclude_target and name == exclude_target:
                    continue
                return True
        except Exception:
            pass
        return False

    def _finalize_target_after_proof(self, target_name, close_if_queue_empty=True):
        """Remove completed target from queue; close browser if nothing else is queued."""
        self.remove_target_from_scheduler(target_name)
        if not close_if_queue_empty:
            return

        def _check_and_close():
            time.sleep(0.3)
            done_evt = threading.Event()
            holder = {"has_more": False}

            def _read_tree():
                holder["has_more"] = self._has_remaining_queue_items(exclude_target=target_name)
                done_evt.set()

            self.root.after(0, _read_tree)
            done_evt.wait(timeout=2.0)
            remaining = holder["has_more"]

            with self._scheduler_lock:
                active_workers = [w for w in self._scheduler_workers if w.is_alive() and w is not threading.current_thread()]

            if not remaining and not active_workers and not self._system_b_fetch_running:
                self.log_message("🔒 Queue mein koi next target nahi hai — browser session close kiya ja raha hai.")
                self._close_shared_driver_if_needed(force=True)
            else:
                self.log_message("➡️ Queue mein next target mojood hai — browser session next profile/page ke liye open rakha gaya hai.")

        threading.Thread(target=_check_and_close, daemon=True).start()

    def on_app_close(self):
        try:
            self.stop_automation_engine(_suppress_alert=True)
        except Exception:
            pass
        self._close_shared_driver_if_needed(force=True)
        self.root.destroy()

    # =========================================================================
    # --- v60.25 SYSTEM B DRIVER CORE ---
    # =========================================================================
    def get_chrome_driver(self, is_external=False, options=None):
        """Launch Chrome/Edge with detailed driver logs and compatible fallback."""
        if not webdriver:
            raise RuntimeError("Selenium missing hai. Run: py -m pip install -U selenium webdriver-manager")

        is_edge = bool(is_external and self._is_edge_browser())
        log_dir = os.path.join(
            os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
            "FBInstaProAutomation", "logs"
        )
        os.makedirs(log_dir, exist_ok=True)

        if is_edge:
            edge_options = EdgeOptions()
            if options is not None:
                for arg in getattr(options, "arguments", []):
                    edge_options.add_argument(arg)
                for key, value in getattr(options, "experimental_options", {}).items():
                    edge_options.add_experimental_option(key, value)
            if is_external and os.path.isfile(self.custom_chrome_exe_path):
                edge_options.binary_location = self.custom_chrome_exe_path
            edge_log = os.path.join(log_dir, "systemB_edgedriver.log")
            try:
                service = EdgeService(service_args=["--verbose"], log_output=edge_log)
                return webdriver.Edge(service=service, options=edge_options)
            except Exception as exc:
                raise RuntimeError(f"Edge WebDriver start failed. Log: {edge_log}. Detail: {exc}") from exc

        chrome_options = options if options is not None else Options()
        if is_external and os.path.isfile(self.custom_chrome_exe_path):
            chrome_options.binary_location = self.custom_chrome_exe_path

        for arg in (
            "--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox",
            "--disable-notifications", "--no-first-run",
            "--no-default-browser-check", "--remote-allow-origins=*"
        ):
            if arg not in getattr(chrome_options, "arguments", []):
                chrome_options.add_argument(arg)

        chrome_log = os.path.join(log_dir, "systemB_chromedriver.log")
        errors = []
        try:
            service = ChromeService(service_args=["--verbose"], log_output=chrome_log)
            return webdriver.Chrome(service=service, options=chrome_options)
        except Exception as exc:
            errors.append("Selenium Manager: " + str(exc))

        try:
            service = ChromeService(
                ChromeDriverManager().install(),
                service_args=["--verbose"], log_output=chrome_log
            )
            return webdriver.Chrome(service=service, options=chrome_options)
        except Exception as exc:
            errors.append("ChromeDriver Manager: " + str(exc))

        raise RuntimeError(
            "Chrome/Chromium start nahi hua. Driver log yahan save hai: "
            + chrome_log + "\n\n" + "\n".join(errors)
        )

    def _create_mode_driver(self):
        return self._get_or_create_shared_driver()

    # =========================================================================
    # --- PAGE 1: BROWSER & PROFILE SETUP ---
    # =========================================================================
    def setup_login_tab(self):
        hero_card, hero_body = self._create_card(
            self.tab_login,
            title="PC Browser & Session Engine (System B)",
            subtitle="v60.25 System B Fetch Core • Clean Page Filter",
            accent_color=THEME["accent"]
        )
        hero_card.pack(fill="x", pady=(0, 14))

        row1 = tk.Frame(hero_body, bg=THEME["bg_card"])
        row1.pack(fill="x", pady=(4, 10))

        ModernButton(
            row1,
            text="📂 Browse PC Browser (.exe)",
            bg_color=THEME["warning"],
            fg_color="#0f172a",
            command=self.browse_chrome_executable
        ).pack(side=tk.LEFT)

        self.lbl_selected_exe = tk.Label(
            row1,
            text="No External Browser Selected yet.",
            bg=THEME["bg_card"],
            fg=THEME["text_secondary"],
            font=("Segoe UI", 9, "italic")
        )
        self.lbl_selected_exe.pack(side=tk.LEFT, padx=14)

        ModernButton(
            row1,
            text="🌐 2. PC Browser + Fetch + Automation (System B)",
            bg_color=THEME["accent"],
            padx=18,
            pady=8,
            command=self.open_external_browser_and_fetch
        ).pack(side=tk.RIGHT)

        row2 = tk.Frame(hero_body, bg=THEME["bg_card"])
        row2.pack(fill="x", pady=(4, 4))

        ModernButton(
            row2,
            text="👤 Import Profile Folder",
            bg_color=THEME["info"],
            fg_color="#0f172a",
            command=self.browse_browser_profile_folder
        ).pack(side=tk.LEFT)

        ModernButton(
            row2,
            text="↺ Default System B Profile",
            bg_color=THEME["bg_card_alt"],
            fg_color=THEME["text_primary"],
            command=self.reset_to_default_profile
        ).pack(side=tk.LEFT, padx=8)

        self.lbl_selected_profile = tk.Label(
            row2,
            text="Profile: Default System B Profile...",
            bg=THEME["bg_card"],
            fg=THEME["success"],
            font=("Segoe UI", 9, "bold")
        )
        self.lbl_selected_profile.pack(side=tk.LEFT, padx=12)

        ModernButton(
            row2,
            text="➕ Add Manual Page / URL",
            bg_color=THEME["purple"],
            command=self.dialog_add_real_page_direct
        ).pack(side=tk.RIGHT)

        diag_card, diag_body = self._create_card(
            self.tab_login,
            title="Active System B Profile & Session Diagnostics",
            subtitle="Live Configuration Snapshot",
            accent_color=THEME["success"]
        )
        diag_card.pack(fill="both", expand=True)

        self.txt_accounts = scrolledtext.ScrolledText(
            diag_body,
            height=14,
            font=("Consolas", 10),
            bg=THEME["term_bg"],
            fg="#e2e8f0",
            insertbackground="#ffffff",
            relief="flat",
            bd=0,
            padx=12,
            pady=12
        )
        self.txt_accounts.pack(fill="both", expand=True)
        self.txt_accounts.insert(
            tk.END,
            "Status: Select PC Browser (.exe), optionally import profile folder, "
            "and click '2. PC Browser + Fetch + Automation (System B)'...\n"
        )

    def _refresh_profile_summary_ui(self):
        profile_path, profile_dir_name = self._get_external_browser_profile_info()
        mode_label = "Imported Profile" if self.custom_profile_path else "Default System B Profile"
        self.lbl_selected_profile.config(
            text=f"{mode_label}: {os.path.basename(profile_path)} [{profile_dir_name}]",
            fg=THEME["success"]
        )
        self.txt_accounts.delete("1.0", tk.END)
        self.txt_accounts.insert(
            tk.END,
            f"Browser EXE  : {self.custom_chrome_exe_path or 'Not Selected'}\n"
            f"Profile Mode : {mode_label}\n"
            f"Profile Path : {profile_path}\n"
            f"Profile Dir  : {profile_dir_name}\n"
            "System Core  : v60.25 System B Fetch Core (No Extra Pages)\n"
            "Status       : Ready to launch browser & fetch pages.\n"
        )

    def browse_chrome_executable(self):
        file_path = filedialog.askopenfilename(
            title="Select PC Browser Executable (chrome.exe)",
            filetypes=[("Executable Files", "*.exe"), ("All Files", "*.*")],
            parent=self.root
        )
        if file_path:
            self.custom_chrome_exe_path = os.path.abspath(file_path)
            self.lbl_selected_exe.config(
                text=f"Selected: {os.path.basename(self.custom_chrome_exe_path)}",
                fg=THEME["success"]
            )
            self.log_message(f"📂 External Browser EXE selected for System B: {self.custom_chrome_exe_path}")
            profile_path, profile_name = self._get_external_browser_profile_info()
            self.log_message(
                f"🔗 Shared System B profile for fetch + Modes 1-4 + scheduler: {profile_path} [{profile_name}]"
            )
            self._refresh_profile_summary_ui()
            messagebox.showinfo(
                "Browser Selected",
                f"PC Browser select ho gaya hai:\n\n{os.path.basename(file_path)}\n\n"
                "Ab '2. PC Browser + Fetch + Automation (System B)' button dabayein.",
                parent=self.root
            )

    def browse_browser_profile_folder(self):
        initial_path, _ = self._get_external_browser_profile_info()
        initial_dir = initial_path if os.path.isdir(initial_path) else str(Path.home())
        selected_dir = filedialog.askdirectory(
            title="Select Browser Profile Folder",
            initialdir=initial_dir,
            mustexist=True,
            parent=self.root
        )
        if not selected_dir:
            return

        p = Path(selected_dir).resolve()
        if p.name.lower() == "default" or p.name.lower().startswith("profile "):
            self.custom_profile_path = str(p.parent)
            self.custom_profile_dir_name = p.name
        else:
            self.custom_profile_path = str(p)
            self.custom_profile_dir_name = "Default"

        self.log_message(
            f"👤 Selected profile: [{self.custom_profile_path}] -> [{self.custom_profile_dir_name}]"
        )
        self._refresh_profile_summary_ui()
        messagebox.showinfo(
            "Profile Selected",
            f"Profile select ho gayi hai:\n\nFolder: {self.custom_profile_path}\nProfile: {self.custom_profile_dir_name}",
            parent=self.root
        )

    def reset_to_default_profile(self):
        self.custom_profile_path = ""
        self.custom_profile_dir_name = ""
        prof_path, prof_dir = self._get_external_browser_profile_info()
        self.log_message(f"↺ Reset to Default System B Profile: [{prof_path}] -> [{prof_dir}]")
        self._refresh_profile_summary_ui()

    def dialog_add_real_page_direct(self):
        page_name = simpledialog.askstring("Add Real Page", "Enter Real Facebook Page Name:", parent=self.root)
        if not page_name:
            return
        page_url = simpledialog.askstring("Page URL", f"Enter Facebook URL for '{page_name}' (or leave blank):", parent=self.root)
        if page_url:
            self.page_urls_map[page_name.strip()] = page_url.strip()
        curr_d = datetime.now().strftime("%Y-%m-%d")
        curr_t = datetime.now().strftime("%H:%M")
        self.tree.insert("", tk.END, values=(page_name.strip(), "Page", "Not Assigned", "#trending", curr_d, curr_t, "Browse", "Remove"))
        self._update_kpi_badges()
        self.log_message(f"Added real page target: [{page_name}] to Inline Media Table.")
        messagebox.showinfo("Success", f"Page '{page_name}' added to Pages & Media table!", parent=self.root)

    def handle_cookie_popups_if_any(self, driver):
        try:
            cookie_xpaths = [
                "//div[@role='dialog']//div[@aria-label='Allow all cookies' and @role='button']",
                "//div[@role='dialog']//div[normalize-space(.)='Allow all cookies' and @role='button']",
                "//div[@role='dialog']//span[contains(text(), 'Allow all cookies')]/ancestor::div[@role='button']",
                "//div[@role='dialog']//button[contains(., 'Allow all cookies')]",
                "//div[@aria-label='Allow all cookies']",
                "//div[@role='dialog']//span[normalize-space(.)='Allow']/ancestor::div[@role='button']",
                "//div[@role='dialog']//div[@role='button' and contains(@aria-label, 'Allow')]"
            ]
            for xpath in cookie_xpaths:
                elements = driver.find_elements(By.XPATH, xpath)
                for el in elements:
                    if el.is_displayed():
                        driver.execute_script("arguments[0].click();", el)
                        self.log_message("🍪 Cookie / Consent dialog detected & automatically clicked 'Allow' button!")
                        time.sleep(2.0)
                        return True
        except Exception:
            pass
        return False

    # =========================================================================
    # --- v60.25 PAGE & PROFILE FETCH SYSTEM (CLEAN & STRICT FILTERING) ---
    # =========================================================================
    def _extract_pages_and_profile_from_driver(self, driver):
        """Fetch managed Facebook Pages without extra/navigation/utility links."""
        links = driver.find_elements(
            By.XPATH,
            "//div[@role='main']//a[@href] | //main//a[@href] | "
            "//a[@href and (contains(@href,'/pages/') or contains(@href,'profile.php?id='))]"
        )
        fetched_pages = []
        seen_urls = set()
        seen_names = set()

        ignore_words = {
            "switch", "promote", "create", "view", "insights", "manage",
            "see all", "discover", "liked pages", "invites", "notification",
            "notifications", "message", "messages", "profile", "settings",
            "marketplace", "groups", "watch", "memories", "home", "feed",
            "menu", "your pages", "ads", "ad center", "meta business suite",
            "help", "privacy", "terms", "cookies", "more", "learn more",
            "pages feed", "create new page", "switch profile"
        }
        blocked_url_parts = (
            "/help/", "/privacy/", "/policies/", "/watch/", "/groups/",
            "/events/", "/marketplace/", "/gaming/", "/saved/", "/ads/",
            "/business/", "/notifications", "/messages", "/bookmarks",
            "/friends", "/memories", "/offers", "/jobs", "/fundraisers"
        )
        blocked_tails = {
            "pages", "your_pages", "bookmarks", "home", "friends", "feed",
            "notifications", "messages", "marketplace", "groups", "watch",
            "memories", "ads", "settings", "help", "privacy", "login"
        }

        for link in links:
            try:
                name = " ".join((link.text or "").split())
                href = (link.get_attribute("href") or "").strip()
                if not name or len(name) < 2 or len(name) > 90 or not href:
                    continue
                if href.startswith("/"):
                    href = "https://www.facebook.com" + href
                if "facebook.com" not in href.lower():
                    continue

                low_name = name.casefold()
                if low_name in ignore_words or any(w in low_name for w in ignore_words):
                    continue

                low_url = href.lower()
                if any(part in low_url for part in blocked_url_parts):
                    continue

                clean_url = href.split("#")[0]
                if "profile.php?id=" not in clean_url:
                    clean_url = clean_url.split("?")[0]
                key = clean_url.rstrip("/").lower()
                if not key or key in seen_urls:
                    continue

                tail = key.rsplit("/", 1)[-1]
                if tail in blocked_tails:
                    continue

                if key in {"https://www.facebook.com", "http://www.facebook.com"}:
                    continue

                name_key = low_name.strip()
                if name_key in seen_names:
                    continue

                seen_urls.add(key)
                seen_names.add(name_key)
                fetched_pages.append({"name": name, "url": clean_url})
                self.page_urls_map[name] = clean_url
            except Exception as item_err:
                self.log_message(f"Skipping one unreadable page link: {item_err}")

        profile_name = "Facebook Profile"
        try:
            profile_links = driver.find_elements(
                By.XPATH, "//a[contains(@href,'/me/') or contains(@aria-label,'Profile')]"
            )
            for profile_link in profile_links:
                label = " ".join((profile_link.text or "").split())
                if label and 1 < len(label) < 70 and label.casefold() not in ignore_words:
                    profile_name = label
                    break
        except Exception:
            pass

        return profile_name, fetched_pages

    def open_external_browser_and_fetch(self):
        if self._system_b_fetch_running:
            messagebox.showinfo("System B", "PC Browser fetch process already running.", parent=self.root)
            return
        if not self.custom_chrome_exe_path or not os.path.exists(self.custom_chrome_exe_path):
            messagebox.showwarning(
                "Select Browser First",
                "Pehle 'Browse PC Browser (.exe)' se Chrome ya Microsoft Edge select karein.",
                parent=self.root
            )
            return

        self._system_b_fetch_running = True
        self.select_page("terminal")

        def finish_fetch_ui(profile_name, fetched_pages, fetch_error=None):
            """Run all Treeview and page changes on Tk's main thread."""
            try:
                if fetch_error:
                    messagebox.showerror("System B Browser Error", fetch_error, parent=self.root)
                    return
                for item in self.tree.get_children():
                    self.tree.delete(item)

                curr_d = datetime.now().strftime("%Y-%m-%d")
                curr_t = datetime.now().strftime("%H:%M")
                self.tree.insert(
                    "", tk.END,
                    values=(profile_name or "Facebook Profile", "Personal",
                            "Not Assigned", "#viral #trending", curr_d, curr_t, "Browse", "Remove")
                )
                for page_obj in fetched_pages:
                    self.tree.insert(
                        "", tk.END,
                        values=(page_obj["name"], "Page", "Not Assigned",
                                "#trending #viral", curr_d, curr_t, "Browse", "Remove")
                    )

                self._update_kpi_badges()
                self.select_page("content")
                if fetched_pages:
                    messagebox.showinfo(
                        "Pages Fetched",
                        f"{len(fetched_pages)} Facebook Pages fetch ho gaye hain.\n"
                        "Ab Pages & Media mein list dekh sakte hain.",
                        parent=self.root
                    )
                else:
                    messagebox.showwarning(
                        "No Pages Found",
                        "Facebook session open ho gaya, lekin Pages list nahi mili.\n"
                        "Confirm karein ke Facebook account mein Pages hain aur "
                        "aap 'Your Pages' view access kar sakte hain.",
                        parent=self.root
                    )
            finally:
                self._system_b_fetch_running = False

        def external_login_worker():
            try:
                if not webdriver:
                    raise RuntimeError(
                        "Selenium install nahi hai. Command Prompt mein run karein: "
                        "py -m pip install -U selenium webdriver-manager"
                    )

                options, _, _ = self._build_system_b_options()
                driver = self._get_or_create_shared_driver(options=options)
                wait = WebDriverWait(driver, 45)
                driver.set_page_load_timeout(60)
                self._navigate_in_same_browser(driver, "https://www.facebook.com/")
                time.sleep(4)
                self.handle_cookie_popups_if_any(driver)

                def facebook_logged_in(d):
                    url = (d.current_url or "").lower()
                    if "login" in url or "checkpoint" in url:
                        return False
                    try:
                        if d.get_cookie("c_user"):
                            return True
                    except Exception:
                        pass
                    try:
                        return bool(d.find_elements(
                            By.XPATH,
                            "//a[contains(@href,'/me/') or contains(@aria-label,'Profile')]"
                            " | //*[@aria-label='Create a post']"
                            " | //span[contains(.,\"What's on your mind\")]"
                        ))
                    except Exception:
                        return False

                if not facebook_logged_in(driver):
                    self.log_message("Facebook login required; waiting for manual sign-in.")
                    self.root.after(0, lambda: messagebox.showinfo(
                        "Facebook Login",
                        "Opened browser mein Facebook login karein. Login complete hone ke baad "
                        "isi window ko khula rehne dein; app automatically pages fetch karegi.",
                        parent=self.root
                    ))
                    wait.until(facebook_logged_in)

                self.log_message("✅ Facebook session detected. Opening Your Pages...")
                target_url = "https://www.facebook.com/pages/?category=your_pages"
                self._navigate_in_same_browser(driver, target_url)
                WebDriverWait(driver, 45).until(
                    lambda d: d.execute_script("return document.readyState") in ("interactive", "complete")
                )
                time.sleep(5)
                self.handle_cookie_popups_if_any(driver)

                previous_height = -1
                stable_rounds = 0
                for _ in range(10):
                    height = driver.execute_script("return document.body.scrollHeight")
                    driver.execute_script("window.scrollTo(0, arguments[0]);", height)
                    time.sleep(1.3)
                    self.handle_cookie_popups_if_any(driver)
                    new_height = driver.execute_script("return document.body.scrollHeight")
                    if new_height == previous_height:
                        stable_rounds += 1
                    else:
                        stable_rounds = 0
                    previous_height = new_height
                    if stable_rounds >= 2:
                        break

                profile_name, fetched_pages = self._extract_pages_and_profile_from_driver(driver)

                cookies = driver.get_cookies()
                cookie_str = "".join([f"{c['name']}={c['value']}; " for c in cookies])
                if cookie_str:
                    self.root.after(0, lambda c=cookie_str: (
                        self.txt_accounts.delete("1.0", tk.END),
                        self.txt_accounts.insert(tk.END, c + "\n")
                    ))

                self.log_message(f"System B completed. Clean pages fetched: {len(fetched_pages)}")
                self.root.after(0, lambda n=profile_name, p=fetched_pages: finish_fetch_ui(n, p))
            except Exception as e:
                error_text = f"{type(e).__name__}: {e}"
                self.log_message(f"❌ System B failed: {error_text}")
                self.root.after(0, lambda msg=error_text: finish_fetch_ui(None, [], msg))

        threading.Thread(target=external_login_worker, daemon=True).start()

    # =========================================================================
    # --- PAGE 2: INLINE MEDIA & FETCHED PAGES ---
    # =========================================================================
    def setup_content_tab(self):
        bulk_row = tk.Frame(self.tab_content, bg=THEME["bg_app"])
        bulk_row.pack(fill="x", pady=(0, 12))

        cap_card, cap_body = self._create_card(
            bulk_row,
            title="Bulk Caption Injector",
            subtitle="One-Click Apply",
            accent_color=THEME["success"]
        )
        cap_card.pack(side=tk.LEFT, fill="both", expand=True, padx=(0, 8))

        self.txt_bulk_caption = scrolledtext.ScrolledText(
            cap_body,
            height=2,
            font=("Segoe UI", 9),
            bg=THEME["bg_card_alt"],
            fg=THEME["text_primary"],
            insertbackground="#ffffff",
            relief="flat",
            padx=8,
            pady=6
        )
        self.txt_bulk_caption.pack(fill="x", pady=(2, 8))
        self.txt_bulk_caption.insert(tk.END, "Check out this amazing update! 🔥 Follow for more. #viral #reels #trending")

        cap_ctrl = tk.Frame(cap_body, bg=THEME["bg_card"])
        cap_ctrl.pack(fill="x")
        self.chk_apply_all_cap = tk.IntVar(value=1)
        tk.Checkbutton(
            cap_ctrl,
            text="Apply to ALL Pages",
            variable=self.chk_apply_all_cap,
            bg=THEME["bg_card"],
            fg=THEME["text_secondary"],
            selectcolor=THEME["bg_card_alt"],
            activebackground=THEME["bg_card"],
            activeforeground=THEME["text_primary"],
            font=("Segoe UI", 9, "bold")
        ).pack(side=tk.LEFT)

        ModernButton(
            cap_ctrl,
            text="📥 Apply Caption",
            bg_color=THEME["success"],
            padx=12,
            pady=5,
            command=self.apply_bulk_caption_to_table
        ).pack(side=tk.RIGHT)

        time_card, time_body = self._create_card(
            bulk_row,
            title="Global Schedule Setter",
            subtitle="YYYY-MM-DD & HH:MM",
            accent_color=THEME["info"]
        )
        time_card.pack(side=tk.LEFT, fill="both", expand=True, padx=(8, 0))

        t_grid = tk.Frame(time_body, bg=THEME["bg_card"])
        t_grid.pack(fill="x", pady=(10, 6))

        tk.Label(t_grid, text="Date:", bg=THEME["bg_card"], fg=THEME["text_secondary"], font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        self.entry_bulk_date = tk.Entry(
            t_grid,
            width=13,
            bg=THEME["bg_card_alt"],
            fg=THEME["text_primary"],
            insertbackground="#ffffff",
            relief="flat",
            font=("Consolas", 10)
        )
        self.entry_bulk_date.pack(side=tk.LEFT, padx=(6, 14), ipady=4)
        self.entry_bulk_date.insert(0, datetime.now().strftime("%Y-%m-%d"))

        tk.Label(t_grid, text="Time:", bg=THEME["bg_card"], fg=THEME["text_secondary"], font=("Segoe UI", 9, "bold")).pack(side=tk.LEFT)
        self.entry_bulk_time = tk.Entry(
            t_grid,
            width=9,
            bg=THEME["bg_card_alt"],
            fg=THEME["text_primary"],
            insertbackground="#ffffff",
            relief="flat",
            font=("Consolas", 10)
        )
        self.entry_bulk_time.pack(side=tk.LEFT, padx=(6, 12), ipady=4)
        self.entry_bulk_time.insert(0, datetime.now().strftime("%H:%M"))

        ModernButton(
            t_grid,
            text="⏰ Apply to All",
            bg_color=THEME["info"],
            fg_color="#0f172a",
            padx=12,
            pady=5,
            command=self.apply_bulk_time_to_table
        ).pack(side=tk.RIGHT)

        tbl_card, tbl_body = self._create_card(
            self.tab_content,
            title="Fetched Real Pages & Media Assignment Matrix",
            subtitle="Double-click row to assign media • Supports .txt path lists",
            accent_color=THEME["accent"]
        )
        tbl_card.pack(fill="both", expand=True)

        top_bar = tk.Frame(tbl_body, bg=THEME["bg_card"])
        top_bar.pack(fill="x", pady=(0, 8))

        ModernButton(
            top_bar,
            text="📂 Import Video or .txt Path List",
            bg_color=THEME["warning"],
            fg_color="#0f172a",
            pady=5,
            command=self.import_video_paths_file
        ).pack(side=tk.LEFT)

        ModernButton(
            top_bar,
            text="Proceed to Master Scheduler ➔",
            bg_color=THEME["success"],
            padx=14,
            pady=5,
            command=self.go_to_scheduler
        ).pack(side=tk.RIGHT, padx=(8, 0))

        ModernButton(
            top_bar,
            text="🗑️ Clear Table",
            bg_color=THEME["danger"],
            pady=5,
            command=self.clear_mapping_table
        ).pack(side=tk.RIGHT)

        act_bar = tk.Frame(tbl_body, bg=THEME["bg_card"])
        act_bar.pack(side=tk.BOTTOM, fill="x", pady=(10, 0))

        ModernButton(act_bar, text="✏️ Edit Path", bg_color="#ea580c", padx=10, pady=5, command=self.manual_edit_path_for_row).pack(side=tk.LEFT, padx=(0, 4))
        ModernButton(act_bar, text="✏️ Edit Caption", bg_color=THEME["warning"], fg_color="#0f172a", padx=10, pady=5, command=self.edit_caption_for_row).pack(side=tk.LEFT, padx=4)
        ModernButton(act_bar, text="⏰ Edit Date/Time", bg_color=THEME["info"], fg_color="#0f172a", padx=10, pady=5, command=self.edit_datetime_for_row).pack(side=tk.LEFT, padx=4)
        ModernButton(act_bar, text="❌ Remove Row", bg_color=THEME["danger"], padx=10, pady=5, command=self.delete_selected_row_tab2).pack(side=tk.LEFT, padx=4)
        ModernButton(act_bar, text="↩️ Undo (Ctrl+Z)", bg_color=THEME["purple"], padx=10, pady=5, command=self.undo_last_delete).pack(side=tk.LEFT, padx=4)

        ModernButton(
            act_bar,
            text="Proceed to Master Scheduler ➔",
            bg_color=THEME["success"],
            padx=18,
            pady=6,
            font=("Segoe UI", 10, "bold"),
            command=self.go_to_scheduler
        ).pack(side=tk.RIGHT)

        columns = ("profile", "type", "video", "caption", "date", "time", "action", "delete")
        self.tree = ttk.Treeview(tbl_body, columns=columns, show="headings", height=10, style="Modern.Treeview")
        self.tree.heading("profile", text="Profile / Real Page Name")
        self.tree.heading("type", text="Type")
        self.tree.heading("video", text="Media / Video Path (.txt list supported)")
        self.tree.heading("caption", text="Post Text / Caption")
        self.tree.heading("date", text="Schedule Date")
        self.tree.heading("time", text="Time")
        self.tree.heading("action", text="Browse")
        self.tree.heading("delete", text="Remove")

        self.tree.column("profile", width=210, anchor="w")
        self.tree.column("type", width=80, anchor="center")
        self.tree.column("video", width=240, anchor="w")
        self.tree.column("caption", width=200, anchor="w")
        self.tree.column("date", width=95, anchor="center")
        self.tree.column("time", width=65, anchor="center")
        self.tree.column("action", width=70, anchor="center")
        self.tree.column("delete", width=70, anchor="center")
        self.tree.pack(fill="both", expand=True)

        self.tree.bind("<Double-1>", self.on_table_double_click)
        self.tree.bind("<Button-1>", self.on_table_click)
        self.tree.bind("<Delete>", lambda e: self.delete_selected_row_tab2())

    def import_video_paths_file(self):
        file_path = filedialog.askopenfilename(
            title="Select Video File or Path .txt List",
            filetypes=[("Media & Text Files", "*.mp4 *.mov *.avi *.jpg *.png *.jpeg *.txt"), ("All Files", "*.*")],
            parent=self.root
        )
        if not file_path:
            return

        if file_path.lower().endswith('.txt'):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    lines = [line.strip() for line in f if line.strip() and not line.startswith('#')]

                if not lines:
                    messagebox.showwarning("Empty File", "The selected .txt file is empty!", parent=self.root)
                    return

                children = self.tree.get_children()
                if not children:
                    messagebox.showwarning("No Rows", "Please fetch or add pages to Pages & Media table first!", parent=self.root)
                    return

                for idx, item in enumerate(children):
                    if idx < len(lines):
                        v = self.tree.item(item, "values")
                        self.tree.item(item, values=(v[0], v[1], lines[idx], v[3], v[4], v[5], v[6], v[7]))

                self.log_message(f"📂 Successfully imported {len(lines)} paths from txt list: {file_path}")
                messagebox.showinfo("Success", f"Successfully assigned paths from '{os.path.basename(file_path)}' to table rows!", parent=self.root)
            except Exception as e:
                messagebox.showerror("Error", f"Could not read .txt file: {str(e)}", parent=self.root)
        else:
            selected = self.tree.selection()
            if selected:
                for item in selected:
                    v = self.tree.item(item, "values")
                    self.tree.item(item, values=(v[0], v[1], file_path, v[3], v[4], v[5], v[6], v[7]))
                self.log_message(f"Assigned media path to selected rows: {file_path}")
            else:
                for item in self.tree.get_children():
                    v = self.tree.item(item, "values")
                    self.tree.item(item, values=(v[0], v[1], file_path, v[3], v[4], v[5], v[6], v[7]))
                self.log_message(f"Assigned media path to ALL rows: {file_path}")

    def apply_bulk_caption_to_table(self):
        cap = self.txt_bulk_caption.get("1.0", tk.END).strip()
        for item in self.tree.get_children():
            vals = list(self.tree.item(item, "values"))
            vals[3] = cap
            self.tree.item(item, values=vals)
        self.log_message("Applied bulk caption to all rows.")

    def apply_bulk_time_to_table(self):
        d = self.entry_bulk_date.get().strip()
        t = self.entry_bulk_time.get().strip()
        for item in self.tree.get_children():
            vals = list(self.tree.item(item, "values"))
            vals[4] = d
            vals[5] = t
            self.tree.item(item, values=vals)
        self.log_message(f"Applied schedule {d} {t} to all rows.")

    def browse_video_for_specific_item(self, item):
        file_path = filedialog.askopenfilename(
            title="Select Media File",
            filetypes=[("Media Files", "*.mp4 *.mov *.avi *.jpg *.png *.jpeg"), ("All Files", "*.*")],
            parent=self.root
        )
        if file_path:
            v = self.tree.item(item, "values")
            self.tree.item(item, values=(v[0], v[1], file_path, v[3], v[4], v[5], v[6], v[7]))
            self.log_message(f"Assigned media to {v[0]}: {file_path}")

    def manual_edit_path_for_row(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showerror("Error", "Please select a row to edit path!", parent=self.root)
            return
        self.import_video_paths_file()

    def edit_caption_for_row(self):
        sel = self.tree.selection()
        if not sel:
            return
        vals = list(self.tree.item(sel[0], "values"))
        new_cap = simpledialog.askstring("Edit Caption", "Enter Post Text / Caption:", initialvalue=vals[3], parent=self.root)
        if new_cap is not None:
            vals[3] = new_cap
            self.tree.item(sel[0], values=vals)

    def edit_datetime_for_row(self):
        sel = self.tree.selection()
        if not sel:
            return
        vals = list(self.tree.item(sel[0], "values"))
        new_d = simpledialog.askstring("Edit Date", "Date (YYYY-MM-DD):", initialvalue=vals[4], parent=self.root)
        new_t = simpledialog.askstring("Edit Time", "Time (HH:MM):", initialvalue=vals[5], parent=self.root)
        if new_d:
            vals[4] = new_d
        if new_t:
            vals[5] = new_t
        self.tree.item(sel[0], values=vals)

    def delete_selected_row_tab2(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showerror("Error", "Please select a row from the table to delete!", parent=self.root)
            return
        for item in selected:
            vals = self.tree.item(item, "values")
            self.deleted_rows_stack.append(('tab2', vals))
            self.tree.delete(item)
            self.log_message(f"Deleted row from Pages & Media: {vals[0]}")
        self._update_kpi_badges()

    def delete_selected_row_tab3(self):
        selected = self.tree_sch.selection()
        if not selected:
            messagebox.showerror("Error", "Please select a target row from the scheduler table to remove!", parent=self.root)
            return
        for item in selected:
            vals = self.tree_sch.item(item, "values")
            self.deleted_rows_stack.append(('tab3', vals))
            self.tree_sch.delete(item)
            self.log_message(f"Removed target from Scheduler: {vals[0]}")
        self._update_kpi_badges()

    def undo_last_delete(self):
        if not self.deleted_rows_stack:
            messagebox.showinfo("Undo Info", "No recently deleted items to restore!", parent=self.root)
            return
        tab_origin, vals = self.deleted_rows_stack.pop()
        if tab_origin == 'tab2':
            if len(vals) < 8:
                vals = (*vals, "Browse", "Remove")
            self.tree.insert("", tk.END, values=vals)
        else:
            if len(vals) < 7:
                vals = (*vals, "Remove")
            self.tree_sch.insert("", tk.END, values=vals)
        self._update_kpi_badges()
        self.log_message(f"Restored item via Undo: {vals[0]}")
        messagebox.showinfo("Restored Successfully! ↩️", f"Successfully restored: {vals[0]}", parent=self.root)

    def on_table_click(self, event):
        region = self.tree.identify("region", event.x, event.y)
        if region == "cell":
            col = self.tree.identify_column(event.x)
            row_id = self.tree.identify_row(event.y)
            if not row_id:
                return
            if col == "#7":
                self.browse_video_for_specific_item(row_id)
            elif col == "#8":
                vals = self.tree.item(row_id, "values")
                self.deleted_rows_stack.append(('tab2', vals))
                self.tree.delete(row_id)
                self._update_kpi_badges()

    def on_table_double_click(self, event):
        item = self.tree.identify_row(event.y)
        if item:
            self.browse_video_for_specific_item(item)

    def on_sch_table_click(self, event):
        region = self.tree_sch.identify("region", event.x, event.y)
        if region == "cell":
            column = self.tree_sch.identify_column(event.x)
            item = self.tree_sch.identify_row(event.y)
            if column == "#7" and item:
                vals = self.tree_sch.item(item, "values")
                self.deleted_rows_stack.append(('tab3', vals))
                self.tree_sch.delete(item)
                self._update_kpi_badges()

    def open_real_file_location_or_delete(self, event):
        region = self.tree_sch.identify("region", event.x, event.y)
        if region == "cell":
            column = self.tree_sch.identify_column(event.x)
            if column == "#7":
                return
        selected = self.tree_sch.selection()
        if not selected:
            return
        v = self.tree_sch.item(selected[0], "values")
        v_path = v[2].strip(' "\'')
        if not v_path or v_path == "Not Assigned" or not os.path.exists(v_path):
            messagebox.showerror("File Error", f"Aapka select kiya hua path mojood nahi hai ya assign nahi hai:\n\n{v_path}", parent=self.root)
            return
        try:
            if platform.system() == "Windows":
                subprocess.run(['explorer', '/select,', os.path.normpath(v_path)])
            elif platform.system() == "Darwin":
                subprocess.run(['open', '-R', v_path])
            else:
                subprocess.run(['xdg-open', os.path.dirname(v_path)])
            self.log_message(f"Opened file explorer path: {v_path}")
        except Exception as e:
            messagebox.showerror("Error", f"Could not open folder: {str(e)}", parent=self.root)

    def clear_mapping_table(self):
        for item in self.tree.get_children():
            vals = self.tree.item(item, "values")
            self.deleted_rows_stack.append(('tab2', vals))
            self.tree.delete(item)
        self._update_kpi_badges()
        self.log_message("Cleared assignment mapping table.")

    def go_to_scheduler(self):
        rows = self.tree.get_children()
        if not rows:
            messagebox.showwarning(
                "No Pages Found",
                "Pages & Media table mein koi page mojood nahi hai! Pehle pages fetch ya add karein.",
                parent=self.root
            )
            return
        for item in self.tree_sch.get_children():
            self.tree_sch.delete(item)
        for item in rows:
            vals = self.tree.item(item, "values")
            self.tree_sch.insert("", tk.END, values=(vals[0], vals[1], vals[2], vals[3], vals[4], vals[5], "Remove"))
        self._update_kpi_badges()
        self.log_message(f"➡️ Transferred {len(rows)} target page(s) to Master Scheduler queue.")
        self.select_page("scheduler")

    # =========================================================================
    # --- PAGE 3: SCHEDULER & MODE SELECTOR ---
    # =========================================================================
    def setup_scheduler_tab(self):
        mode_card, mode_body = self._create_card(
            self.tab_scheduler,
            title="RPA Execution Mode & Background Engine",
            subtitle="Choose Strategy • Real-Time Schedule Trigger",
            accent_color=THEME["purple"]
        )
        mode_card.pack(fill="x", pady=(0, 12))

        self.execution_mode_var = tk.StringVar(value="Mode 1")

        modes_grid = tk.Frame(mode_body, bg=THEME["bg_card"])
        modes_grid.pack(fill="x", pady=(2, 10))

        mode_specs = [
            ("Mode 1", "Mode 1 • Reel + Synced Comment", THEME["info"]),
            ("Mode 2", "Mode 2 • App34 Shield & Reel", THEME["success"]),
            ("Mode 3", "Mode 3 • App28 Post & Comment", THEME["purple"]),
            ("Mode 4", "Mode 4 • Photo Post & Refresh", THEME["warning"]),
        ]

        for val, label, col in mode_specs:
            pill = tk.Frame(
                modes_grid,
                bg=THEME["bg_card_alt"],
                highlightbackground=THEME["border_accent"],
                highlightthickness=1
            )
            pill.pack(side=tk.LEFT, fill="x", expand=True, padx=4)
            tk.Radiobutton(
                pill,
                text=label,
                variable=self.execution_mode_var,
                value=val,
                bg=THEME["bg_card_alt"],
                fg=col,
                selectcolor=THEME["bg_app"],
                activebackground=THEME["bg_card_alt"],
                activeforeground=col,
                font=("Segoe UI", 9, "bold"),
                padx=8,
                pady=8
            ).pack(anchor="w")

        ctrl_row = tk.Frame(mode_body, bg=THEME["bg_card"])
        ctrl_row.pack(fill="x", pady=(4, 0))

        self.lbl_countdown_status = tk.Label(
            ctrl_row,
            text="Status: Background Engine is STOPPED.",
            bg=THEME["bg_card"],
            fg=THEME["danger"],
            font=("Segoe UI", 10, "bold")
        )
        self.lbl_countdown_status.pack(side=tk.LEFT)

        ModernButton(
            ctrl_row,
            text="⏹️ Stop Engine",
            bg_color=THEME["danger"],
            pady=6,
            command=self.stop_automation_engine
        ).pack(side=tk.RIGHT, padx=(6, 0))

        ModernButton(
            ctrl_row,
            text="🚀 Start Auto-Scheduler",
            bg_color=THEME["success"],
            pady=6,
            command=self.launch_automation_engine
        ).pack(side=tk.RIGHT, padx=6)

        q_card, q_body = self._create_card(
            self.tab_scheduler,
            title="Armed Target Queue & Live Inspector",
            subtitle="Double-click any row to open assigned file in Explorer",
            accent_color=THEME["info"]
        )
        q_card.pack(fill="both", expand=True)

        columns_sch = ("profile", "type", "video", "caption", "date", "time", "delete")
        self.tree_sch = ttk.Treeview(q_body, columns=columns_sch, show="headings", height=7, style="Modern.Treeview")
        self.tree_sch.heading("profile", text="Real Target / Page Name")
        self.tree_sch.heading("type", text="Type")
        self.tree_sch.heading("video", text="Assigned Media File")
        self.tree_sch.heading("caption", text="Post Text / Caption")
        self.tree_sch.heading("date", text="Scheduled Date")
        self.tree_sch.heading("time", text="Time")
        self.tree_sch.heading("delete", text="Remove")

        self.tree_sch.column("profile", width=210, anchor="w")
        self.tree_sch.column("type", width=80, anchor="center")
        self.tree_sch.column("video", width=260, anchor="w")
        self.tree_sch.column("caption", width=240, anchor="w")
        self.tree_sch.column("date", width=95, anchor="center")
        self.tree_sch.column("time", width=65, anchor="center")
        self.tree_sch.column("delete", width=70, anchor="center")
        self.tree_sch.pack(fill="both", expand=True)

        self.tree_sch.bind("<<TreeviewSelect>>", self.inspect_selected_target_details)
        self.tree_sch.bind("<Double-1>", self.open_real_file_location_or_delete)
        self.tree_sch.bind("<Button-1>", self.on_sch_table_click)
        self.tree_sch.bind("<Delete>", lambda e: self.delete_selected_row_tab3())

        sch_btns = tk.Frame(q_body, bg=THEME["bg_card"])
        sch_btns.pack(fill="x", pady=(10, 8))

        ModernButton(
            sch_btns,
            text="⚡ Execute Selected Now",
            bg_color=THEME["success"],
            pady=6,
            command=self.launch_selected_target_rpa_manually
        ).pack(side=tk.LEFT, padx=(0, 8))

        ModernButton(
            sch_btns,
            text="🔥 Execute ALL Pages Now",
            bg_color=THEME["accent"],
            pady=6,
            command=self.launch_all_targets_rpa_manually
        ).pack(side=tk.LEFT, padx=8)

        ModernButton(sch_btns, text="❌ Remove Target", bg_color=THEME["danger"], pady=6, command=self.delete_selected_row_tab3).pack(side=tk.RIGHT, padx=(6, 0))
        ModernButton(sch_btns, text="↩️ Undo (Ctrl+Z)", bg_color=THEME["purple"], pady=6, command=self.undo_last_delete).pack(side=tk.RIGHT, padx=6)

        self.txt_inspector_detail = scrolledtext.ScrolledText(
            q_body,
            height=4,
            font=("Consolas", 9),
            bg=THEME["term_bg"],
            fg=THEME["info"],
            relief="flat",
            padx=10,
            pady=8
        )
        self.txt_inspector_detail.pack(fill="x")
        self.txt_inspector_detail.insert(tk.END, "💡 Tip: Click any row above to inspect target details, or double-click to open file location in Explorer!\n")
        self.txt_inspector_detail.config(state=tk.DISABLED)

    def inspect_selected_target_details(self, event):
        selected = self.tree_sch.selection()
        if not selected:
            return
        v = self.tree_sch.item(selected[0], "values")
        detail_str = (
            f"TARGET: {v[0]} [{v[1]}]  |  SCHEDULE: {v[4]} {v[5]}  |  STATUS: Armed in Queue\n"
            f"MEDIA : {v[2].strip(' \"\'')}\n"
            f"TEXT  : {v[3]}"
        )
        self.txt_inspector_detail.config(state=tk.NORMAL)
        self.txt_inspector_detail.delete("1.0", tk.END)
        self.txt_inspector_detail.insert(tk.END, detail_str)
        self.txt_inspector_detail.config(state=tk.DISABLED)

    # =========================================================================
    # --- PAGE 4: LIVE TERMINAL ---
    # =========================================================================
    def setup_live_terminal_tab(self):
        term_card, term_body = self._create_card(
            self.tab_live_terminal,
            title="Live RPA Execution Stream",
            subtitle="Buffered High-Speed Console",
            accent_color=THEME["success"]
        )
        term_card.pack(fill="both", expand=True)

        top_ctrl = tk.Frame(term_body, bg=THEME["bg_card"])
        top_ctrl.pack(fill="x", pady=(0, 8))

        tk.Label(
            top_ctrl,
            text="● Real-time Selenium & Browser Session Telemetry",
            bg=THEME["bg_card"],
            fg=THEME["success"],
            font=("Segoe UI", 9, "bold")
        ).pack(side=tk.LEFT)

        ModernButton(
            top_ctrl,
            text="🗑️ Clear Logs",
            bg_color=THEME["danger"],
            pady=5,
            command=self.clear_live_logs
        ).pack(side=tk.RIGHT, padx=(6, 0))

        ModernButton(
            top_ctrl,
            text="🗔 Pop Out Console",
            bg_color=THEME["warning"],
            fg_color="#0f172a",
            pady=5,
            command=self.pop_out_live_terminal
        ).pack(side=tk.RIGHT, padx=6)

        self.txt_live_terminal = scrolledtext.ScrolledText(
            term_body,
            font=("Consolas", 10),
            bg=THEME["term_bg"],
            fg=THEME["term_fg"],
            insertbackground="#ffffff",
            relief="flat",
            padx=12,
            pady=12
        )
        self.txt_live_terminal.pack(fill="both", expand=True)
        self.txt_live_terminal.insert(
            tk.END,
            f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] BOOSTER PRO ENGINE INITIALIZED. Ready.\n"
        )

    def log_message(self, message):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_line = f"[{timestamp}] {message}\n"
        with self._log_lock:
            self._log_buffer.append(log_line)

    def _flush_log_buffer_loop(self):
        batch = ""
        with self._log_lock:
            if self._log_buffer:
                batch = "".join(self._log_buffer)
                self._log_buffer.clear()

        if batch:
            try:
                self.txt_live_terminal.config(state=tk.NORMAL)
                self.txt_live_terminal.insert(tk.END, batch)
                self.txt_live_terminal.see(tk.END)
                self.txt_live_terminal.config(state=tk.DISABLED)
            except Exception:
                pass

        self.root.after(150, self._flush_log_buffer_loop)

    def clear_live_logs(self):
        self.txt_live_terminal.config(state=tk.NORMAL)
        self.txt_live_terminal.delete("1.0", tk.END)
        self.txt_live_terminal.config(state=tk.DISABLED)

    def pop_out_live_terminal(self):
        pop = tk.Toplevel(self.root)
        pop.title("Live RPA Inspector")
        pop.geometry("860x620")
        pop.configure(bg=THEME["bg_app"])
        tk.Label(
            pop,
            text="🔴 Live RPA Execution Stream (System B)",
            bg=THEME["bg_app"],
            fg=THEME["info"],
            font=("Segoe UI", 11, "bold")
        ).pack(pady=8)
        pop_txt = scrolledtext.ScrolledText(
            pop,
            font=("Consolas", 10),
            bg=THEME["term_bg"],
            fg=THEME["term_fg"],
            relief="flat",
            padx=10,
            pady=10
        )
        pop_txt.pack(padx=12, pady=(0, 12), fill="both", expand=True)
        current_logs = self.txt_live_terminal.get("1.0", tk.END)
        pop_txt.insert(tk.END, current_logs)
        pop_txt.config(state=tk.DISABLED)

    # =========================================================================
    # --- MASTER ROUTING & SHARED POSTING HELPERS (NO DUPLICATION) ---
    # =========================================================================
    def execute_real_fb_post(self, target_name, target_type, media_path, caption):
        if not self.custom_chrome_exe_path or not os.path.exists(self.custom_chrome_exe_path):
            self._auto_detect_installed_browser()
        if not self.custom_chrome_exe_path or not os.path.exists(self.custom_chrome_exe_path):
            self.log_message("❌ Execution aborted: System B PC Browser (.exe) is not selected!")
            self.root.after(0, lambda: messagebox.showwarning(
                "Browser Missing",
                "Browser & Profile tab mein ja kar pehle 'Browse PC Browser (.exe)' se browser select karein!",
                parent=self.root
            ))
            return

        selected_mode = self.execution_mode_var.get()
        profile_path, profile_dir_name = self._get_external_browser_profile_info()

        self.log_message("============================================================")
        self.log_message(
            f"🚀 SYSTEM B EXECUTION | Profile: [{profile_path} -> {profile_dir_name}] "
            f"| Target: [{target_name}] ({target_type}) | Active: [{selected_mode}]"
        )
        self.log_message("============================================================")
        with self._browser_execution_lock:
            self.log_message(f"▶️ Browser slot acquired for [{target_name}] using [{selected_mode}].")
            if selected_mode == "Mode 1":
                self.execute_mode_1_app18_exact(target_name, target_type, media_path, caption)
            elif selected_mode == "Mode 2":
                self.execute_mode_2_app34_shield(target_name, target_type, media_path, caption)
            elif selected_mode == "Mode 3":
                self.execute_mode_3_app28_post_comment(target_name, target_type, media_path, caption)
            elif selected_mode == "Mode 4":
                self.execute_mode_4_photo_post(target_name, target_type, media_path, caption)
            else:
                self.execute_mode_1_app18_exact(target_name, target_type, media_path, caption)

    def _switch_to_page_if_needed(self, driver, target_name, target_type):
        if target_type == "Personal":
            return
        self.log_message(f"Executing 2-Step Switch verification for [{target_name}]...")
        try:
            switch_button = WebDriverWait(driver, 6).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//div[@aria-label='Switch Now' or @aria-label='Switch' or text()='Switch Now'] | //span[text()='Switch Now' or text()='Switch']")
                )
            )
            driver.execute_script("arguments[0].click();", switch_button)
            self.log_message("🔄 Step 1: 'Switch Now' button clicked successfully!")
            time.sleep(4)
            self.handle_cookie_popups_if_any(driver)
        except Exception:
            pass

        popup_wait_start = time.time()
        while time.time() - popup_wait_start < 15:
            self.handle_cookie_popups_if_any(driver)
            try:
                popup_switch_btn = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable(
                        (By.XPATH, "//div[@role='dialog']//div[@role='button' and (text()='Switch' or contains(., 'Switch'))] | //div[@role='dialog']//span[text()='Switch']")
                    )
                )
                driver.execute_script("arguments[0].click();", popup_switch_btn)
                self.log_message("✅ Step 2: Popup 'Switch' confirmation button successfully clicked!")
                time.sleep(8)
                self.handle_cookie_popups_if_any(driver)
                break
            except Exception:
                pass
            time.sleep(1)

    def _comment_on_first_reel(self, driver, target_url, target_name, caption, mode_label):
        for attempt in range(1, 4):
            try:
                self.log_message(f"🔄 {mode_label} Auto-Comment Attempt {attempt}/3: Navigating to Reels tab...")
                self._navigate_in_same_browser(driver, target_url)
                time.sleep(5)
                self.handle_cookie_popups_if_any(driver)

                reels_tab_xpath = (
                    "//span[normalize-space(.)='Reels' and not(ancestor::div[@role='dialog'])] | "
                    "//a[@role='tab' and contains(., 'Reels')] | "
                    "//span[text()='Reels']/ancestor::a"
                )
                reels_tab = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, reels_tab_xpath))
                )
                driver.execute_script("arguments[0].click();", reels_tab)
                time.sleep(6)
                self.handle_cookie_popups_if_any(driver)

                first_reel_xpath = (
                    "(//div[@role='main']//div[@role='grid']//a[contains(@href, '/reel/')])[1] | "
                    "(//div[@role='main']//a[contains(@href, '/reel/')])[1]"
                )
                first_reel = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, first_reel_xpath))
                )
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", first_reel)
                time.sleep(2)
                driver.execute_script("arguments[0].click();", first_reel)
                time.sleep(5)
                self.handle_cookie_popups_if_any(driver)

                comment_icon_xpath = (
                    "//div[@aria-label='Comment' and @role='button'] | "
                    "//div[contains(@aria-label, 'Comment') and @role='button'] | "
                    "//div[@aria-label='Leave a comment' and @role='button'] | "
                    "//span[text()='Comment']/ancestor::div[@role='button']"
                )
                try:
                    comment_icon = WebDriverWait(driver, 8).until(
                        EC.element_to_be_clickable((By.XPATH, comment_icon_xpath))
                    )
                    driver.execute_script("arguments[0].click();", comment_icon)
                    self.log_message("✅ Comment icon successfully clicked!")
                    time.sleep(2)
                except Exception:
                    pass

                comment_box_xpath = (
                    "//div[@aria-label='Write a comment…' and @role='textbox'] | "
                    "//div[@aria-label='Write a comment' and @role='textbox'] | "
                    "//div[contains(@aria-label, 'Write a comment') and @role='textbox'] | "
                    "//div[@contenteditable='true' and @role='textbox']"
                )
                comment_box = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, comment_box_xpath))
                )
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", comment_box)
                time.sleep(2)
                try:
                    comment_box.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", comment_box)
                time.sleep(1)

                comment_box.send_keys(caption)
                time.sleep(2)
                comment_box.send_keys(Keys.RETURN)

                self.log_message(f"✅ SUCCESS: Comment successfully auto-posted in {mode_label} on [{target_name}]!")
                time.sleep(4)
                break
            except Exception as c_try_err:
                self.log_message(f"⚠️ {mode_label} comment attempt {attempt} notice: {str(c_try_err)}")
                time.sleep(4)

    # --- MODE 1: REEL POST + SYNCED REEL COMMENT ---
    def execute_mode_1_app18_exact(self, target_name, target_type, video_path, caption):
        target_url = self.page_urls_map.get(target_name, "https://www.facebook.com/")
        self.log_message(f"🎯 [MODE 1 - REEL RPA + SYNCED COMMENT] Starting execution in SAME browser for [{target_name}] -> {target_url}")

        driver = self._create_mode_driver()
        wait = WebDriverWait(driver, 25)
        success_completed = False

        try:
            self._navigate_in_same_browser(driver, target_url)
            time.sleep(3)
            self.handle_cookie_popups_if_any(driver)
            time.sleep(2)
            self.handle_cookie_popups_if_any(driver)

            self._switch_to_page_if_needed(driver, target_name, target_type)

            self.log_message("Opening post composer feed box...")
            self.handle_cookie_popups_if_any(driver)
            create_post_xpath = "//span[contains(text(), \"What's on your mind\")] | //div[@aria-label=\"Create a post\" and not(contains(@style, 'profile'))]"
            post_box = wait.until(EC.element_to_be_clickable((By.XPATH, create_post_xpath)))
            driver.execute_script("arguments[0].click();", post_box)
            time.sleep(3)
            self.handle_cookie_popups_if_any(driver)

            self.log_message("Opening Photo/video uploader inside post modal...")
            try:
                photo_btn = wait.until(
                    EC.element_to_be_clickable((By.XPATH, "//div[@role='dialog']//div[@aria-label='Photo/video' or @aria-label='Photo/Video' or contains(@aria-label, 'Photo')]"))
                )
                driver.execute_script("arguments[0].click();", photo_btn)
                time.sleep(3)
            except Exception as p_err:
                self.log_message(f"Photo/video button click notice: {p_err}")

            if video_path and video_path != "Not Assigned" and os.path.exists(video_path):
                full_file_path = os.path.abspath(video_path)
                self.log_message(f"📁 Injecting assigned media path: {full_file_path}")
                try:
                    file_inputs = driver.find_elements(By.XPATH, "//div[@role='dialog']//input[@type='file']")
                    if not file_inputs:
                        file_inputs = driver.find_elements(By.XPATH, "//input[@type='file']")

                    target_file_input = None
                    for fi in file_inputs:
                        accept_attr = fi.get_attribute("accept") or ""
                        if "image" not in accept_attr.lower() or "video" in accept_attr.lower():
                            target_file_input = fi
                            break

                    if not target_file_input and file_inputs:
                        target_file_input = file_inputs[-1]

                    if target_file_input:
                        driver.execute_script("arguments[0].style.display = 'block'; arguments[0].style.visibility = 'visible';", target_file_input)
                        target_file_input.send_keys(full_file_path)
                        self.log_message("✅ Video path successfully injected into media input!")
                    else:
                        raise Exception("No valid video upload input found in DOM!")

                    self.log_message("⏳ Waiting for video upload and server rendering (20s)...")
                    time.sleep(20)
                except Exception as media_err:
                    self.log_message(f"❌ Media upload error: {media_err}")

            self.log_message("Entering description / caption / tags in wizard...")
            try:
                text_box_xpath = (
                    "//div[@role='dialog']//div[@contenteditable='true' and @role='textbox'] | "
                    "//div[@role='dialog']//textarea | "
                    "//div[@aria-label='Description'] | "
                    "//input[contains(@placeholder, 'Add tags') or @aria-label='Add tags'] | "
                    "//div[@role='dialog']//input[@type='text']"
                )
                text_box = wait.until(EC.element_to_be_clickable((By.XPATH, text_box_xpath)))
                text_box.click()
                time.sleep(1)
                text_box.send_keys(caption)
                self.log_message("✅ Description / Caption / Tags successfully entered!")
                time.sleep(2)
            except Exception as cap_err:
                self.log_message(f"Caption entry notice (or already filled): {cap_err}")

            self.log_message("Navigating through wizard steps and clicking blue 'Next' buttons...")
            for step in range(6):
                try:
                    post_btn_xpath = (
                        "//div[@role='dialog']//div[@aria-label='Post' and @role='button'] | "
                        "//div[@role='dialog']//div[normalize-space(.)='Post' and @role='button'] | "
                        "//div[@role='dialog']//div[normalize-space(.)='Publish' and @role='button'] | "
                        "//div[@role='dialog']//div[normalize-space(.)='Share' and @role='button']"
                    )
                    post_btns = driver.find_elements(By.XPATH, post_btn_xpath)
                    if post_btns:
                        driver.execute_script("arguments[0].click();", post_btns[-1])
                        self.log_message("🚀 Final 'Post' / 'Publish' button clicked successfully!")
                        break

                    next_btns = driver.find_elements(By.XPATH, "//div[@role='dialog']//div[@role='button'][normalize-space(.)='Next']")
                    valid_next_btn = None
                    for nb in next_btns:
                        aria = nb.get_attribute("aria-label") or ""
                        if "back" not in aria.lower() and nb.is_displayed():
                            valid_next_btn = nb
                            break

                    if valid_next_btn:
                        driver.execute_script("arguments[0].click();", valid_next_btn)
                        self.log_message(f"➡️ Blue 'Next' button clicked successfully (Step {step+1})!")
                        time.sleep(5)
                    else:
                        time.sleep(3)
                except Exception as w_err:
                    self.log_message(f"Wizard navigation notice: {w_err}")
                    time.sleep(2)

            self.log_message("⏳ Waiting 18s for reel publication to settle on page...")
            time.sleep(18)

            self.log_message("💬 Applying Synced Reel comment logic in Mode 1...")
            self._comment_on_first_reel(driver, target_url, target_name, caption, "Mode 1")

            safe_targ = "".join(c if c.isalnum() else "_" for c in target_name)
            proof_file = os.path.join(self.proofs_dir, f"proof_SysB_Mode1_{safe_targ}_{int(time.time())}.png")
            driver.save_screenshot(proof_file)
            self.log_message(f"✅ MODE 1 TASK COMPLETED | Target: [{target_name}]! Screenshot: {proof_file}")
            success_completed = True

        except Exception as e:
            self.log_message(f"❌ Mode 1 RPA Error on [{target_name}]: {str(e)}")
        finally:
            if success_completed:
                self._finalize_target_after_proof(target_name, close_if_queue_empty=True)

    # --- MODE 2: APP34 SHIELD + REEL COMMENT ---
    def execute_mode_2_app34_shield(self, target_name, target_type, media_path, caption):
        target_url = self.page_urls_map.get(target_name, "https://www.facebook.com/")
        self.log_message(f"🎯 [MODE 2 - SHIELD RPA + COOKIE SHIELD] Starting execution in SAME browser for [{target_name}] -> {target_url}")

        driver = self._create_mode_driver()
        wait = WebDriverWait(driver, 15)
        success_completed = False

        is_photo = False
        if media_path and media_path != "Not Assigned" and os.path.exists(media_path):
            if os.path.splitext(media_path)[1].lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                is_photo = True

        try:
            self._navigate_in_same_browser(driver, target_url)
            time.sleep(2)
            self.handle_cookie_popups_if_any(driver)

            if target_type == "Personal":
                try:
                    avatar_xpath = "//span[contains(text(), \"What's on your mind\")]/ancestor::div[contains(@class, 'x1i10hfl')]/preceding-sibling::div//img"
                    avatar_el = wait.until(EC.element_to_be_clickable((By.XPATH, avatar_xpath)))
                    driver.execute_script("arguments[0].click();", avatar_el)
                    time.sleep(2)
                except Exception:
                    self._navigate_in_same_browser(driver, "https://www.facebook.com/profile.php")
                    time.sleep(2)
            else:
                try:
                    switch_btn = WebDriverWait(driver, 4).until(
                        EC.element_to_be_clickable((By.XPATH, "//div[@aria-label='Switch Now' or text()='Switch Now']"))
                    )
                    driver.execute_script("arguments[0].click();", switch_btn)
                    time.sleep(3)
                except Exception:
                    pass

            self.handle_cookie_popups_if_any(driver)

            if is_photo:
                post_box = wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), \"What's on your mind\")]")))
                driver.execute_script("arguments[0].click();", post_box)
                time.sleep(1)
            else:
                try:
                    reel_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), 'Reel')]")))
                    driver.execute_script("arguments[0].click();", reel_btn)
                    time.sleep(2)
                except Exception:
                    post_box = wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), \"What's on your mind\")]")))
                    driver.execute_script("arguments[0].click();", post_box)
                    time.sleep(1)

            if media_path and media_path != "Not Assigned" and os.path.exists(media_path):
                file_inputs = driver.find_elements(By.XPATH, "//input[@type='file']")
                if file_inputs:
                    fi = file_inputs[-1]
                    driver.execute_script("arguments[0].style.display = 'block';", fi)
                    fi.send_keys(os.path.abspath(media_path))
                    time.sleep(15 if not is_photo else 8)

            try:
                tb = wait.until(EC.element_to_be_clickable((By.XPATH, "//div[@role='dialog']//div[@contenteditable='true' and @role='textbox']")))
                tb.send_keys(caption)
                time.sleep(1)
            except Exception:
                pass

            for _ in range(5):
                p_btns = driver.find_elements(By.XPATH, "//div[@role='dialog']//div[@aria-label='Post' and @role='button']")
                if p_btns:
                    driver.execute_script("arguments[0].click();", p_btns[-1])
                    break
                next_btns = driver.find_elements(By.XPATH, "//div[@role='dialog']//div[@role='button'][normalize-space(.)='Next']")
                if next_btns:
                    driver.execute_script("arguments[0].click();", next_btns[0])
                    time.sleep(2)

            time.sleep(12)
            self.handle_cookie_popups_if_any(driver)

            self.log_message("💬 Applying Reel comment logic in Mode 2...")
            self._comment_on_first_reel(driver, target_url, target_name, caption, "Mode 2")

            safe_targ = "".join(c if c.isalnum() else "_" for c in target_name)
            proof_file = os.path.join(self.proofs_dir, f"proof_SysB_Mode2_{safe_targ}_{int(time.time())}.png")
            driver.save_screenshot(proof_file)
            self.log_message(f"✅ MODE 2 TASK COMPLETED | Target: [{target_name}]! Screenshot: {proof_file}")
            success_completed = True
        except Exception as e:
            self.log_message(f"❌ Mode 2 Error on [{target_name}]: {str(e)}")
        finally:
            if success_completed:
                self._finalize_target_after_proof(target_name, close_if_queue_empty=True)

    # --- MODE 3: APP28 POST & COMMENT ---
    def execute_mode_3_app28_post_comment(self, target_name, target_type, video_path, caption):
        target_url = self.page_urls_map.get(target_name, "https://www.facebook.com/")
        self.log_message(f"🎯 [MODE 3 - APP28 POST RPA + COOKIE SHIELD] Starting execution in SAME browser for [{target_name}] -> {target_url}")

        driver = self._create_mode_driver()
        wait = WebDriverWait(driver, 25)
        success_completed = False

        try:
            self._navigate_in_same_browser(driver, target_url)
            time.sleep(3)
            self.handle_cookie_popups_if_any(driver)
            time.sleep(3)
            self.handle_cookie_popups_if_any(driver)

            if target_type != "Personal":
                self._switch_to_page_if_needed(driver, target_name, target_type)
            else:
                self.log_message(f"Target [{target_name}] is Personal Profile...")
                self.handle_cookie_popups_if_any(driver)
                try:
                    profile_avatar_xpath = (
                        "//span[contains(text(), \"What's on your mind\")]/ancestor::div[contains(@class, 'x1i10hfl') or contains(@role, 'button')]/preceding-sibling::div//img | "
                        "//div[contains(@aria-label, \"What's on your mind\")]//preceding-sibling::div//img | "
                        "//span[contains(text(), \"What's on your mind\")]/ancestor::div[2]//img"
                    )
                    avatar_el = wait.until(EC.element_to_be_clickable((By.XPATH, profile_avatar_xpath)))
                    driver.execute_script("arguments[0].click();", avatar_el)
                    time.sleep(5)
                    self.handle_cookie_popups_if_any(driver)
                except Exception:
                    self._navigate_in_same_browser(driver, "https://www.facebook.com/profile.php")
                    time.sleep(5)
                    self.handle_cookie_popups_if_any(driver)

            self.log_message("Opening post composer feed box...")
            self.handle_cookie_popups_if_any(driver)
            create_post_xpath = "//span[contains(text(), \"What's on your mind\")] | //div[@aria-label=\"Create a post\" and not(contains(@style, 'profile'))]"
            post_box = wait.until(EC.element_to_be_clickable((By.XPATH, create_post_xpath)))
            driver.execute_script("arguments[0].click();", post_box)
            time.sleep(3)
            self.handle_cookie_popups_if_any(driver)

            self.log_message("Opening Photo/video uploader inside post modal...")
            try:
                photo_btn = wait.until(
                    EC.element_to_be_clickable((By.XPATH, "//div[@role='dialog']//div[@aria-label='Photo/video' or @aria-label='Photo/Video' or contains(@aria-label, 'Photo')]"))
                )
                driver.execute_script("arguments[0].click();", photo_btn)
                time.sleep(3)
            except Exception as p_err:
                self.log_message(f"Photo/video button click notice: {p_err}")

            if video_path and video_path != "Not Assigned" and os.path.exists(video_path):
                full_file_path = os.path.abspath(video_path)
                self.log_message(f"📁 Injecting assigned media path: {full_file_path}")
                try:
                    file_inputs = driver.find_elements(By.XPATH, "//div[@role='dialog']//input[@type='file']")
                    if not file_inputs:
                        file_inputs = driver.find_elements(By.XPATH, "//input[@type='file']")
                    target_file_input = None
                    for fi in file_inputs:
                        accept_attr = fi.get_attribute("accept") or ""
                        if "image" not in accept_attr.lower() or "video" in accept_attr.lower():
                            target_file_input = fi
                            break

                    if not target_file_input and file_inputs:
                        target_file_input = file_inputs[-1]

                    if target_file_input:
                        driver.execute_script("arguments[0].style.display = 'block'; arguments[0].style.visibility = 'visible';", target_file_input)
                        target_file_input.send_keys(full_file_path)
                        self.log_message("✅ Video path successfully injected into media input!")
                    else:
                        raise Exception("No valid video upload input found in DOM!")

                    self.log_message("⏳ Waiting for video upload and server rendering (20s)...")
                    time.sleep(20)
                except Exception as media_err:
                    self.log_message(f"❌ Media upload error: {media_err}")

            self.log_message("Entering description / caption / tags in wizard...")
            try:
                text_box_xpath = (
                    "//div[@role='dialog']//div[@contenteditable='true' and @role='textbox'] | "
                    "//div[@role='dialog']//textarea | "
                    "//div[@aria-label='Description'] | "
                    "//input[contains(@placeholder, 'Add tags') or @aria-label='Add tags'] | "
                    "//div[@role='dialog']//input[@type='text']"
                )
                text_box = wait.until(EC.element_to_be_clickable((By.XPATH, text_box_xpath)))
                text_box.click()
                time.sleep(1)
                text_box.send_keys(caption)
                self.log_message("✅ Description / Caption / Tags successfully entered!")
                time.sleep(2)
            except Exception as cap_err:
                self.log_message(f"Caption entry notice (or already filled): {cap_err}")

            self.log_message("Navigating through wizard steps and clicking blue 'Next' buttons...")
            for step in range(6):
                try:
                    post_btn_xpath = (
                        "//div[@role='dialog']//div[@aria-label='Post' and @role='button'] | "
                        "//div[@role='dialog']//div[normalize-space(.)='Post' and @role='button'] | "
                        "//div[@role='dialog']//div[normalize-space(.)='Publish' and @role='button'] | "
                        "//div[@role='dialog']//div[normalize-space(.)='Share' and @role='button']"
                    )
                    post_btns = driver.find_elements(By.XPATH, post_btn_xpath)
                    if post_btns:
                        driver.execute_script("arguments[0].click();", post_btns[-1])
                        self.log_message("🚀 Final 'Post' / 'Publish' button clicked successfully!")
                        break

                    next_btns = driver.find_elements(By.XPATH, "//div[@role='dialog']//div[@role='button'][normalize-space(.)='Next']")
                    valid_next_btn = None
                    for nb in next_btns:
                        aria = nb.get_attribute("aria-label") or ""
                        if "back" not in aria.lower() and nb.is_displayed():
                            valid_next_btn = nb
                            break

                    if valid_next_btn:
                        driver.execute_script("arguments[0].click();", valid_next_btn)
                        self.log_message(f"➡️ Blue 'Next' button clicked successfully (Step {step+1})!")
                        time.sleep(5)
                    else:
                        time.sleep(3)
                except Exception as w_err:
                    self.log_message(f"Wizard navigation notice: {w_err}")
                    time.sleep(2)

            self.log_message("⏳ Waiting for post submission and feed update (15s)...")
            time.sleep(15)

            driver.refresh()
            time.sleep(4)
            self.handle_cookie_popups_if_any(driver)
            time.sleep(4)

            self.log_message("💬 Locating comment box on newly created post...")
            comment_xpaths = [
                "//div[@aria-label='Write a comment' and @role='textbox']",
                "//div[@contenteditable='true' and @aria-label='Write a comment']",
                "//form//div[@contenteditable='true' and @role='textbox']",
                "//div[contains(@aria-label, 'Write a comment')]//div[@contenteditable='true']",
                "//div[contains(@class, 'notranslate') and @contenteditable='true' and @role='textbox']"
            ]

            for c_xpath in comment_xpaths:
                try:
                    comment_boxes = driver.find_elements(By.XPATH, c_xpath)
                    if comment_boxes:
                        c_box = comment_boxes[0]
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", c_box)
                        time.sleep(1.5)
                        c_box.click()
                        time.sleep(1)
                        c_box.send_keys(caption)
                        time.sleep(1.5)
                        c_box.send_keys(Keys.RETURN)
                        self.log_message(f"✅ SUCCESS: Caption automatically posted as comment on [{target_name}]!")
                        time.sleep(4)
                        break
                except Exception:
                    continue

            safe_targ = "".join(c if c.isalnum() else "_" for c in target_name)
            proof_file = os.path.join(self.proofs_dir, f"proof_SysB_Mode3_{safe_targ}_{int(time.time())}.png")
            driver.save_screenshot(proof_file)
            self.log_message(f"✅ MODE 3 TASK COMPLETED | Target: [{target_name}]! Screenshot: {proof_file}")
            success_completed = True

        except Exception as e:
            self.log_message(f"❌ Mode 3 RPA Error on [{target_name}]: {str(e)}")
        finally:
            if success_completed:
                self._finalize_target_after_proof(target_name, close_if_queue_empty=True)

    # --- MODE 4: PHOTO POST + REFRESH + PHOTO.PHP COMMENT ---
    def execute_mode_4_photo_post(self, target_name, target_type, media_path, caption):
        target_url = self.page_urls_map.get(target_name, "https://www.facebook.com/")
        self.log_message(f"🎯 [MODE 4 - PHOTO POST & REFRESH VERIFICATION] Starting execution in SAME browser for [{target_name}] -> {target_url}")

        driver = self._create_mode_driver()
        wait = WebDriverWait(driver, 15)
        success_completed = False

        try:
            self._navigate_in_same_browser(driver, target_url)
            time.sleep(3)
            self.handle_cookie_popups_if_any(driver)

            if target_type != "Personal":
                self._switch_to_page_if_needed(driver, target_name, target_type)
            else:
                try:
                    avatar_xpath = "//span[contains(text(), \"What's on your mind\")]/ancestor::div[contains(@class, 'x1i10hfl')]/preceding-sibling::div//img"
                    avatar_el = wait.until(EC.element_to_be_clickable((By.XPATH, avatar_xpath)))
                    driver.execute_script("arguments[0].click();", avatar_el)
                    time.sleep(2)
                except Exception:
                    self._navigate_in_same_browser(driver, "https://www.facebook.com/profile.php")
                    time.sleep(2)

            self.handle_cookie_popups_if_any(driver)

            self.log_message("Opening post composer feed box...")
            create_post_xpath = "//span[contains(text(), \"What's on your mind\")] | //div[@aria-label=\"Create a post\" and not(contains(@style, 'profile'))]"
            post_box = wait.until(EC.element_to_be_clickable((By.XPATH, create_post_xpath)))
            driver.execute_script("arguments[0].click();", post_box)
            time.sleep(3)
            self.handle_cookie_popups_if_any(driver)

            self.log_message("Opening Photo/video uploader inside post modal...")
            try:
                photo_btn = wait.until(
                    EC.element_to_be_clickable((By.XPATH, "//div[@role='dialog']//div[@aria-label='Photo/video' or @aria-label='Photo/Video' or contains(@aria-label, 'Photo')]"))
                )
                driver.execute_script("arguments[0].click();", photo_btn)
                time.sleep(3)
            except Exception as p_err:
                self.log_message(f"Photo/video button click notice: {p_err}")

            if media_path and media_path != "Not Assigned" and os.path.exists(media_path):
                full_file_path = os.path.abspath(media_path)
                self.log_message(f"📁 Injecting assigned photo path: {full_file_path}")
                try:
                    file_inputs = driver.find_elements(By.XPATH, "//div[@role='dialog']//input[@type='file']")
                    if not file_inputs:
                        file_inputs = driver.find_elements(By.XPATH, "//input[@type='file']")
                    target_file_input = file_inputs[-1] if file_inputs else None

                    if target_file_input:
                        driver.execute_script("arguments[0].style.display = 'block'; arguments[0].style.visibility = 'visible';", target_file_input)
                        target_file_input.send_keys(full_file_path)
                        self.log_message("✅ Photo path successfully injected into uploader!")
                        time.sleep(8)
                    else:
                        raise Exception("No file input found for photo upload!")
                except Exception as upload_err:
                    self.log_message(f"❌ Photo upload error: {upload_err}")

            try:
                text_box_xpath = "//div[@role='dialog']//div[@contenteditable='true' and @role='textbox'] | //div[@role='dialog']//textarea"
                text_box = wait.until(EC.element_to_be_clickable((By.XPATH, text_box_xpath)))
                text_box.click()
                time.sleep(1)
                text_box.send_keys(caption)
                self.log_message("✅ Caption entered successfully in photo composer!")
                time.sleep(2)
            except Exception as cap_err:
                self.log_message(f"Caption entry notice: {cap_err}")

            for _ in range(5):
                p_btns = driver.find_elements(By.XPATH, "//div[@role='dialog']//div[@aria-label='Post' and @role='button']")
                if p_btns:
                    driver.execute_script("arguments[0].click();", p_btns[-1])
                    self.log_message("🚀 Final 'Post' button clicked successfully!")
                    break
                next_btns = driver.find_elements(By.XPATH, "//div[@role='dialog']//div[@role='button'][normalize-space(.)='Next']")
                if next_btns:
                    driver.execute_script("arguments[0].click();", next_btns[0])
                    time.sleep(2)

            self.log_message("⏳ Waiting 12s for photo publication to settle...")
            time.sleep(12)

            self.log_message("🔄 Refreshing browser to ensure the newly published post is fully visible...")
            driver.refresh()
            time.sleep(5)
            self.handle_cookie_popups_if_any(driver)
            time.sleep(3)

            self.log_message("💬 Clicking 'Photos' tab and locating exact photo.php / fbid post link...")
            for attempt in range(1, 4):
                try:
                    self.log_message(f"🔄 Mode 4 Auto-Comment Attempt {attempt}/3: Opening Photos tab...")
                    self.handle_cookie_popups_if_any(driver)

                    photos_tab_xpath = (
                        "//div[@role='main']//span[normalize-space(.)='Photos' and not(ancestor::div[@role='dialog'])] | "
                        "//a[@role='tab' and contains(., 'Photos')] | "
                        "//span[text()='Photos']/ancestor::a"
                    )
                    photos_tab = WebDriverWait(driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, photos_tab_xpath))
                    )
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", photos_tab)
                    time.sleep(1)
                    driver.execute_script("arguments[0].click();", photos_tab)
                    self.log_message("✅ 'Photos' tab clicked successfully!")
                    time.sleep(6)
                    self.handle_cookie_popups_if_any(driver)

                    driver.execute_script("window.scrollBy(0, 350);")
                    time.sleep(2)

                    photo_opened = False
                    target_photo_link = None
                    target_photo_href = None

                    exact_xpaths = [
                        "(//div[@role='main']//a[contains(@href, 'photo.php?fbid=') or contains(@href, '/photos/')] | //a[contains(@href, 'photo.php?fbid=')])[1]",
                        "(//*[normalize-space(text())='Your photos' or normalize-space(text())='Your Photos'])[last()]/following::a[contains(@href, 'photo.php') or contains(@href, 'fbid=')][1]",
                        "(//div[@role='main']//a[contains(@href, 'fbid=')])[1]"
                    ]

                    for ex in exact_xpaths:
                        els = driver.find_elements(By.XPATH, ex)
                        for el in els:
                            if el.is_displayed():
                                target_photo_link = el
                                target_photo_href = el.get_attribute("href")
                                break
                        if target_photo_link:
                            break

                    if target_photo_link:
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", target_photo_link)
                        time.sleep(1.5)
                        try:
                            ActionChains(driver).move_to_element(target_photo_link).pause(0.5).click().perform()
                        except Exception:
                            driver.execute_script("arguments[0].click();", target_photo_link)
                        time.sleep(5)
                        self.handle_cookie_popups_if_any(driver)

                        if ("photo.php" in driver.current_url.lower() or "fbid=" in driver.current_url.lower() or
                                len(driver.find_elements(By.XPATH, "//div[contains(@aria-label, 'Write a comment') and @role='textbox']")) > 0):
                            photo_opened = True

                    if not photo_opened and target_photo_href and "facebook.com" in target_photo_href:
                        self._navigate_in_same_browser(driver, target_photo_href)
                        time.sleep(6)
                        self.handle_cookie_popups_if_any(driver)
                        photo_opened = True

                    if not photo_opened:
                        raise Exception("Could not locate or open the target photo.php link.")

                    comment_icon_xpath = (
                        "//div[@aria-label='Comment' and @role='button'] | "
                        "//div[contains(@aria-label, 'Comment') and @role='button'] | "
                        "//div[@aria-label='Leave a comment' and @role='button'] | "
                        "//span[text()='Comment']/ancestor::div[@role='button']"
                    )
                    try:
                        comment_icon = WebDriverWait(driver, 6).until(
                            EC.element_to_be_clickable((By.XPATH, comment_icon_xpath))
                        )
                        driver.execute_script("arguments[0].click();", comment_icon)
                        self.log_message("✅ Comment button clicked!")
                        time.sleep(2)
                    except Exception:
                        pass

                    comment_box_xpath = (
                        "//div[@aria-label='Write a comment…' and @role='textbox'] | "
                        "//div[@aria-label='Write a comment' and @role='textbox'] | "
                        "//div[contains(@aria-label, 'Write a comment') and @role='textbox'] | "
                        "//div[contains(@aria-label, 'Comment as') and @role='textbox'] | "
                        "//div[@contenteditable='true' and @role='textbox']"
                    )
                    comment_boxes = WebDriverWait(driver, 10).until(
                        lambda d: [el for el in d.find_elements(By.XPATH, comment_box_xpath) if el.is_displayed()]
                    )
                    comment_box = comment_boxes[-1]
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", comment_box)
                    time.sleep(1.5)
                    try:
                        ActionChains(driver).move_to_element(comment_box).click().perform()
                    except Exception:
                        driver.execute_script("arguments[0].click();", comment_box)
                    time.sleep(1)

                    comment_box.send_keys(caption)
                    time.sleep(2)
                    comment_box.send_keys(Keys.RETURN)

                    self.log_message(f"✅ SUCCESS: Comment successfully auto-posted in Mode 4 on [{target_name}] photo.php post!")
                    time.sleep(4)
                    break
                except Exception as c_try_err:
                    self.log_message(f"⚠️ Mode 4 comment attempt {attempt} notice: {str(c_try_err)}")
                    time.sleep(3)

            safe_targ = "".join(c if c.isalnum() else "_" for c in target_name)
            proof_file = os.path.join(self.proofs_dir, f"proof_SysB_Mode4_{safe_targ}_{int(time.time())}.png")
            driver.save_screenshot(proof_file)
            self.log_message(f"✅ MODE 4 TASK COMPLETED | Target: [{target_name}]! Screenshot: {proof_file}")
            success_completed = True
        except Exception as e:
            self.log_message(f"❌ Mode 4 Error on [{target_name}]: {str(e)}")
        finally:
            if success_completed:
                self._finalize_target_after_proof(target_name, close_if_queue_empty=True)

    # =========================================================================
    # --- SCHEDULER & CLOCK ENGINE ---
    # =========================================================================
    def remove_target_from_scheduler(self, target_name):
        def _remove():
            for item in self.tree_sch.get_children():
                vals = self.tree_sch.item(item, "values")
                if vals and vals[0] == target_name:
                    self.tree_sch.delete(item)
                    self.log_message(f"🗑️ Completed target [{target_name}] removed from Scheduler queue.")
                    break
            self._update_kpi_badges()
        self.root.after(0, _remove)

    def launch_selected_target_rpa_manually(self):
        sel = self.tree_sch.selection()
        if not sel:
            messagebox.showwarning("Select Target", "Please select a target row from the scheduler table!", parent=self.root)
            return
        vals = self.tree_sch.item(sel[0], "values")
        self.select_page("terminal")
        threading.Thread(
            target=self.execute_real_fb_post,
            args=(vals[0], vals[1], vals[2], vals[3]),
            daemon=True
        ).start()

    def launch_all_targets_rpa_manually(self):
        items = self.tree_sch.get_children()
        rows = [tuple(self.tree_sch.item(item, "values")) for item in items]
        if not rows:
            messagebox.showwarning("No Targets", "No pages available in Scheduler table!", parent=self.root)
            return
        self.select_page("terminal")
        self.log_message("🚀 Starting batch execution for ALL targets on System B...")
        def batch_worker():
            for vals in rows:
                try:
                    self.execute_real_fb_post(vals[0], vals[1], vals[2], vals[3])
                except Exception as batch_err:
                    self.log_message(f"❌ Batch item failed for {vals[0]}: {batch_err}")
                time.sleep(5)
            self.log_message("✨ Batch posting session finished. Check terminal for individual results.")
        threading.Thread(target=batch_worker, daemon=True).start()

    def start_live_clock(self):
        def update_clock():
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.lbl_live_clock.config(text=f"🕒 {now_str}")
            self.root.after(1000, update_clock)
        update_clock()

    def _sync_engine_ui_badges(self, running):
        if running:
            self.lbl_countdown_status.config(
                text="Status: System B Background Engine is RUNNING...", fg=THEME["success"]
            )
            self.lbl_sidebar_engine.config(text="● RUNNING", fg=THEME["success"])
            self.lbl_top_status_pill.config(
                text="● ENGINE RUNNING", bg=THEME["success_bg"], fg="#6ee7b7"
            )
        else:
            self.lbl_countdown_status.config(
                text="Status: Background Engine is STOPPED.", fg=THEME["danger"]
            )
            self.lbl_sidebar_engine.config(text="● STOPPED", fg=THEME["danger"])
            self.lbl_top_status_pill.config(
                text="● ENGINE STOPPED", bg=THEME["danger_bg"], fg="#fca5a5"
            )

    def launch_automation_engine(self):
        if self.engine_running:
            messagebox.showinfo("Engine Status", "Background Engine is already running!", parent=self.root)
            return
        self.engine_running = True
        self._sync_engine_ui_badges(True)
        self.log_message("🟢 System B Background Auto-Scheduler Engine STARTED.")
        self._scheduler_tick()

    def _scheduler_tick(self):
        if not self.engine_running:
            self._scheduler_after_id = None
            return

        now = datetime.now()
        try:
            rows = list(self.tree_sch.get_children())
            for item in rows:
                try:
                    vals = self.tree_sch.item(item, "values")
                    if len(vals) < 6:
                        continue
                    target_name = str(vals[0]).strip()
                    sched_dt = datetime.strptime(
                        f"{vals[4]} {vals[5]}", "%Y-%m-%d %H:%M"
                    )
                    job_key = (target_name, str(vals[4]), str(vals[5]))
                    if now < sched_dt or job_key in self._scheduled_attempted:
                        continue

                    self._scheduled_attempted.add(job_key)
                    self.log_message(
                        f"⏰ Due schedule detected: {target_name} at {vals[4]} {vals[5]}"
                    )
                    worker = threading.Thread(
                        target=self._run_scheduled_job,
                        args=(tuple(vals), job_key),
                        daemon=True
                    )
                    with self._scheduler_lock:
                        self._scheduler_workers.add(worker)
                    worker.start()
                except Exception as row_err:
                    self.log_message(f"⚠️ Scheduler row skipped: {row_err}")
        except Exception as tick_err:
            self.log_message(f"❌ Scheduler poll error: {tick_err}")

        if self.engine_running:
            self._scheduler_after_id = self.root.after(5000, self._scheduler_tick)

    def _run_scheduled_job(self, vals, job_key):
        try:
            self.execute_real_fb_post(vals[0], vals[1], vals[2], vals[3])
        except Exception as run_err:
            self.log_message(f"❌ Scheduled execution failed for {vals[0]}: {run_err}")
        finally:
            with self._scheduler_lock:
                self._scheduler_workers.discard(threading.current_thread())

    def stop_automation_engine(self, _suppress_alert=False):
        if not self.engine_running:
            if not _suppress_alert:
                messagebox.showinfo("Engine Status", "Background Engine is already stopped!", parent=self.root)
            return
        self.engine_running = False
        if self._scheduler_after_id is not None:
            try:
                self.root.after_cancel(self._scheduler_after_id)
            except Exception:
                pass
            self._scheduler_after_id = None
        self._sync_engine_ui_badges(False)
        self.log_message("🔴 System B Background Auto-Scheduler Engine STOPPED.")


if __name__ == "__main__":
    root = tk.Tk()
    app = SystemBProApp(root)
    root.mainloop()
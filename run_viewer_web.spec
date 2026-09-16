# -*- mode: python ; coding: utf-8 -*-
# macOS 打包配置（Eel + PyInstaller），2026-09-16 v2：
#   1. onedir 模式（onefile 每次启动自解压 ~35s，且 PyInstaller v7 将不再支持 onefile .app）
#   2. 包名 ObraDinn_Hints&Check.app（与 5 月旧包一致）
#   3. datas 含 faces_annotations.json / FolioSketch*.png；hiddenimports 含 Quartz；upx 关闭


a = Analysis(
    ['run_viewer_web.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('/Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/eel/eel.js', 'eel'),
        ('web', 'web'),
        ('faces_data.json', '.'),
        ('name_lists.json', '.'),
        ('correct_name_list.json', '.'),
        ('fates_structure.json', '.'),
        ('correct_fates_list.json', '.'),
        ('faces_annotations.json', '.'),
        ('FolioSketch_obra.png', '.'),
        ('FolioSketch.png', '.'),
        ('FacesHi', 'FacesHi'),
    ],
    hiddenimports=['bottle_websocket', 'Quartz'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='run_viewer_web',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.icns'],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='run_viewer_web',
)
app = BUNDLE(
    coll,
    name='ObraDinn_Hints&Check.app',
    icon='icon.icns',
    bundle_identifier='com.yide.obradinn-hints-check',
)

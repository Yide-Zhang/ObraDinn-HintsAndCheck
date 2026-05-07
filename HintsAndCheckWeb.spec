# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['run_viewer_web.py'],
    pathex=[],
    binaries=[],
    datas=[('C:\\Users\\OMEN\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\eel\\eel.js', 'eel'), ('web', 'web'), ('faces_data.json', '.'), ('name_lists.json', '.'), ('correct_name_list.json', '.'), ('fates_structure.json', '.'), ('correct_fates_list.json', '.'), ('FacesHi', 'FacesHi')],
    hiddenimports=['bottle_websocket'],
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
    a.binaries,
    a.datas,
    [],
    name='HintsAndCheckWeb',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)

"""Rebuild the local app using macOS's built-in compiler. No network/install steps."""
from pathlib import Path
import hashlib
import json
import plistlib
import shutil
import subprocess
import sys

source = Path(__file__).resolve().parent
output = Path(sys.argv[1] if len(sys.argv) > 1 else 'AI Usage Bar Local.app').resolve()
icon_bytes=(source/'AppIcon.icns').read_bytes()
if len(icon_bytes)<8 or icon_bytes[:4]!=b'icns' or int.from_bytes(icon_bytes[4:8],'big')!=len(icon_bytes):
    raise SystemExit('Invalid or empty app icon; refuse to build.')
if output.exists():
    raise SystemExit('Output exists; choose a new path.')
subprocess.run(['/usr/bin/osacompile', '-l', 'JavaScript', '-s', '-o', str(output), str(source/'main.js')], check=True)
p = output/'Contents/Info.plist'
info = plistlib.loads(p.read_bytes())
info.pop('CFBundleIconName', None)  # Remove the template asset-catalog override.
info.update(CFBundleIdentifier='local.aiusagebar.safe', CFBundleName='AI Usage Bar Local',
            CFBundleDisplayName='AI Usage Bar Local', CFBundleShortVersionString='2.3.1',
            CFBundleIconFile='AppIcon.icns', CFBundleVersion='8', LSUIElement=True)
p.write_bytes(plistlib.dumps(info))
for name in ['collector.py', 'main.js', 'LICENSE', 'BUILD.json', 'AppIcon.icns']:
    shutil.copy2(source/name, output/'Contents/Resources'/name)
manifest=json.loads((source/'BUILD.json').read_text())
for name,digest in manifest['sources'].items():
    if hashlib.sha256((output/'Contents/Resources'/name).read_bytes()).hexdigest()!=digest:
        raise SystemExit('Source hash mismatch; refuse to sign.')
subprocess.run(['/usr/bin/codesign', '--force', '--deep', '--sign', '-', str(output)], check=True)
subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(output)], check=True)
print(output)

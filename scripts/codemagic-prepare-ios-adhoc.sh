#!/usr/bin/env bash
# Align Capacitor / Xcode bundle ID and manual signing for Ad-Hoc profile hellostory-hoc.
set -euo pipefail

BUNDLE_ID="${BUNDLE_ID:-io.github.com.YaoHuan123.hello-ai-story}"
TEAM_ID="${DEVELOPMENT_TEAM:-TCPBS85F56}"
PROFILE_SPEC="${PROVISIONING_PROFILE_SPECIFIER:-hellostory-hoc}"
ROOT="${CM_BUILD_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
CAP_CONFIG="$ROOT/frontend/capacitor.config.ts"
PBXPROJ="$ROOT/frontend/ios/App/App.xcodeproj/project.pbxproj"

echo "Using bundle ID: $BUNDLE_ID"
echo "Using team ID:   $TEAM_ID"
echo "Using profile:   $PROFILE_SPEC"

if [[ ! -f "$CAP_CONFIG" ]]; then
  echo "Missing $CAP_CONFIG" >&2
  exit 1
fi

sed -i.bak "s/appId: \"[^\"]*\"/appId: \"$BUNDLE_ID\"/" "$CAP_CONFIG"
rm -f "$CAP_CONFIG.bak"

if [[ ! -f "$PBXPROJ" ]]; then
  echo "Missing $PBXPROJ — run 'npm run ios' locally once to generate ios/." >&2
  exit 1
fi

python3 - <<'PY' "$PBXPROJ" "$BUNDLE_ID" "$TEAM_ID" "$PROFILE_SPEC"
import re
import sys

path, bundle_id, team_id, profile = sys.argv[1:5]
text = open(path, encoding="utf-8").read()

def patch_app_target(block: str) -> str:
    if "PRODUCT_BUNDLE_IDENTIFIER" not in block:
        return block
    block = re.sub(
        r"PRODUCT_BUNDLE_IDENTIFIER = [^;]+;",
        f"PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};",
        block,
    )
    block = re.sub(r"CODE_SIGN_STYLE = Automatic;", "CODE_SIGN_STYLE = Manual;", block)
    block = re.sub(
        r'CODE_SIGN_IDENTITY = "[^"]*";',
        'CODE_SIGN_IDENTITY = "Apple Distribution";',
        block,
    )
    if re.search(r"DEVELOPMENT_TEAM = [^;]+;", block):
        block = re.sub(r"DEVELOPMENT_TEAM = [^;]+;", f"DEVELOPMENT_TEAM = {team_id};", block)
    else:
        block = block.replace(
            "IPHONEOS_DEPLOYMENT_TARGET = 14.0;",
            f"IPHONEOS_DEPLOYMENT_TARGET = 14.0;\n\t\t\t\tDEVELOPMENT_TEAM = {team_id};",
            1,
        )
    spec = f'PROVISIONING_PROFILE_SPECIFIER = "{profile}";'
    if "PROVISIONING_PROFILE_SPECIFIER" in block:
        block = re.sub(r'PROVISIONING_PROFILE_SPECIFIER = "[^"]*";', spec, block)
    else:
        block = block.replace(
            f"DEVELOPMENT_TEAM = {team_id};",
            f"DEVELOPMENT_TEAM = {team_id};\n\t\t\t\t{spec}",
            1,
        )
    return block

# Only App target build configurations (contain PRODUCT_BUNDLE_IDENTIFIER).
text = re.sub(
    r"504EC3171FED79650016851F /\* Debug \*/ = \{.*?\n\t\t\};",
    lambda m: patch_app_target(m.group(0)),
    text,
    flags=re.S,
)
text = re.sub(
    r"504EC3181FED79650016851F /\* Release \*/ = \{.*?\n\t\t\};",
    lambda m: patch_app_target(m.group(0)),
    text,
    flags=re.S,
)

open(path, "w", encoding="utf-8").write(text)
PY

echo "iOS Ad-Hoc signing configuration applied."

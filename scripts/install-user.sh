#!/usr/bin/env bash
# User-local install of GlassDeck (no sudo).
# Build first with `npm run dist`, then run `npm run install:user`.
set -euo pipefail

APP_NAME="GlassDeck"
SLUG="glassdeck"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$SRC_DIR/release/linux-unpacked"
INSTALL_DIR="$HOME/.local/opt/$SLUG"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

if [ ! -x "$BUILD_DIR/$SLUG" ]; then
  echo "error: no packaged build at $BUILD_DIR" >&2
  echo "       run 'npm run dist' first, then re-run this installer" >&2
  exit 1
fi

echo "→ installing $APP_NAME to $INSTALL_DIR"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -a "$BUILD_DIR/." "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/$SLUG"

mkdir -p "$BIN_DIR" "$APPS_DIR" "$ICON_DIR"

# launcher command on PATH
cat > "$BIN_DIR/$SLUG" <<'LAUNCHER'
#!/bin/sh
exec "$HOME/.local/opt/glassdeck/glassdeck" "$@"
LAUNCHER
chmod 755 "$BIN_DIR/$SLUG"

# icon
if [ -f "$SRC_DIR/build/icon.png" ]; then
  cp "$SRC_DIR/build/icon.png" "$ICON_DIR/$SLUG.png"
fi

# desktop entry
cat > "$APPS_DIR/$SLUG.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
GenericName=AppImage Launcher
Comment=Your AppImages, on a liquid-glass shelf
Exec=$BIN_DIR/$SLUG
TryExec=$BIN_DIR/$SLUG
Icon=$SLUG
Terminal=false
Categories=Utility;
Keywords=appimage;launcher;games;apps;glass;
StartupNotify=true
StartupWMClass=$SLUG
DESKTOP

# refresh caches where available
update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
kbuildsycoca6 >/dev/null 2>&1 || true

echo "✓ installed. Launch it from your app menu or run: $SLUG"
echo "  uninstall: rm -rf $INSTALL_DIR $BIN_DIR/$SLUG $APPS_DIR/$SLUG.desktop $ICON_DIR/$SLUG.png"

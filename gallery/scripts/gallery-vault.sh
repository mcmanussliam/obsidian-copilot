#!/usr/bin/env bash
set -euo pipefail

OBSIDIAN_BIN="${OBSIDIAN_BIN:-/Applications/Obsidian.app/Contents/MacOS/obsidian}"

# The default misses non-standard installs. Fall back to a Spotlight lookup
# before giving up and warning at the reload step.
if [[ ! -x "$OBSIDIAN_BIN" ]]; then
  located="$(mdfind "kMDItemCFBundleIdentifier == 'md.obsidian'" 2>/dev/null | head -n 1)"
  if [[ -n "$located" && -x "$located/Contents/MacOS/obsidian" ]]; then
    OBSIDIAN_BIN="$located/Contents/MacOS/obsidian"
  fi
fi

if [[ -z "${COPILOT_TEST_VAULT_PATH:-}" ]]; then
  cat >&2 <<'EOF'
error: COPILOT_TEST_VAULT_PATH is not set.

Set it once at the user level to the absolute path of an Obsidian vault you've
opened at least once, then re-run: npm run gallery:vault
EOF
  exit 1
fi

VAULT_PATH="$COPILOT_TEST_VAULT_PATH"

if [[ ! -d "$VAULT_PATH" ]]; then
  echo "error: vault directory not found: $VAULT_PATH" >&2
  exit 1
fi

if [[ ! -d "$VAULT_PATH/.obsidian" ]]; then
  echo "error: $VAULT_PATH has no .obsidian/ folder." >&2
  echo "Open the folder as a vault in Obsidian once, then re-run." >&2
  exit 1
fi

WORKTREE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$WORKTREE_ROOT"

WORKTREE_REAL="$(cd "$WORKTREE_ROOT" && pwd -P)"
VAULT_REAL="$(cd "$VAULT_PATH" && pwd -P)"
case "$WORKTREE_REAL" in
  "$VAULT_REAL"|"$VAULT_REAL"/*)
    cat >&2 <<EOF
error: the worktree is inside the test vault — refusing to deploy.
  worktree: $WORKTREE_REAL
  vault:    $VAULT_REAL
Move the worktree outside the vault, or point \$COPILOT_TEST_VAULT_PATH
at a different vault, then re-run.
EOF
    exit 1
    ;;
esac

if ! PLUGIN_ID="$(node -e '
  const id = require("./gallery/manifest.json").id;
  if (typeof id !== "string" || id.length === 0) process.exit(1);
  process.stdout.write(id);
')"; then
  echo "error: could not read plugin id from gallery/manifest.json" >&2
  exit 1
fi
if [[ ! "$PLUGIN_ID" =~ ^[a-z0-9-]+$ ]]; then
  echo "error: invalid plugin id in gallery/manifest.json: $PLUGIN_ID" >&2
  exit 1
fi
PLUGIN_ID_JSON="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$PLUGIN_ID")"

GALLERY_ROOT="$WORKTREE_ROOT/gallery"
# The manifest ships from the gallery root; the bundle and stylesheet are
# build outputs under dist/ (gitignored — run npm run gallery:build first).
for artifact in manifest.json dist/main.js dist/styles.css; do
  source_path="$GALLERY_ROOT/$artifact"
  if [[ ! -f "$source_path" ]]; then
    echo "error: expected gallery artifact missing: $source_path" >&2
    echo "run npm run gallery:build first, then re-run." >&2
    exit 1
  fi
done

PLUGIN_ROOT="$VAULT_PATH/.obsidian/plugins"
PLUGIN_DIR="$PLUGIN_ROOT/$PLUGIN_ID"
mkdir -p "$PLUGIN_ROOT"

preflight_plugin_dir() {
  local entry
  local entry_name

  while IFS= read -r -d '' entry; do
    entry_name="${entry##*/}"
    case "$entry_name" in
      main.js|manifest.json|styles.css)
        if [[ ! -L "$entry" && ! -f "$entry" ]]; then
          echo "error: refusing to replace gallery directory with invalid artifact: $entry" >&2
          return 1
        fi
        ;;
      .hotreload)
        if [[ ! -f "$entry" || -L "$entry" ]]; then
          echo "error: refusing to replace gallery directory with invalid marker: $entry" >&2
          return 1
        fi
        ;;
      *)
        echo "error: refusing to replace gallery directory with unexpected entry: $entry" >&2
        return 1
        ;;
    esac
  done < <(find "$PLUGIN_DIR" -mindepth 1 -maxdepth 1 -print0)
}

echo "==> Copying gallery plugin files into $PLUGIN_DIR"
if [[ -L "$PLUGIN_DIR" ]]; then
  rm -f "$PLUGIN_DIR"
elif [[ -d "$PLUGIN_DIR" ]]; then
  preflight_plugin_dir
  for entry_name in main.js manifest.json styles.css .hotreload; do
    entry_path="$PLUGIN_DIR/$entry_name"
    if [[ -e "$entry_path" || -L "$entry_path" ]]; then
      rm -f "$entry_path"
    fi
  done
  rmdir "$PLUGIN_DIR"
elif [[ -e "$PLUGIN_DIR" ]]; then
  echo "error: refusing to replace non-directory gallery plugin path: $PLUGIN_DIR" >&2
  exit 1
fi
mkdir -p "$PLUGIN_DIR"
# Keep artifacts inside the vault: Obsidian may have permission to read the vault
# without access to a symlink target in the checkout (macOS reports EPERM).
cp "$GALLERY_ROOT/manifest.json" "$PLUGIN_DIR/manifest.json"
cp "$GALLERY_ROOT/dist/main.js" "$PLUGIN_DIR/main.js"
cp "$GALLERY_ROOT/dist/styles.css" "$PLUGIN_DIR/styles.css"
touch "$PLUGIN_DIR/.hotreload"

echo "==> Reloading gallery plugin in Obsidian (vault dir: $VAULT_PATH)"
if [[ ! -x "$OBSIDIAN_BIN" ]]; then
  echo "warning: Obsidian CLI not found at $OBSIDIAN_BIN; skipping reload." >&2
else
  RELOAD_CODE="(async()=>{const id=$PLUGIN_ID_JSON;await app.plugins.loadManifests();if(app.plugins.plugins[id])await app.plugins.disablePlugin(id);await app.plugins.enablePluginAndSave(id);const state={manifest:!!app.plugins.manifests[id],loaded:!!app.plugins.plugins[id],enabled:app.plugins.enabledPlugins.has(id)};if(!state.manifest||!state.loaded||!state.enabled)throw new Error('Gallery plugin failed to load: '+JSON.stringify(state));return JSON.stringify(state);})()"
  if (cd "$VAULT_PATH" && "$OBSIDIAN_BIN" eval code="$RELOAD_CODE" >/dev/null 2>&1); then
    echo "    reloaded"
  else
    echo "warning: could not reload via the CLI. Is Obsidian running with this vault open? The plugin will load on next open." >&2
  fi
fi

echo
echo "Done."
echo "  worktree: $WORKTREE_ROOT"
echo "  vault:    $VAULT_PATH"
echo "  plugin:   $PLUGIN_ID"

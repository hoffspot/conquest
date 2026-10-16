#!/bin/bash
# Pellagos Server's installer for the Mac (docs/MAC_APP.md, "Installing it"): the menu-bar app put
# in Applications and opened, from the project's newest release (the Mac app workflow publishes
# one for each change to main), a zip at hand, or built on this Mac from the project's source (as
# it is when there's no release yet). Run again, it updates the app; worlds are kept as they are.
#
#     curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh | bash
#     curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh | bash -s -- --build
#     scripts/install-mac.sh --zip ~/Downloads/Pellagos-Server-2.0.0-arm64.zip
#     scripts/install-mac.sh --uninstall
#
# What it checks before anything's put in place: that this is a Mac with Apple silicon on macOS 13
# or later; that a release's zip is the one GitHub has (its SHA-256, as GitHub keeps it for each
# release's files); that the app inside is Pellagos Server (its bundle id) and unchanged since it
# was signed (codesign --verify). A running Pellagos Server is stopped first, saving every world.
# Downloaded here rather than in a browser, the app isn't marked as downloaded, so macOS opens it
# without Open Anyway; a zip given with --zip has that mark taken off once it's checked. Nothing's
# done with sudo: it goes in /Applications if that can be written to, otherwise ~/Applications.
#
# PELLAGOS_RELEASES (a URL, file:// too) asks elsewhere for the releases, and PELLAGOS_PATIENCE
# waits that many seconds (not 180) for a running server to stop, as the tests do.

set -euo pipefail

# (As server/platform/names.js, scripts/build-mac-app.js and server/update/releases.js have them:
# test/install-mac.test.js checks they agree)
REPOSITORY="hoffspot/conquest"
APP_ID="io.github.hoffspot.pellagos-server"
APP_NAME="Pellagos Server"
EXECUTABLE="PellagosServer"
RELEASES="${PELLAGOS_RELEASES:-https://api.github.com/repos/$REPOSITORY/releases?per_page=30}"
SOURCES="https://codeload.github.com/$REPOSITORY/tar.gz"
# (Downloads over HTTPS alone; and file://, if the releases are asked of a file)
PROTOCOLS="=https"
case "$RELEASES" in file://*) PROTOCOLS="=https,file" ;; esac
MACOS_LEAST=13
NODE_LEAST=22
# (How long a running server has to save every world and stop, in seconds)
PATIENCE="${PELLAGOS_PATIENCE:-180}"

# The newest server release in GitHub's list (as releases.js latestRelease picks it: tagged
# server-v<version>, not a draft nor a pre-release), with its app's zip: "<version>\t<url>\t<digest>",
# or nothing. Run by osascript as JavaScript, which every Mac has: argv is the list, then the
# version wanted ("" for the newest)
PICK='function run(argv) {
    var releases = JSON.parse(argv[0]), wanted = argv[1] || "", best = null;
    var parts = function (version) { return version.split(".").map(Number); };
    var newer = function (a, b) {
        var x = parts(a), y = parts(b);
        for (var k = 0; k < 3; k++) { if (x[k] !== y[k]) { return x[k] > y[k]; } }
        return false;
    };
    for (var i = 0; i < (Array.isArray(releases) ? releases.length : 0); i++) {
        var release = releases[i] || {}, tag = /^server-v(\d+\.\d+\.\d+)$/.exec(release.tag_name || "");
        if (!tag || release.draft || release.prerelease || (wanted && tag[1] !== wanted)) { continue; }
        var name = "Pellagos-Server-" + tag[1] + "-arm64.zip";
        var zip = (release.assets || []).filter(function (asset) { return asset && asset.name === name; })[0];
        if (zip && (!best || newer(tag[1], best[0]))) { best = [tag[1], zip.browser_download_url, zip.digest || ""]; }
    }
    return best ? best.join("\t") : "";
}'

say() { printf '%s\n' "$*"; }

# The SHA-256 of the file $1, in hex
sha256_of() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d' ' -f1
    else
        openssl dgst -sha256 -r "$1" | cut -d' ' -f1
    fi
}
fail() {
    printf 'install-mac: %s\n' "$*" >&2
    exit 1
}

usage() {
    cat <<'USAGE'
Pellagos Server's installer for the Mac: the menu-bar app that keeps worlds for players.

  install-mac.sh                  the newest release (built here if there's none), into Applications, then opened
  install-mac.sh --version 2.1.0  that release
  install-mac.sh --build          built here from the project's source (Apple's Command Line Tools)
  install-mac.sh --zip FILE       a zip at hand (Pellagos-Server-<version>-arm64.zip)
  install-mac.sh --uninstall      quit and taken away; its worlds are kept

  --to DIR       install into DIR (or uninstall from it), not /Applications or ~/Applications
  --no-open      don't open it once it's installed
  --source DIR   with --build: this copy of the repository, not one downloaded
  --ref REF      with --build: the branch or tag downloaded (main)

From Terminal, without a copy of the repository:
  curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh | bash
USAGE
}

# Where it goes: --to, or where it is already, or /Applications if that can be written to, else ~/Applications
target() {
    if [ -n "$to" ]; then
        printf '%s\n' "$to"
    elif [ -d "/Applications/$APP_NAME.app" ] || { [ ! -d "$HOME/Applications/$APP_NAME.app" ] && [ -w /Applications ]; }; then
        printf '%s\n' "/Applications"
    else
        printf '%s\n' "$HOME/Applications"
    fi
}

# --- Stopping it, every world saved ---

# (Its server: the bundle's own Node, running the server's launcher and the server)
SERVING="/$APP_NAME.app/Contents/Helpers/node"

serving() { pgrep -f "$SERVING" >/dev/null 2>&1; }
running() { pgrep -x "$EXECUTABLE" >/dev/null 2>&1; }

# Waits until $1 says no, PATIENCE seconds at most
until_not() {
    local waited=0

    while "$1"; do
        [ "$waited" -lt "$PATIENCE" ] || fail "$APP_NAME is still running. Quit it from its menu (Quit), then run this again."
        sleep 1
        waited=$((waited + 1))
    done
}

# As Quit does: the server first, which saves every world and stops while the app still hears it;
# then the app, its launch agent let go of for now so that launchd doesn't start it again (it's
# there again at the next login)
stop_app() {
    serving || running || return 0
    say "Stopping $APP_NAME (every world is saved first)..."
    pkill -TERM -f "$SERVING" >/dev/null 2>&1 || true
    until_not serving
    # (A moment for the app to write the last of what its server said in its log, before it goes too)
    if running; then sleep 2; fi
    launchctl bootout "gui/$(id -u)/$APP_ID" >/dev/null 2>&1 || true
    pkill -TERM -x "$EXECUTABLE" >/dev/null 2>&1 || true
    until_not running
}

# --- Checking and installing an app ---

# Fails unless the app at $1 is Pellagos Server, unchanged since it was signed. Says its version.
check_app() {
    local app="$1" id

    [ -f "$app/Contents/Info.plist" ] || fail "there's no $APP_NAME.app in it."
    id="$(plutil -extract CFBundleIdentifier raw -o - "$app/Contents/Info.plist" 2>/dev/null || true)"
    [ "$id" = "$APP_ID" ] || fail "the app in it isn't $APP_NAME (it's ${id:-nameless}): not installed."
    codesign --verify --deep --strict "$app" >/dev/null 2>&1 || fail "the app's signature doesn't check: it's been changed since it was built. Not installed."
    plutil -extract CFBundleShortVersionString raw -o - "$app/Contents/Info.plist" 2>/dev/null || echo "?"
}

# The zip at $1 unpacked, checked and put in place of the one there, then opened
install_zip() {
    local unpacked="$work/unpacked" place app version
    place="$(target)"
    app="$place/$APP_NAME.app"

    mkdir -p "$unpacked"
    ditto -x -k "$1" "$unpacked" || fail "$1 isn't a zip that opens."
    version="$(check_app "$unpacked/$APP_NAME.app")"
    # (Checked: no longer marked as downloaded, so macOS opens it without Open Anyway)
    xattr -dr com.apple.quarantine "$unpacked/$APP_NAME.app" >/dev/null 2>&1 || true

    mkdir -p "$place" || fail "can't make $place."
    stop_app

    if [ -d "$app" ]; then
        mv "$app" "$work/before.app" || fail "can't replace $app (is it yours to change?)."
    fi

    if ! ditto "$unpacked/$APP_NAME.app" "$app"; then
        rm -rf "$app"
        [ -d "$work/before.app" ] && mv "$work/before.app" "$app"
        fail "couldn't put it in $place: the one there is as it was."
    fi

    if ! (check_app "$app" >/dev/null); then
        rm -rf "$app"
        [ -d "$work/before.app" ] && mv "$work/before.app" "$app"
        fail "the app didn't check once it was put in $place: the one there is as it was."
    fi

    say "Installed $APP_NAME $version in $place."

    if [ "$open_it" = 1 ]; then
        open "$app"
        cat <<NEXT

It's in the menu bar now: the dot at the top right of the screen.
  - Its menu's "Open the management page" (http://localhost:8481 on this Mac) makes worlds and keys.
  - If macOS asks whether "node" may accept incoming connections, or whether $APP_NAME may find
    devices on your local network, click Allow: players on the Wi-Fi need it.
  - "Run at login" in its menu starts it whenever you log in.
The guide: https://github.com/$REPOSITORY/blob/main/docs/MAC_APP.md
NEXT
    fi
}

# --- From a release ---

from_release() {
    local pick version url digest found

    say "Asking GitHub for $APP_NAME's ${wanted:-newest} release..."
    curl -fsSL --proto "$PROTOCOLS" -H "Accept: application/vnd.github+json" "$RELEASES" -o "$work/releases.json" \
        || fail "couldn't ask GitHub for its releases (is this Mac online?)."
    pick="$(osascript -l JavaScript -e "$PICK" "$(cat "$work/releases.json")" "$wanted" 2>/dev/null)" \
        || fail "GitHub's answer about its releases didn't make sense; try again in a while."

    if [ -z "$pick" ] && [ -n "$wanted" ]; then
        fail "there's no release of $APP_NAME $wanted with the Mac app. Leave out --version for the newest."
    fi

    # (None yet: built here from the project's source instead, as --build builds it)
    if [ -z "$pick" ]; then
        say "There's no release of $APP_NAME with the Mac app yet: building it on this Mac instead."
        from_source
        return
    fi

    IFS=$'\t' read -r version url digest <<EOF
$pick
EOF
    case "$digest" in
        sha256:*) ;;
        *) fail "GitHub doesn't say what $APP_NAME $version's zip should be (its SHA-256), so it can't be checked: not installed." ;;
    esac

    say "Downloading $APP_NAME $version..."
    curl -fL --proto "$PROTOCOLS" --retry 2 --progress-bar "$url" -o "$work/app.zip" || fail "couldn't download $url."
    found="$(sha256_of "$work/app.zip")"
    [ "$found" = "${digest#sha256:}" ] || fail "the download isn't the zip GitHub has (its SHA-256 is $found, not ${digest#sha256:}): not installed."
    install_zip "$work/app.zip"
}

# --- Built here ---

# This copy of the repository (--source, or the one this script is in), or the project's source
# downloaded ($ref): its folder
sources() {
    local here

    if [ -n "$source_dir" ]; then
        [ -f "$source_dir/mac/Package.swift" ] || fail "$source_dir isn't a copy of the repository (it has no mac/Package.swift)."
        (cd "$source_dir" && pwd)
        return
    fi

    # (Run from the file in a copy, not piped from curl: $0 is then "bash")
    if [ "${0##*/}" = "install-mac.sh" ] && [ -f "$0" ]; then
        here="$(cd "$(dirname "$0")/.." && pwd)"
    else
        here=""
    fi

    if [ -n "$here" ] && [ -f "$here/mac/Package.swift" ] && [ -f "$here/scripts/build-mac-app.js" ]; then
        printf '%s\n' "$here"
        return
    fi

    say "Downloading the project's source ($ref)..." >&2
    mkdir -p "$work/source"
    curl -fsSL --proto "=https" "$SOURCES/$ref" | tar -xzf - -C "$work/source" --strip-components 1 \
        || fail "couldn't download the project's source ($SOURCES/$ref)."
    printf '%s\n' "$work/source"
}

# A Node to build with: one here of version $NODE_LEAST or later, or the one the app's built with
# (scripts/build-mac-app.js NODE), from nodejs.org, checked against the SHA-256 kept there, and left
# in the source's .cache/node where the build looks for it
node_for() {
    local src="$1" major line version sha archive file found

    if command -v node >/dev/null 2>&1; then
        major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"

        if [ "$major" -ge "$NODE_LEAST" ] 2>/dev/null; then
            command -v node
            return
        fi
    fi

    line="$(sed -n 's/.*NODE = Object.freeze({ version: "\([0-9.]*\)", sha256: "\([0-9a-f]*\)" }).*/\1 \2/p' "$src/scripts/build-mac-app.js")"
    version="${line%% *}"
    sha="${line##* }"
    [ -n "$version" ] && [ -n "$sha" ] || fail "can't find which Node the app's built with (scripts/build-mac-app.js NODE)."
    archive="node-v$version-darwin-arm64.tar.gz"
    file="$src/.cache/node/$archive"
    mkdir -p "$src/.cache/node"

    if [ ! -f "$file" ]; then
        say "Downloading Node $version to build with..." >&2
        curl -fL --proto "=https" --retry 2 --progress-bar "https://nodejs.org/dist/v$version/$archive" -o "$file.part" \
            || fail "couldn't download Node $version from nodejs.org."
        mv "$file.part" "$file"
    fi

    found="$(sha256_of "$file")"

    if [ "$found" != "$sha" ]; then
        rm -f "$file"
        fail "Node's download isn't the one kept in scripts/build-mac-app.js (its SHA-256 is $found): not used."
    fi

    mkdir -p "$work/node"
    tar -xzf "$file" -C "$work/node" --strip-components 1
    printf '%s\n' "$work/node/bin/node"
}

from_source() {
    local src node bin

    if ! xcode-select -p >/dev/null 2>&1 || ! command -v swift >/dev/null 2>&1; then
        say "Building $APP_NAME needs Apple's Command Line Tools (free, about 1 GB)."
        say "Their installer's opening now: once it's done, run this again."
        xcode-select --install >/dev/null 2>&1 || true
        exit 1
    fi

    src="$(sources)"
    node="$(node_for "$src")"

    say "Building the menu-bar app (Swift)..."
    swift build -c release --arch arm64 --package-path "$src/mac"
    bin="$(swift build -c release --arch arm64 --package-path "$src/mac" --show-bin-path)"

    say "Putting it in its bundle with Node, the server and the game..."
    "$node" "$src/scripts/build-mac-app.js" --executable "$bin/$EXECUTABLE" --out "$work/dist"

    set -- "$work/dist/"Pellagos-Server-*-arm64.zip
    [ -f "$1" ] || fail "the build made no zip."
    install_zip "$1"
}

# --- Taken away ---

uninstall() {
    local found=0 place places

    if [ -n "$to" ]; then
        places=("$to")
    else
        places=("/Applications" "$HOME/Applications")
    fi

    stop_app
    launchctl bootout "gui/$(id -u)/$APP_ID" >/dev/null 2>&1 || true

    for place in "${places[@]}"; do
        if [ -d "$place/$APP_NAME.app" ]; then
            rm -rf "${place:?}/$APP_NAME.app"
            say "Took $APP_NAME out of $place."
            found=1
        fi
    done

    [ "$found" = 1 ] || say "$APP_NAME isn't in ${to:-/Applications or ~/Applications}."
    cat <<KEPT
Its worlds and settings are kept, in ~/Library/Application Support/$APP_ID
(its log in ~/Library/Logs/$APP_ID). Delete that folder too to take them away.
If "Run at login" was on, System Settings › General › Login Items may list it until you log in again.
KEPT
}

# --- What it's asked to do ---

# (All of it in a function, called on the last line: piped from curl, nothing runs until the whole
# script's arrived, and nothing it runs can read the rest of it as its input)
main() {
    mode="release"
    wanted=""
    zip=""
    to=""
    open_it=1
    source_dir=""
    ref="main"

    while [ $# -gt 0 ]; do
        case "$1" in
            --version) [ $# -ge 2 ] || fail "--version needs a version (2.1.0)"; wanted="$2"; shift 2 ;;
            --zip) [ $# -ge 2 ] || fail "--zip needs the zip's path"; mode="zip"; zip="$2"; shift 2 ;;
            --build) mode="build"; shift ;;
            --uninstall) mode="uninstall"; shift ;;
            --to) [ $# -ge 2 ] || fail "--to needs a folder"; to="$2"; shift 2 ;;
            --no-open) open_it=0; shift ;;
            --source) [ $# -ge 2 ] || fail "--source needs a folder"; source_dir="$2"; shift 2 ;;
            --ref) [ $# -ge 2 ] || fail "--ref needs a branch or tag"; ref="$2"; shift 2 ;;
            -h | --help) usage; exit 0 ;;
            *) usage >&2; fail "unknown option: $1" ;;
        esac
    done

    case "$wanted" in
        "" | [0-9]*.[0-9]*.[0-9]*) ;;
        *) fail "--version takes a version such as 2.1.0, not $wanted" ;;
    esac

    # --- This Mac ---

    [ "$(uname -s)" = "Darwin" ] || fail "this installs the Mac app. Elsewhere, run the server from a copy of the repository (npm run world-server; docs/SERVER.md)."
    [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ] || fail "Pellagos Server needs a Mac with Apple silicon (M1 or later)."
    macos="$(sw_vers -productVersion)"
    [ "${macos%%.*}" -ge "$MACOS_LEAST" ] 2>/dev/null || fail "Pellagos Server needs macOS $MACOS_LEAST or later; this Mac has $macos."

    work="$(mktemp -d "${TMPDIR:-/tmp}/pellagos-install.XXXXXX")"
    trap 'rm -rf "$work"' EXIT

    case "$mode" in
        release) from_release ;;
        zip)
            [ -f "$zip" ] || fail "there's no zip at $zip."
            install_zip "$zip"
            ;;
        build) from_source ;;
        uninstall) uninstall ;;
    esac
}

main "$@"

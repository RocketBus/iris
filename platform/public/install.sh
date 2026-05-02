#!/bin/sh
# Iris Installer — macOS, Linux, WSL
#
# Usage:
#   curl -fsSL https://iris.clickbus.com/install.sh | sh
#   wget -qO- https://iris.clickbus.com/install.sh | sh
#
# Environment variables:
#   IRIS_HOME=~/.iris           Install location (default: ~/.iris)
#   IRIS_INSTALL_METHOD=pip       Force pip instead of pipx
#   IRIS_VERSION=latest           Version to install (default: latest)
#   IRIS_YES=1                    Skip confirmation prompt

set -e

VERSION="${IRIS_VERSION:-latest}"
RELEASES_API="https://api.github.com/repos/RocketBus/clickbus-iris/releases"
RELEASES_DOWNLOAD="https://github.com/RocketBus/clickbus-iris/releases/download"
MIN_PYTHON="3.11"
INSTALL_DIR="${IRIS_HOME:-$HOME/.iris}"
LOCAL_BIN="$HOME/.local/bin"

# Resolve "latest" via GitHub Releases API
if [ "$VERSION" = "latest" ]; then
    VERSION=$(curl -fsSL "$RELEASES_API/latest" | grep -oE '"tag_name":\s*"v?[^"]+' | sed -E 's/.*"v?//') || {
        printf "Failed to resolve latest version from GitHub Releases\n" >&2
        exit 1
    }
fi
WHEEL_URL="$RELEASES_DOWNLOAD/v${VERSION}/clickbus_iris-${VERSION}-py3-none-any.whl"

# --- Colors (disabled if not a terminal) ---
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    RED='\033[0;31m'
    DIM='\033[2m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    GREEN='' YELLOW='' RED='' DIM='' BOLD='' NC=''
fi

info()  { printf "${GREEN}>>>${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}>>>${NC} %s\n" "$1"; }
error() { printf "${RED}>>>${NC} %s\n" "$1"; }
bold()  { printf "${BOLD}%s${NC}\n" "$1"; }
dim()   { printf "${DIM}%s${NC}\n" "$1"; }

# --- Detect Python ---
find_python() {
    for cmd in python3 python; do
        if command -v "$cmd" >/dev/null 2>&1; then
            version=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)
            if [ -n "$version" ]; then
                major=$(echo "$version" | cut -d. -f1)
                minor=$(echo "$version" | cut -d. -f2)
                if [ "$major" -ge 3 ] && [ "$minor" -ge 11 ]; then
                    echo "$cmd"
                    return 0
                fi
            fi
        fi
    done
    return 1
}

# --- Detect OS ---
detect_os() {
    case "$(uname -s)" in
        Darwin*)  echo "macos" ;;
        Linux*)
            if grep -qi microsoft /proc/version 2>/dev/null; then
                echo "wsl"
            else
                echo "linux"
            fi
            ;;
        *)        echo "unknown" ;;
    esac
}

# --- Detect shell rc file ---
detect_shell_rc() {
    # Prefer the user's current shell, fall back to common files
    case "$SHELL" in
        */zsh)  echo "$HOME/.zshrc" ;;
        */bash)
            # macOS uses login shells (.bash_profile), Linux uses .bashrc
            if [ "$(uname -s)" = "Darwin" ]; then
                echo "$HOME/.bash_profile"
            else
                echo "$HOME/.bashrc"
            fi
            ;;
        *)
            # Check which files exist, in priority order
            if [ -f "$HOME/.zshrc" ]; then
                echo "$HOME/.zshrc"
            elif [ -f "$HOME/.bash_profile" ]; then
                echo "$HOME/.bash_profile"
            elif [ -f "$HOME/.bashrc" ]; then
                echo "$HOME/.bashrc"
            elif [ -f "$HOME/.profile" ]; then
                echo "$HOME/.profile"
            else
                echo ""
            fi
            ;;
    esac
}

# --- Add to PATH ---
ensure_path() {
    BIN_DIR="$1"

    # Already on PATH?
    case ":$PATH:" in
        *":$BIN_DIR:"*) return 0 ;;
    esac

    SHELL_RC=$(detect_shell_rc)
    EXPORT_LINE="export PATH=\"$BIN_DIR:\$PATH\""

    if [ -n "$SHELL_RC" ]; then
        if ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
            printf "\n# Iris\n%s\n" "$EXPORT_LINE" >> "$SHELL_RC"
            info "Added to PATH via $SHELL_RC"
        else
            dim "  PATH already configured in $SHELL_RC"
        fi
    else
        warn "Could not detect shell profile. Add this to your shell config:"
        echo ""
        echo "  $EXPORT_LINE"
        echo ""
    fi

    # Make available in current session
    export PATH="$BIN_DIR:$PATH"
}

# --- Main ---
main() {
    bold "Iris Installer"
    echo ""

    OS=$(detect_os)

    # Check Python
    PYTHON=$(find_python) || {
        error "Python $MIN_PYTHON or later is required but not found."
        echo ""
        case "$OS" in
            macos) echo "  Install: brew install python@3.13" ;;
            linux|wsl) echo "  Install: sudo apt install python3 python3-pip python3-venv" ;;
        esac
        echo ""
        exit 1
    }

    PYTHON_VERSION=$("$PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')")

    # Choose install method
    METHOD="${IRIS_INSTALL_METHOD:-auto}"
    if [ "$METHOD" = "auto" ]; then
        if command -v pipx >/dev/null 2>&1; then
            METHOD="pipx"
        else
            METHOD="pip"
        fi
    fi

    # --- Show plan and ask for confirmation ---
    echo "  This will install Iris CLI on your machine."
    echo ""
    echo "  ${BOLD}What will happen:${NC}"
    echo ""
    if [ "$METHOD" = "pipx" ]; then
        echo "    1. Install Iris via pipx (isolated environment)"
        echo "       Location: managed by pipx (~/.local/pipx/venvs/iris)"
        echo "       Binary:   ~/.local/bin/iris"
    else
        echo "    1. Create a Python virtual environment"
        echo "       Location: ${INSTALL_DIR}/venv"
        echo ""
        echo "    2. Install Iris into that venv"
        echo "       Binary:   ${LOCAL_BIN}/iris"
        echo ""
        echo "    3. Add ${LOCAL_BIN} to your PATH"
        SHELL_RC=$(detect_shell_rc)
        if [ -n "$SHELL_RC" ]; then
            echo "       Via:      $SHELL_RC"
        fi
    fi
    echo ""
    dim "  Python: $PYTHON ($PYTHON_VERSION) | Version: $VERSION | OS: $OS"
    echo ""

    # Ask for confirmation (skip with IRIS_YES=1 or -y flag)
    if [ "${IRIS_YES}" != "1" ] && [ "$1" != "-y" ] && [ "$1" != "--yes" ]; then
        printf "  Proceed with installation? [Y/n] "
        # Read from /dev/tty so it works even when piped (curl | sh)
        read -r REPLY < /dev/tty
        case "$REPLY" in
            [nN]*) echo "  Installation cancelled."; exit 0 ;;
        esac
    fi

    echo ""

    # --- Install ---
    case "$METHOD" in
        pipx)
            info "Installing via pipx..."
            pipx install "$WHEEL_URL" --python "$PYTHON" --force 2>&1
            ensure_path "$HOME/.local/bin"
            ;;
        pip)
            VENV_DIR="$INSTALL_DIR/venv"

            info "Creating virtual environment..."
            mkdir -p "$INSTALL_DIR"
            "$PYTHON" -m venv "$VENV_DIR" 2>&1

            info "Installing Iris..."
            "$VENV_DIR/bin/pip" install --quiet --force-reinstall "$WHEEL_URL" 2>&1

            # Create bin wrapper in ~/.local/bin (XDG convention)
            mkdir -p "$LOCAL_BIN"
            cat > "$LOCAL_BIN/iris" <<WRAPPER
#!/bin/sh
exec "$VENV_DIR/bin/iris" "\$@"
WRAPPER
            chmod +x "$LOCAL_BIN/iris"

            ensure_path "$LOCAL_BIN"
            ;;
    esac

    echo ""

    # --- Verify ---
    if command -v iris >/dev/null 2>&1; then
        info "Installation successful!"
        echo ""
        echo "  Get started:"
        echo ""
        echo "    iris login                          Connect to Iris platform"
        echo "    iris /path/to/repo                  Analyze a repository"
        echo "    iris /path/to/repo --push           Analyze and push to platform"
        echo "    iris hook install /path/to/repo     Install AI commit tracking"
        echo "    iris uninstall                      Remove Iris from your machine"
        echo ""
        dim "  Restart your terminal or run: source $(detect_shell_rc)"
        echo ""
    else
        warn "Iris was installed but is not yet on PATH in this session."
        warn "Restart your terminal, then run: iris --help"
    fi

    # Optional: check for gh CLI
    if ! command -v gh >/dev/null 2>&1; then
        dim "  Tip: Install GitHub CLI (gh) for PR analysis — https://cli.github.com/"
    fi
}

main "$@"

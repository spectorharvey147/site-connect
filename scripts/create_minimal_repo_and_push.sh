#!/usr/bin/env bash
set -euo pipefail

# create_minimal_repo_and_push.sh
#
# Creates a new GitHub repository using the GitHub CLI (gh) and uploads a
# minimal snapshot of the current workspace (only selected files and folders).
#
# Usage:
#   ./scripts/create_minimal_repo_and_push.sh
#
# Requirements:
# - gh (GitHub CLI) installed and authenticated (gh auth login)
# - git installed
# - You must type CONFIRM to proceed
#
# The script copies a predefined set of "allowed" files/dirs from the current
# workspace into a temporary directory, initializes a fresh git repository,
# creates the remote repo on GitHub, and pushes the snapshot as the initial commit.

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh (GitHub CLI) not found. Install it and run: gh auth login"
  exit 2
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git not found."
  exit 2
fi

echo "This will create a NEW GitHub repository and push a minimal snapshot of this workspace."
echo "You will be asked for the new repository name (owner/name or name)."
echo
echo "If you understand and want to proceed, type exactly: CONFIRM"
read -r CONFIRMATION
if [ "$CONFIRMATION" != "CONFIRM" ]; then
  echo "Aborted by user. No changes made."
  exit 0
fi

read -rp "Enter new repository name (owner/repo or repo): " REPO_NAME
if [ -z "$REPO_NAME" ]; then
  echo "Repository name is required."
  exit 2
fi

read -rp "Public or private? (public/private) [public]: " REPO_VIS
REPO_VIS=${REPO_VIS:-public}
if [ "$REPO_VIS" != "public" ] && [ "$REPO_VIS" != "private" ]; then
  echo "Invalid visibility: $REPO_VIS"
  exit 2
fi

BRANCH="main"
read -rp "Branch name to push [main]: " BRANCH_INPUT
BRANCH=${BRANCH_INPUT:-$BRANCH}

# Define allowed files and folders to include in the minimal snapshot
ALLOWED=(
  "package.json"
  "package-lock.json"
  "pnpm-lock.yaml"
  "yarn.lock"
  "tsconfig.json"
  "vite.config.ts"
  "README.md"
  "src"
  "public"
  "src/App.tsx"
  "src/main.tsx"
  "src/index.tsx"
  "src/pages"
  "src/components"
  "src/styles"
  "tsconfig.json"
  "src/lib"
  "supabase"
  ".github"
  "scripts"
  "README.md"
)

TMPDIR=$(mktemp -d)
echo "Creating temporary snapshot in: $TMPDIR"

for p in "${ALLOWED[@]}"; do
  if [ -e "$p" ]; then
	mkdir -p "$TMPDIR/$(dirname "$p")"
	cp -R --parents "$p" "$TMPDIR" 2>/dev/null || cp -R "$p" "$TMPDIR/" || true
  fi
done

# Always create a sane .gitignore in the snapshot
cat > "$TMPDIR/.gitignore" <<'EOF'
node_modules/
.env
.env.*
dist/
build/
.cache/
coverage/
*.log
*.local
EOF

cd "$TMPDIR"

git init -b "$BRANCH"
git add -A
git commit -m "Initial minimal snapshot"

echo "Creating repository on GitHub: $REPO_NAME ($REPO_VIS)"
if [ "$REPO_VIS" = "public" ]; then
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push || {
	# fallback if --source not supported
	gh repo create "$REPO_NAME" --public --confirm
	git remote add origin "$(gh repo view --json sshUrl -q . | jq -r .sshUrl)" || true
	git push -u origin "$BRANCH"
  }
else
  gh repo create "$REPO_NAME" --private --source=. --remote=origin --push || {
	gh repo create "$REPO_NAME" --private --confirm
	git remote add origin "$(gh repo view --json sshUrl -q . | jq -r .sshUrl)" || true
	git push -u origin "$BRANCH"
  }
fi

echo "Repository created and pushed: $REPO_NAME"
echo "Temporary snapshot location (removed): $TMPDIR"

cd - >/dev/null || true
rm -rf "$TMPDIR"

#!/usr/bin/env bash
set -euo pipefail

# push_fresh_repo.sh
#
# Usage:
#   ./scripts/push_fresh_repo.sh <remote-repo-URL> [branch]
#
# Example (HTTPS with PAT):
#   ./scripts/push_fresh_repo.sh https://<TOKEN>@github.com/spectorharvey147/site-connect.git main
# Example (SSH):
#   ./scripts/push_fresh_repo.sh git@github.com:spectorharvey147/site-connect.git main
#
# This script WILL remove the local .git directory (local history) and create a fresh
# Git repository in the current workspace, then force-push to the given remote.
# You must type CONFIRM when prompted to proceed.

if [ "$#" -lt 1 ]; then
  echo "Error: remote repo URL is required."
  echo "Usage: $0 <remote-repo-URL> [branch]"
  exit 2
fi

REMOTE_URL="$1"
BRANCH="${2:-main}"

echo "WARNING: This will DELETE the local git history (remove .git) and force-push a fresh commit to:"
echo "  $REMOTE_URL (branch: $BRANCH)"
echo
echo "If you understand and want to proceed, type exactly: CONFIRM"
read -r CONFIRMATION

if [ "$CONFIRMATION" != "CONFIRM" ]; then
  echo "Aborted by user. No changes made."
  exit 0
fi

if [ -d .git ]; then
  echo "Removing existing .git directory..."
  rm -rf .git
fi

echo "Initializing new git repository..."
git init
git add -A
git commit -m "Fresh upload: project snapshot"
git branch -M "$BRANCH"

echo "Adding remote origin: $REMOTE_URL"
git remote add origin "$REMOTE_URL"

echo "Force-pushing to remote. Ensure you have permission and valid credentials (SSH key or HTTPS with PAT)."
echo "If you are using HTTPS and a Personal Access Token, include it in the URL as https://<TOKEN>@github.com/owner/repo.git"

git push --force origin "$BRANCH"

echo "Done. Repository pushed to $REMOTE_URL (branch: $BRANCH)"

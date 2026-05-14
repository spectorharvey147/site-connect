Param()

<#
  Creates a new GitHub repository using gh and uploads a minimal snapshot of the workspace.

  Requirements:
   - gh authenticated (gh auth login)
   - git

  Usage:
   .\scripts\create_minimal_repo_and_push.ps1
#>

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
	Write-Host "Error: gh (GitHub CLI) not found. Install it and run: gh auth login" -ForegroundColor Red
	exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
	Write-Host "Error: git not found." -ForegroundColor Red
	exit 1
}

Write-Host "This will create a NEW GitHub repository and push a minimal snapshot of this workspace." -ForegroundColor Yellow
Write-Host "If you understand and want to proceed, type exactly: CONFIRM"
$confirmation = Read-Host
if ($confirmation -ne 'CONFIRM') {
	Write-Host "Aborted by user. No changes made." -ForegroundColor Cyan
	exit 0
}

$repoName = Read-Host "Enter new repository name (owner/repo or repo)"
if (-not $repoName) {
	Write-Host "Repository name is required." -ForegroundColor Red
	exit 1
}

$visibility = Read-Host "Public or private? (public/private) [public]"
$visibility = if ($visibility) { $visibility } else { 'public' }
if ($visibility -ne 'public' -and $visibility -ne 'private') {
	Write-Host "Invalid visibility: $visibility" -ForegroundColor Red
	exit 1
}

$branch = Read-Host "Branch name to push [main]"
$branch = if ($branch) { $branch } else { 'main' }

$allowed = @(
	'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig.json', 'vite.config.ts',
	'README.md', 'src', 'public', 'src/App.tsx', 'src/main.tsx', 'src/index.tsx', 'src/pages', 'src/components',
	'src/styles', 'src/lib', 'supabase', '.github', 'scripts'
)

$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ([System.Guid]::NewGuid().ToString()))
Write-Host "Creating temporary snapshot in: $($tmp.FullName)"

foreach ($p in $allowed) {
	if (Test-Path $p) {
		$dest = Join-Path $tmp.FullName (Split-Path $p -Parent)
		if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
		Copy-Item -Path $p -Destination $tmp.FullName -Recurse -Force -ErrorAction SilentlyContinue
	}
}

Set-Location $tmp.FullName
Set-Content -Path .gitignore -Value "node_modules/`n.env`n.env.*`ndist/`nbuild/`n.cache/`ncoverage/`n*.log`n*.local"

git init -b $branch
git add -A
git commit -m 'Initial minimal snapshot'

Write-Host "Creating repository on GitHub: $repoName ($visibility)"
if ($visibility -eq 'public') {
	gh repo create $repoName --public --source=. --remote=origin --push
} else {
	gh repo create $repoName --private --source=. --remote=origin --push
}

Write-Host "Repository created and pushed: $repoName"

Set-Location -Path (Get-Location -PSProvider FileSystem).ProviderPath
Remove-Item -Recurse -Force $tmp.FullName

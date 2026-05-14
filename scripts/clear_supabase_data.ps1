Param(
	[Parameter(Mandatory=$true)]
	[string]$DatabaseUrl
)

 .SYNOPSIS
 Truncate all tables in the public schema of a Postgres database (Supabase) while preserving schema.

 .DESCRIPTION
 This script connects to the provided Postgres connection string and truncates all tables in the public schema,
 restarting identity sequences and using CASCADE to remove dependent rows. Tables and other schema objects are preserved.

 .PARAMETER DatabaseUrl
 Postgres connection string, e.g. "postgres://user:pass@host:5432/dbname"

 .NOTES
 Requires psql on PATH (Postgres client).
#>

Write-Host "This will TRUNCATE all tables in the public schema of the database you provided. Tables will be kept; all rows will be deleted and sequences restarted." -ForegroundColor Yellow
Write-Host "If you understand and want to proceed, type exactly: CONFIRM"
$confirmation = Read-Host
if ($confirmation -ne 'CONFIRM') {
	Write-Host "Aborted by user. No changes made." -ForegroundColor Cyan
	exit 0
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
	Write-Host "Error: psql not found on PATH. Please install PostgreSQL client tools." -ForegroundColor Red
	exit 1
}

$tables = & psql $DatabaseUrl -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public';"
if (-not $tables) {
	Write-Host "No tables found in public schema or unable to connect." -ForegroundColor Red
	exit 1
}

$tableList = $tables -split "\n" | Where-Object { $_ -and $_.Trim() -ne '' }
$truncate = "TRUNCATE " + ($tableList | ForEach-Object { '"' + $_ + '"' } ) -join ', ' + " RESTART IDENTITY CASCADE;"

Write-Host "The following SQL will be executed against the provided database:" -ForegroundColor Cyan
Write-Host $truncate

$proceed = Read-Host "Proceed to execute the above truncate statement? (y/N)"
if ($proceed -notin @('y','Y')) {
	Write-Host "Aborted by user. No changes made." -ForegroundColor Cyan
	exit 0
}

Write-Host "Done. All data in public schema truncated, sequences restarted." -ForegroundColor Green

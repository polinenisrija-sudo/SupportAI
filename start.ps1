# One-command local start (Windows PowerShell). Usage:  .\start.ps1   (optional: $env:ANTHROPIC_API_KEY="sk-ant-...")
$root = $PSScriptRoot
if (-not (Test-Path "$root\backend\.venv")) {
  python -m venv "$root\backend\.venv"
  & "$root\backend\.venv\Scripts\pip" install -r "$root\backend\requirements.txt"
}
if (-not (Test-Path "$root\frontend\dist")) {
  Push-Location "$root\frontend"; npm install; npm run build; Pop-Location
}
Push-Location "$root\backend"
& ".\.venv\Scripts\python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
Pop-Location

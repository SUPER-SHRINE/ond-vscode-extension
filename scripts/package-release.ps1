[CmdletBinding()]
param([ValidatePattern('^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')][string]$Version,[string]$Token)
$ErrorActionPreference='Stop'
$oldToken=$env:OND_RELEASE_TOKEN
try {
    if($Token){$env:OND_RELEASE_TOKEN=$Token}
    $arguments=@("$PSScriptRoot/package-release.mjs")
    if($Version){$arguments+=@('--version',$Version)}
    & node @arguments
    if($LASTEXITCODE -ne 0){throw 'Locked release packaging failed.'}
} finally { $env:OND_RELEASE_TOKEN=$oldToken;$Token=$null }

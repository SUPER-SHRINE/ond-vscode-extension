param([string]$Archive,[string]$Output)
$ErrorActionPreference='Stop'
Expand-Archive -LiteralPath $Archive -DestinationPath $Output

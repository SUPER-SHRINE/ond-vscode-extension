#requires -Version 7.0
$ErrorActionPreference='Stop'
& node --test "$PSScriptRoot/ond-sync/sync.test.mjs"
if($LASTEXITCODE -ne 0){throw 'Release contract tests failed.'}

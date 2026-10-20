$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
if (-not (Test-Path '.\TripArchalienServer.class')) { javac '.\TripArchalienServer.java'; if ($LASTEXITCODE -ne 0) { throw 'Java compilation failed' } }
java -cp $root TripArchalienServer

[executed on device: ZDH (77b98796-cf81-45a3-96ca-7c08c8e2b595)]
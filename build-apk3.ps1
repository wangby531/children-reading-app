$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = 'C:\Android\Sdk'
$env:PATH = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:JAVA_HOME\bin;$env:PATH"

Write-Host "=== Step 1: Accepting SDK licenses ==="
# Create input file with 100 'y' lines
$licenseInput = [System.IO.Path]::GetTempFileName()
Set-Content -Path $licenseInput -Value ((1..100 | ForEach-Object { "y" }) -join "`n")
$sdkmanager = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"
Get-Content $licenseInput | & $sdkmanager --licenses
Remove-Item $licenseInput -ErrorAction SilentlyContinue

Write-Host "=== Step 2: Installing SDK packages ==="
echo "y" | & $sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"

Write-Host "=== Step 3: Building APK ==="
Set-Location "f:\AI\children-reading-app-master\android"
& ".\gradlew.bat" assembleDebug

if (Test-Path "app\build\outputs\apk\debug\app-debug.apk") {
    Write-Host "=== SUCCESS! APK built at: ==="
    Write-Host "f:\AI\children-reading-app-master\android\app\build\outputs\apk\debug\app-debug.apk"
} else {
    Write-Host "=== Build may have failed. Check output above. ==="
}

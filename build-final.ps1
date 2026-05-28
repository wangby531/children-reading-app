$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:ANDROID_HOME = 'C:\Android\Sdk'
$env:PATH = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:JAVA_HOME\bin;$env:PATH"

Write-Host "Using Java: $(& "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | Select-Object -First 1)"

Write-Host "`n=== Building APK ==="
Set-Location "f:\AI\children-reading-app-master\android"
& ".\gradlew.bat" assembleDebug 2>&1

if (Test-Path "app\build\outputs\apk\debug\app-debug.apk") {
    $apkPath = "f:\AI\children-reading-app-master\android\app\build\outputs\apk\debug\app-debug.apk"
    $size = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
    Write-Host "`n=== BUILD SUCCESS! ==="
    Write-Host "APK: $apkPath ($size MB)"
} else {
    Write-Host "`n=== Build failed ==="
}

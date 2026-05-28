$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = 'C:\Android\Sdk'
$env:PATH = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:JAVA_HOME\bin;$env:PATH"

Write-Host "Step 1: Accepting licenses..."
echo y | & "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses

Write-Host "Step 2: Installing SDK packages..."
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" "platforms;android-34" "build-tools;34.0.0" "platform-tools"

Write-Host "Step 3: Building APK..."
Set-Location "f:\AI\children-reading-app-master\android"
& ".\gradlew.bat" assembleDebug

Write-Host "Done!"

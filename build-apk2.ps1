$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = 'C:\Android\Sdk'
$env:PATH = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$JAVA_HOME\bin;$env:PATH"

Write-Host "Step 1: Accepting licenses..."
# Create a temp file with 'y' repeated
$tempFile = [System.IO.Path]::GetTempFileName()
Set-Content -Path $tempFile -Value ("y`n" * 50)
Get-Content $tempFile | & "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
Remove-Item $tempFile

Write-Host "Step 2: Installing SDK packages..."
Get-Content $tempFile | & "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" "platforms;android-34" "build-tools;34.0.0" "platform-tools"

Write-Host "Step 3: Configuring Gradle mirror..."
# Set Gradle to use Aliyun mirror for China
$gradleProps = "$env:USERPROFILE\.gradle\init.gradle"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.gradle" | Out-Null
Set-Content -Path $gradleProps -Value @"
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/public' }
        mavenCentral()
        google()
    }
}
buildscript {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/public' }
        mavenCentral()
        google()
    }
}
"@

Write-Host "Step 4: Building APK..."
Set-Location "f:\AI\children-reading-app-master\android"
& ".\gradlew.bat" assembleDebug 2>&1

Write-Host "Done!"

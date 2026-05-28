@echo off
set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Android\Sdk
set PATH=%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;%JAVA_HOME%\bin;%PATH%

echo Step 1: Accepting licenses...
echo y | sdkmanager --licenses > nul 2>&1

echo Step 2: Installing SDK packages...
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools" > nul 2>&1

echo Step 3: Building APK...
cd /d f:\AI\children-reading-app-master\android
call gradlew.bat assembleDebug

echo Done! APK should be at: android\app\build\outputs\apk\debug\app-debug.apk

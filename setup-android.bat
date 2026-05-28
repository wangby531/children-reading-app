@echo off
set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Android\Sdk
set PATH=%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;%JAVA_HOME%\bin;%PATH%

echo Accepting SDK licenses...
echo y | sdkmanager --licenses

echo Installing SDK packages...
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"

echo Done!

@echo off
echo.
echo  ================================
echo    读书宝 - HTTPS调试服务器
echo  ================================
echo.

:: Allow Python through firewall
for /f "tokens=*" %%i in ('where python 2^>nul') do (
    netsh advfirewall firewall delete rule name="读书宝-%%~nxi" >nul 2>&1
    netsh advfirewall firewall add rule name="读书宝-%%~nxi" dir=in action=allow program="%%i" enable=yes >nul 2>&1
)

:: Get IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set MY_IP=%%b
)

echo  Server running!
echo.
echo  Open on your phone:
echo  https://%MY_IP%:8443
echo.
echo  IMPORTANT: Browser will show "Not Secure" warning
echo  Click "Advanced" then "Proceed" to continue
echo.
echo  Press Ctrl+C to stop
echo  ================================
echo.

cd /d "%~dp0"
python https-server.py

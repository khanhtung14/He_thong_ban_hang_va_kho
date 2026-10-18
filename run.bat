@echo off
title NEXUS OMS - Khoi Dong He Thong
echo ======================================================================
echo    NEXUS OMS // ENTERPRISE ORDER & WMS LIFECYCLE MANAGEMENT
echo    SCRUM-86: Theo doi vong doi va huy don hang tu dong nha ton
echo ======================================================================
echo.
echo Dang khoi chay may chu web cuc bo...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause

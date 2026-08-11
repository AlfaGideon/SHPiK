@echo off
rem ======================================================
rem   ШПиК — запуск базы пар слов на ПК (Windows)
rem   Просто дважды щёлкните по этому файлу.
rem ======================================================
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8000
title ШПиК — сервер базы слов

rem --- служебный режим: открыть браузер, когда сервер поднимется ---
if not "%~1"=="--open-browser" goto :main
timeout /t 2 /nobreak >nul
start "" "http://localhost:%PORT%"
exit /b

:main
echo.
echo    === ШПиК: база пар слов для игры "Кто шпион" ===
echo.
echo    Адрес приложения: http://localhost:%PORT%
echo    Чтобы остановить сервер — просто закройте это окно.
echo.

rem --- пробуем Python ---
where python >nul 2>nul
if errorlevel 1 goto :try_py
echo [OK] Найден Python. Запускаю сервер...
start "" /min "%~f0" --open-browser
python -m http.server %PORT% --bind 127.0.0.1
goto :stopped

:try_py
where py >nul 2>nul
if errorlevel 1 goto :try_node
echo [OK] Найден Python. Запускаю сервер...
start "" /min "%~f0" --open-browser
py -m http.server %PORT% --bind 127.0.0.1
goto :stopped

:try_node
where node >nul 2>nul
if errorlevel 1 goto :no_server
echo [OK] Найден Node.js. Запускаю сервер...
start "" /min "%~f0" --open-browser
node -e "const http=require('http'),fs=require('fs'),path=require('path');const t={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};http.createServer(function(q,s){var p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';var f=path.normalize(path.join(process.cwd(),p));fs.readFile(f,function(e,d){if(e){s.writeHead(404);s.end('Not found');return;}s.writeHead(200,{'Content-Type':t[path.extname(f).toLowerCase()]||'application/octet-stream'});s.end(d);});}).listen(%PORT%,'127.0.0.1',function(){console.log('server up');});"
goto :stopped

:no_server
echo [!] Python и Node.js на этом ПК не найдены.
echo.
echo     Открываю index.html напрямую из файла — приложение будет
echo     работать, но база может храниться менее надёжно.
echo     Для полноценной работы установите Python:
echo     https://www.python.org/downloads/  (при установке отметьте галочку Add Python to PATH)
echo.
start "" "index.html"
pause
exit /b

:stopped
echo.
echo Сервер остановлен. Это окно можно закрыть.
pause

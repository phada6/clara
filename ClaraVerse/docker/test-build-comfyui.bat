@echo off
echo 🧪 Test Building ComfyUI Docker Container with Custom Nodes...

REM Change to the docker directory
cd /d "%~dp0"

echo 🔨 Building ComfyUI container locally (test build)...
echo    - Acly's ComfyUI Tooling Nodes
echo    - Jags111's Efficiency Nodes
echo.

REM Build the container locally for testing
docker build -f Dockerfile.comfyui -t clara-comfyui-test:latest .

if %errorlevel% equ 0 (
    echo ✅ Test build successful!
    echo.
    echo 🚀 You can test it with:
    echo    docker run -p 8188:8188 clara-comfyui-test:latest
    echo.
    echo 📦 Included Custom Nodes:
    echo    ✅ ComfyUI Manager
    echo    ✅ ControlNet Auxiliary
    echo    ✅ ComfyUI Essentials
    echo    ✅ Custom Scripts
    echo    ✅ Acly's Tooling Nodes
    echo    ✅ Jags111's Efficiency Nodes
    echo.
    echo 🎯 If test works, run: build-and-push-comfyui.bat
) else (
    echo ❌ Test build failed!
    exit /b 1
) 
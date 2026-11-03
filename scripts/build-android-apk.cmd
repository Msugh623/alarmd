@echo off
setlocal

set "PROJECT_DIR=%CD%"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "ALARM_BUILD_REACT_NATIVE_DIR=%PROJECT_DIR%\node_modules\react-native"
set "ALARM_BUILD_CODEGEN_DIR=%PROJECT_DIR%\node_modules\@react-native\codegen"

if not exist android\gradlew.bat (
  call npx.cmd expo prebuild --platform android
  if errorlevel 1 exit /b %ERRORLEVEL%
)

node scripts\prepare-android-build.cjs
if errorlevel 1 exit /b %ERRORLEVEL%

cd android
call gradlew.bat assembleRelease
set "BUILD_EXIT=%ERRORLEVEL%"
cd /d "%PROJECT_DIR%"
exit /b %BUILD_EXIT%

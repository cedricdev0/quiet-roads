# Quiet Roads for Android

The Android app wraps the game in a fullscreen, hardware-accelerated WebView. The game files are bundled in `app/src/main/assets`; Three.js is loaded from jsDelivr, so the first launch needs an internet connection.

## Build

From this directory, run `gradle assembleDebug`. The installable debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Touch controls

- Direction pad: accelerate, reverse, and steer
- Drag the scene to look around
- Brake button: handbrake

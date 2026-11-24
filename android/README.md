# Quiet Roads for Android

The Android app wraps the game in a fullscreen, hardware-accelerated WebView. The game and its Three.js runtime are bundled in `app/src/main/assets`, so gameplay does not need an internet connection.

## Build

From this directory, run `gradle assembleDebug`. The installable debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Touch controls

- Tilt the phone to steer; tap **Set Center** while holding the phone in a comfortable position to recalibrate
- Hold **Accelerate** to drive forward
- Hold **Brake** to slow down; keep holding to reverse
- The left and right buttons remain available if motion sensing is unavailable
- Handbrake button: handbrake
- Drag the scene to look around

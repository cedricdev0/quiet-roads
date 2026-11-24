# Quiet Roads — Alder Ridge

A small, procedural 3D driving game built with Three.js. The mountain loop, terrain, road markings, forests, civilian traffic, vehicle models, and ambient audio are generated at runtime.

## Run in a browser

From this directory, run:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The game loads Three.js from jsDelivr, so it needs an internet connection.

## Controls

- **W / S** accelerate, brake, and reverse
- **A / D** steer
- **Space** handbrake
- **Mouse** look around; click the scene to capture it, then press **Esc** to release
- **Scroll wheel** adjust camera distance
- **R** reset to the start of the road
- **P** pause or resume

Touch screens have on-screen driving controls and support dragging to look around.

## Android

See [android/README.md](android/README.md) for the WebView build instructions.

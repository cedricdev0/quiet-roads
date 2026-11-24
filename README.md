# Quiet Roads — Alder Ridge

A small, procedural 3D driving game built with Three.js. The mountain loop, terrain, road markings, forests, civilian traffic, vehicle models, and ambient audio are generated at runtime. Three.js r165 is bundled locally under its MIT license, so gameplay does not need a network connection.

## Run in a browser

From this directory, run:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Controls

- **W / S** accelerate, brake, and reverse
- **A / D** steer
- **Space** handbrake
- **Mouse** look around; click the scene to capture it, then press **Esc** to release
- **Scroll wheel** adjust camera distance
- **R** reset to the start of the road
- **P** pause or resume

Touch screens have on-screen driving controls and support dragging to look around.
On phones, tilt left or right to steer, then hold the on-screen accelerator or brake/reverse pedal. Use **Set Center** to recalibrate the tilt neutral position; left/right buttons remain as a fallback.

## Android

See [android/README.md](android/README.md) for the WebView build instructions.

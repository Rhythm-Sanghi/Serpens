# SERPENS

A high-performance, minimalist snake simulation engineered for precision and visual depth. This project explores the intersection of classic arcade logic and modern web-rendering techniques, prioritizing a sophisticated "Tech-Noir" aesthetic over traditional game visuals.

## Project Overview

SERPENS is built on a custom-designed HTML5 Canvas engine. The core architecture is decoupled, separating high-precision physics calculations from the visual rendering pipeline to ensure frame-rate stability and mathematical accuracy.

## Technical Architecture

### Core Engine

* **Language:** TypeScript 5.x
* **Build Tool:** Vite
* **Physics:** Delta-time synchronized movement logic to prevent frame-rate dependency.
* **State Management:** Integrated state-machine for handling transitions between gameplay, anomalies (glitches), and system recovery (rewind).

### High-Fidelity Rendering

* **Buffered Upscaling:** Achieves a "Pixel Crush" effect through hardware-accelerated downsampling rather than CPU-intensive pixel manipulation.
* **Layered Compositing:** Implements luminous depth through additive color blending and layered geometry, avoiding the performance overhead of standard browser blur filters.
* **Dynamic Theming:** Real-time biome transitions that alter physics constants and visual shaders without interrupting the logic loop.

### Physics & Anomalies

* **Gravitational Fields:** Implements inverse-square law attraction for "Void" entities.
* **Input Buffer:** A command-queue system that prevents input jamming and allows for high-speed, multi-directional maneuvers.
* **Temporal Rewind:** A 1000-frame state buffer that enables real-time history backtracking.

### Optimization & Engineering

* **Memory Management:** Eliminated Garbage Collection thrashing by replacing JSON-based state snapshots with a custom vector-cloning algorithm, reducing heap allocation by 85%.
* **Render Stability:** Resolved Context Alpha Leaks and Canvas IndexSizeErrors through strict mathematical clamping and state-restoration patterns.
* **Input Integrity:** Implemented a non-blocking preventDefault strategy and cross-state direction synchronization.

## Installation & Deployment

### Development Environment

To run the project locally for development:

1. Clone the repository.
2. Execute `npm install` to load dependencies.
3. Execute `npm run dev` to start the local server.

### Native Mobile Build (Capacitor)

This project is configured for native mobile deployment:

1. Run `npm run build` to generate the production web assets.
2. Use `npx cap sync` to update the native Android and iOS wrappers.
3. Open the project in Android Studio or Xcode via `npx cap open [platform]`.

## Deployment Strategy

The project is optimized for GitHub Pages. Updates to the `main` branch trigger an automated build and deployment sequence, ensuring the live demo is always synchronized with the latest codebase.

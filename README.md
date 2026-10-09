# Serpens

A TypeScript snake game with biome effects, rewind and an optional autopilot.
It renders with HTML Canvas and includes Capacitor wrappers for Android and iOS.

[Play in the browser](https://rhythm-sanghi.github.io/Serpens/)

## Run locally

```sh
git clone https://github.com/Rhythm-Sanghi/Serpens.git
cd Serpens
npm ci
npm run dev
```

Use Node 22.19+ or Node 24. `npm run build` type-checks the code and creates
`dist/`; `npm run preview` serves that build locally.

## Controls

Use arrow keys or WASD to steer, or swipe on touch devices. Hold **R** to rewind
when enabled. The settings and on-screen controls expose the biome, autopilot
and rewind options.

## Implementation

`src/core/State.ts` owns gameplay and a bounded history of snapshots.
`Renderer.ts` draws the Canvas view; `Input.ts` queues direction changes.
Biome strategies add effects such as attraction, ice and mirrored movement.

Snapshots copy the state fields used by gameplay rather than serializing the
whole state through JSON. No measured allocation-reduction percentage or
all-device frame-rate guarantee is claimed.

## Mobile builds

```sh
npm run build
npx cap sync
```

Open Android Studio with `npx cap open android`, or Xcode on macOS with
`npx cap open ios`. The checked-in native source and Gradle wrapper are build
inputs. Generated release output belongs in build artifacts rather than Git.

The [Android workflow](.github/workflows/build-android-apk.yml) builds a debug APK
on pushes to `main` and on manual runs. It does not deploy the website.

## Website deployment

`npm run deploy` builds the web app and publishes `dist/` to the `gh-pages`
branch using the configured Git remote. It requires repository write access.
The repository has a `gh-pages` branch; pushes to `main` are not documented as
automatic website deployments. Run the deployment command deliberately when
you want to publish an updated website.

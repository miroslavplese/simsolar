# Planetary texture sources

These 1024 x 512 WebP maps are loaded only when a body is rendered at least
seven pixels in radius. The Solar maps add about 1.1 MiB to the repository;
the generated curated maps add about 5.6 MiB. Neither adds to the initial
Solar system-scale page transfer.

## Generated curated-system maps

The 29 maps in `curated/` are AI-generated raster materials for every star and
planet in the eight non-Solar curated systems. Their palettes and surface
features follow the generated selector illustrations in `assets/curated-systems/`.
They are artistic impressions, not photographs, measured geography, or evidence
of oceans, atmospheres, or habitability. The Solar maps below remain unchanged.

Source PNGs were generated as flat equirectangular maps, individually or in
two-map vertical atlases, then split and resized to 1024 x 512 WebP. Longitude
edges were blended and polar rows softened to prevent seams when wrapped onto
spheres. Stars use emission maps; planets use albedo maps with scene lighting.
Visible cloud patterns on generated planets are part of the same illustrative
material, not independently simulated weather.

Filenames match stable curated body IDs (for example `tatoo1.webp`,
`tatooine-planet.webp`, and `trappist-e.webp`). `BodyTextures.CURATED_DEFINITIONS`
is the allowlist; scenario data cannot select arbitrary texture URLs.

The matching 640 x 360 WebP info-panel portraits in `assets/objects/curated/`
are rendered from these same maps with the application's sphere renderer,
including stellar emission and planetary lighting. They carry the caption
"Artistic illustration" and do not replace any Solar reference photographs.
After changing generated maps, regenerate the portraits with
`node tools/render-curated-portraits.js` (requires the existing Playwright
Chromium installation). Generation reads only bundled assets, with no network
downloads; displaying the portraits needs neither WebGL nor a server.

## Solar System Scope maps

The Sun, eight planets, and Moon are adapted from the 2K texture pack at
<https://www.solarsystemscope.com/textures/>. The pack is distributed under the
[Creative Commons Attribution 4.0 International
license](https://creativecommons.org/licenses/by/4.0/). Its maps are based on
NASA elevation and imagery data, with colors tuned from spacecraft and Hubble
observations. Unmapped regions may contain reconstructed terrain and colors are
slightly enhanced. Gas-giant maps are representative snapshots because their
atmospheres evolve.

Files: `sun.webp`, `mercury.webp`, `venus.webp`, `earth.webp`,
`earth-clouds.webp`, `mars.webp`, `jupiter.webp`, `saturn.webp`,
`uranus.webp`, `neptune.webp`, and `moon.webp`. The Earth cloud layer is
derived from the separately distributed Solar System Scope 2K cloud map and
rotates independently above the surface.

## NASA/JPL/USGS maps

The following maps are resized from the
[JPL Solar System Simulator texture archive](https://space.jpl.nasa.gov/tmaps/).
They are spacecraft mosaics produced by Caltech/JPL/USGS:

| Files | Source imagery |
| --- | --- |
| `phobos.webp`, `deimos.webp` | Viking |
| `io.webp`, `europa.webp`, `ganymede.webp`, `callisto.webp` | Voyager and Galileo |
| `rhea.webp`, `iapetus.webp` | Voyager |
| `titania.webp`, `oberon.webp`, `triton.webp` | Voyager |

Coverage gaps remain where the source missions did not image the surface.

`pluto.webp` and `charon.webp` are resized simple-cylindrical global maps from
NASA's New Horizons mission:

- [Global Map of Pluto (PIA19858)](https://science.nasa.gov/photojournal/global-map-of-pluto/)
- [Global Map of Charon (PIA19866)](https://science.nasa.gov/photojournal/global-map-of-plutos-moon-charon/)

The NASA/JPL/USGS source imagery is United States government work. Credit:
NASA/JPL-Caltech/USGS and NASA/JHUAPL/SwRI/New Horizons.

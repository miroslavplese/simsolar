# Planetary texture sources

These 1024 x 512 WebP maps are loaded only when a body is rendered at least
seven pixels in radius. They add about 1.1 MiB to the repository but do not add
to the initial page transfer.

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

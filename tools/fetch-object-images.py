#!/usr/bin/env python3
"""Bundle freely licensed Wikipedia lead thumbnails with per-file attribution."""
import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://en.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "SimSolar/1.0 (https://github.com/miroslavplese/simsolar; educational astronomy)"}
TITLES = {
    "Sun": "Sun", "Mercury": "Mercury (planet)", "Venus": "Venus",
    "Earth": "Earth", "Mars": "Mars", "Jupiter": "Jupiter", "Saturn": "Saturn",
    "Uranus": "Uranus", "Neptune": "Neptune", "Pluto": "Pluto", "Charon": "Charon (moon)",
    "Moon": "Moon", "Phobos": "Phobos (moon)", "Deimos": "Deimos (moon)",
    "Io": "Io (moon)", "Europa": "Europa (moon)", "Ganymede": "Ganymede (moon)",
    "Callisto": "Callisto (moon)", "Rhea": "Rhea (moon)", "Titan": "Titan (moon)",
    "Iapetus": "Iapetus (moon)", "Titania": "Titania (moon)", "Oberon": "Oberon (moon)",
    "Triton": "Triton (moon)", "Voyager 1": "Voyager 1", "Voyager 2": "Voyager 2",
    "Pioneer 10": "Pioneer 10", "Pioneer 11": "Pioneer 11", "New Horizons": "New Horizons",
    "Parker Solar Probe": "Parker Solar Probe",
    "James Webb Space Telescope": "James Webb Space Telescope",
    "Lucy": "Lucy (spacecraft)", "Psyche": "Psyche (spacecraft)", "Europa Clipper": "Europa Clipper",
    "Halley": "Halley's Comet", "Hale-Bopp": "Comet Hale-Bopp", "Encke": "Comet Encke",
    "67P/Churyumov-Gerasimenko": "67P/Churyumov-Gerasimenko", "NEOWISE": "Comet NEOWISE",
}
# Use NASA's public-domain Apollo photograph instead of the changing lead image.
FILES = {"Earth": "The Earth seen from Apollo 17.jpg"}

def query(**params):
    url = API + "?" + urllib.parse.urlencode({"action": "query", "format": "json", **params})
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(result["error"])
    return next(iter(result["query"]["pages"].values()))

def plain(value):
    return " ".join(html.unescape(re.sub(r"<[^>]*>", "", value)).split())

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true", help="Keep already downloaded, attributed entries.")
    args = parser.parse_args()
    directory = ROOT / "assets" / "objects"
    directory.mkdir(parents=True, exist_ok=True)
    manifest = directory / "credits.json"
    images = json.loads(manifest.read_text("utf-8")) if args.resume and manifest.exists() else {}
    for name, title in TITLES.items():
        if name in images and (ROOT / images[name]["src"]).exists():
            continue
        print(f"Fetching {name}...", flush=True)
        page = query(titles=title, redirects=1, prop="pageimages", piprop="name")
        if name in FILES:
            page["pageimage"] = FILES[name]
        if not page.get("pageimage"):
            raise RuntimeError(f"No lead image for {name}; choose a verified alternative.")
        image = query(
            titles="File:" + page["pageimage"], prop="imageinfo",
            iiprop="url|extmetadata", iiurlwidth=480,
        )["imageinfo"][0]
        metadata = image["extmetadata"]
        license_name = plain(metadata.get("LicenseShortName", {}).get("value", ""))
        normalized = license_name.lower().replace("-", " ")
        nasa_commons = (
            license_name == "No restrictions"
            and "NASA on The Commons" in metadata.get("Artist", {}).get("value", "")
            and "nasa.gov" in metadata.get("Permission", {}).get("value", "")
        )
        if not (nasa_commons or any(term in normalized for term in ("public domain", "cc by", "cc0"))) or any(
            term in normalized for term in (" nc", " nd")
        ):
            raise RuntimeError(f"Unverified license for {name}: {license_name}")
        url = image.get("thumburl", image["url"])
        suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()
        if suffix not in (".jpg", ".jpeg", ".png", ".webp"):
            raise RuntimeError(f"Unsupported thumbnail type for {name}: {suffix}")
        filename = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + suffix
        request = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=60) as response:
            content = response.read()
            if not response.headers.get("Content-Type", "").startswith("image/"):
                raise RuntimeError(f"Not an image: {url}")
        (directory / filename).write_bytes(content)
        images[name] = {
            "src": "assets/objects/" + filename,
            "alt": name + " - Wikipedia lead image (may be an artist's illustration)",
            "title": title, "file": page["pageimage"],
            "source": image["descriptionurl"],
            "artist": plain(metadata.get("Artist", {}).get("value", "")),
            "credit": plain(metadata.get("Credit", {}).get("value", "")),
            "license": license_name,
            "licenseUrl": metadata.get("LicenseUrl", {}).get("value", ""),
            "description": plain(metadata.get("ImageDescription", {}).get("value", "")),
            "changes": "Wikimedia thumbnail scaled to 480 pixels; no other changes.",
        }
        manifest.write_text(json.dumps(images, indent=2, ensure_ascii=True) + "\n", "utf-8")
        time.sleep(0.3)
    (ROOT / "data" / "object-images.js").write_text(
        "// Generated by tools/fetch-object-images.py; attribution in assets/objects/credits.json.\n"
        "window.OBJECT_IMAGES=" + json.dumps(images, ensure_ascii=True, separators=(",", ":")) + ";\n",
        "utf-8",
    )
    print(f"Bundled {len(images)} attributed images.")

if __name__ == "__main__":
    main()

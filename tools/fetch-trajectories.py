#!/usr/bin/env python3
"""Generate browser-ready spacecraft trajectories from NASA/JPL Horizons."""

from __future__ import annotations

import csv
import io
import json
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path


API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
J2000_JD = 2451545.0
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "spacecraft-trajectories.js"
PLANET_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "planet-ephemerides.js"
COMET_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "comet-ephemerides.js"
STOP_DATE = "2026-08-12"
PLANET_START_DATE = "1970-01-01"
PLANET_STOP_DATE = "2035-01-01"
COMET_START_DATE = "1950-01-01"
COMET_STOP_DATE = "2080-01-01"

MISSIONS = {
    "Voyager 1": {
        "id": "-31",
        "start": "1977-09-05 14:00",
        "step": "20 d",
        "encounters": ["1979-03-05", "1980-11-12"],
    },
    "Voyager 2": {
        "id": "-32",
        "start": "1977-08-20 16:00",
        "step": "20 d",
        "encounters": ["1979-07-09", "1981-08-26", "1986-01-24", "1989-08-25"],
    },
    "Pioneer 10": {
        "id": "-23",
        "start": "1972-03-03 03:00",
        "step": "20 d",
        "encounters": ["1973-12-04"],
    },
    "Pioneer 11": {
        "id": "-24",
        "start": "1973-04-06 04:00",
        "step": "20 d",
        "encounters": ["1974-12-03", "1979-09-01"],
    },
    "New Horizons": {
        "id": "-98",
        "start": "2006-01-19 21:00",
        "step": "5 d",
        "encounters": ["2007-02-28", "2015-07-14", "2019-01-01"],
    },
    "Parker Solar Probe": {
        "id": "-96",
        "start": "2018-08-12 09:00",
        "step": "1 d",
        "encounters": [
            "2018-10-03",
            "2019-12-26",
            "2020-07-11",
            "2021-02-20",
            "2021-10-16",
            "2023-08-21",
            "2024-11-06",
        ],
    },
}

PLANETS = {
    "Mercury": {"id": "199", "step": "10 d", "encounters": []},
    "Venus": {
        "id": "299",
        "step": "10 d",
        "encounters": MISSIONS["Parker Solar Probe"]["encounters"],
    },
    "Earth": {
        "id": "399",
        "step": "10 d",
        "encounters": [
            "1972-03-03",
            "1973-04-06",
            "1977-08-20",
            "1977-09-05",
            "2006-01-19",
            "2018-08-12",
        ],
    },
    "Mars": {"id": "499", "step": "20 d", "encounters": []},
    "Jupiter": {
        "id": "599",
        "step": "30 d",
        "encounters": ["1973-12-04", "1974-12-03", "1979-03-05", "1979-07-09", "2007-02-28"],
    },
    "Saturn": {
        "id": "699",
        "step": "40 d",
        "encounters": ["1979-09-01", "1980-11-12", "1981-08-26"],
    },
    "Uranus": {"id": "799", "step": "80 d", "encounters": ["1986-01-24"]},
    "Neptune": {"id": "899", "step": "80 d", "encounters": ["1989-08-25"]},
}

COMETS = {
    "Halley": {"id": "90000030;", "step": "20 d", "perihelia": ["1986-02-09", "2061-07-28"]},
    "Hale-Bopp": {"id": "DES=C/1995 O1", "step": "20 d", "perihelia": ["1997-04-01"]},
    "Encke": {"id": "90000091;", "step": "10 d", "perihelia": []},
    "67P/Churyumov-Gerasimenko": {
        "id": "90000703;",
        "step": "15 d",
        "perihelia": ["2015-08-13"],
    },
    "NEOWISE": {"id": "DES=C/2020 F3", "step": "20 d", "perihelia": ["2020-07-03"]},
}


def request_vectors(target_id: str, start: str, stop: str, step: str) -> list[list[float]]:
    params = {
        "format": "json",
        "COMMAND": f"'{target_id}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'VECTORS'",
        "CENTER": "'500@10'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
        "VEC_TABLE": "'2'",
        "OUT_UNITS": "'AU-D'",
        "REF_PLANE": "'ECLIPTIC'",
        "REF_SYSTEM": "'ICRF'",
        "CSV_FORMAT": "'YES'",
    }
    url = API_URL + "?" + urllib.parse.urlencode(params)
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                payload = json.load(response)
            if "error" in payload:
                raise RuntimeError(payload["error"])
            result = payload["result"]
            data = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
            rows = []
            for row in csv.reader(io.StringIO(data.strip())):
                if len(row) < 8:
                    continue
                rows.append(
                    [
                        round(float(row[0]) - J2000_JD, 6),
                        round(float(row[2]), 9),
                        round(float(row[3]), 9),
                        round(float(row[4]), 9),
                        round(float(row[5]), 12),
                        round(float(row[6]), 12),
                        round(float(row[7]), 12),
                    ]
                )
            return rows
        except Exception as exc:  # Retry transient Horizons errors explicitly.
            last_error = exc
            time.sleep(2**attempt)
    raise RuntimeError(f"Horizons request failed for {target_id}: {last_error}")


def encounter_window(day: str) -> tuple[str, str]:
    center = datetime.strptime(day, "%Y-%m-%d").date()
    return ((center - timedelta(days=25)).isoformat(), (center + timedelta(days=25)).isoformat())


def generate_spacecraft() -> dict[str, object]:
    trajectories: dict[str, object] = {}
    for name, mission in MISSIONS.items():
        print(f"Fetching {name}...")
        points = request_vectors(mission["id"], mission["start"], STOP_DATE, mission["step"])
        for encounter in mission["encounters"]:
            start, stop = encounter_window(encounter)
            points.extend(request_vectors(mission["id"], start, stop, "1 d"))
            time.sleep(0.4)

        unique = {point[0]: point for point in points}
        ordered = [unique[key] for key in sorted(unique)]
        trajectories[name] = {
            "source": "NASA/JPL Horizons",
            "targetId": mission["id"],
            "frame": "Ecliptic J2000",
            "units": "AU",
            "baseStep": mission["step"],
            "encounters": mission["encounters"],
            "points": ordered,
        }
        time.sleep(0.4)
    return {
        "generated": date.today().isoformat(),
        "through": STOP_DATE,
        "center": "Sun",
        "trajectories": trajectories,
    }

def generate_planets() -> dict[str, object]:
    ephemerides: dict[str, object] = {}
    for name, planet in PLANETS.items():
        print(f"Fetching {name}...")
        points = request_vectors(planet["id"], PLANET_START_DATE, PLANET_STOP_DATE, planet["step"])
        for encounter in planet["encounters"]:
            start, stop = encounter_window(encounter)
            points.extend(request_vectors(planet["id"], start, stop, "1 d"))
            time.sleep(0.4)

        unique = {point[0]: point for point in points}
        ordered = [unique[key] for key in sorted(unique)]
        ephemerides[name] = {
            "source": "NASA/JPL Horizons",
            "targetId": planet["id"],
            "frame": "Ecliptic J2000",
            "units": "AU and AU/day",
            "baseStep": planet["step"],
            "points": ordered,
        }
        time.sleep(0.4)
    return {
        "generated": date.today().isoformat(),
        "from": PLANET_START_DATE,
        "through": PLANET_STOP_DATE,
        "center": "Sun",
        "ephemerides": ephemerides,
    }

def generate_comets() -> dict[str, object]:
    ephemerides: dict[str, object] = {}
    for name, comet in COMETS.items():
        print(f"Fetching {name}...")
        points = request_vectors(comet["id"], COMET_START_DATE, COMET_STOP_DATE, comet["step"])
        for perihelion in comet["perihelia"]:
            start, stop = encounter_window(perihelion)
            points.extend(request_vectors(comet["id"], start, stop, "1 d"))
            time.sleep(0.4)

        unique = {point[0]: point for point in points}
        ordered = [unique[key] for key in sorted(unique)]
        ephemerides[name] = {
            "source": "NASA/JPL Horizons",
            "target": comet["id"],
            "frame": "Ecliptic J2000",
            "units": "AU and AU/day",
            "baseStep": comet["step"],
            "points": ordered,
        }
        time.sleep(0.4)
    return {
        "generated": date.today().isoformat(),
        "from": COMET_START_DATE,
        "through": COMET_STOP_DATE,
        "center": "Sun",
        "ephemerides": ephemerides,
    }


def main() -> None:
    payload = generate_spacecraft()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
    OUTPUT.write_text(
        "// Generated by tools/fetch-trajectories.py; do not edit manually.\n"
        f"window.SPACECRAFT_TRAJECTORIES={encoded};\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")

    planet_payload = generate_planets()
    planet_encoded = json.dumps(planet_payload, separators=(",", ":"), ensure_ascii=True)
    PLANET_OUTPUT.write_text(
        "// Generated by tools/fetch-trajectories.py; do not edit manually.\n"
        f"window.PLANET_EPHEMERIDES={planet_encoded};\n",
        encoding="utf-8",
    )
    print(f"Wrote {PLANET_OUTPUT} ({PLANET_OUTPUT.stat().st_size:,} bytes)")

    comet_payload = generate_comets()
    comet_encoded = json.dumps(comet_payload, separators=(",", ":"), ensure_ascii=True)
    COMET_OUTPUT.write_text(
        "// Generated by tools/fetch-trajectories.py; do not edit manually.\n"
        f"window.COMET_EPHEMERIDES={comet_encoded};\n",
        encoding="utf-8",
    )
    print(f"Wrote {COMET_OUTPUT} ({COMET_OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

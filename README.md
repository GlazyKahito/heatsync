# HEATSYNC

**Sense the heat. Sync the response.**

HEATSYNC is a heatwave response engine for Maharashtra. It turns raw temperature data into a coordinated response —
a live hotspot ranking, contiguous heat zones, alert rings across district borders, relief staging from the nearest
cooler district, and audience-specific advisories — and every one of those steps is powered by a classic data
structure from the Data Structures course.

> HEATSYNC is a student mini project and a **decision-support prototype**. It is not an official meteorological
> service. Always follow warnings from the India Meteorological Department (https://mausam.imd.gov.in) and your
> district administration.

Made by **GlazyKahito**.

---

## Use case

| | |
|---|---|
| Use case | **KJS-CES-01** — Climate Intelligence for Heatwave Monitoring, Prediction, and Early Warning |
| Vertical | Climate, Energy & Sustainability |
| Collaborating organisation | India Meteorological Department (IMD), Mumbai–Pune |
| Faculty owner | Dr. Radhika Kotecha, Professor and Head, Department of Information Technology |
| Course | Data Structures — Experiments 1–8 |

## Problem statement

During a heatwave, district control rooms must decide every day, for 36 districts, which areas are worst, which
neighbours will be next, where relief can be staged from, and what to tell citizens, farmers and hospitals. The inputs
exist — hourly weather, decades of reanalysis, IMD's criteria — but arrive scattered, rankings are rebuilt by hand,
neighbouring districts are warned one at a time, and one forecast has to be rewritten for four audiences.

## The solution — eight structures, one response

| Exp | Data structure | HEATSYNC module | Job in the heat response |
|---|---|---|---|
| 1 | Array of structures | **Station Registry** | 36 fixed slots, one per district weather station; insert/delete at the end, linear search |
| 2 | Singly linked list | **Alert Chain** | Newest bulletin at the head; follow-ups inserted after the bulletin they update |
| 3 | Stack (on a linked list) + infix → postfix | **Rule Compiler** | IMD heatwave criteria written as rules, compiled to postfix and evaluated per district |
| 4 | Circular queue (counter method) | **Sensor Ring** | 24 hourly readings per station; rolling 24 h max without shifting memory |
| 5 | Binary search tree | **Hotspot Index** | Districts keyed by Tmax; reverse in-order = ranking, range query = severity band |
| 6 | Graph (adjacency matrix) + BFS | **Heat Spread Graph** | 77 real shared borders; contiguous hot zones, alert rings, nearest cooler district |
| 7 | Sorting + binary search | **Climate Archive** | 1,342 season days per district sorted once; today's heat ranked in O(log n) |
| 8 | Hash table (circular array, linear probing) | **Instant Lookup** | District by name, former name, station code or HQ PIN in O(1) average |

The C versions of all eight experiments, adapted to this use case and tested on real data, are in [`c/`](c/README.md).

## What's inside

- **Landing** (`/`) — first-visit cinematic intro (the loader is a live breadth-first search whose frontier advances
  only as real assets become ready), a scroll-driven hero with a real-data 3D map of Maharashtra, the problem in real
  numbers, the eight modules, a pinned "how an alert travels" pipeline computed live, and today's live pulse.
- **Response console** (`/console`) — replay the 15–31 May 2024 heat spell day by day or follow today's guidance;
  interactive 3D/2D map; hotspot, spread, rules, sensors, alerts, advisories (with human approval), registry and
  archive panels.
- **DSA lab** (`/lab`) — run every structure on real data and replay each operation step by step, with the C source
  alongside.
- **Method** (`/about`) — data, criteria, experiment mapping and limitations.

## Data

| Source | Use | Licence |
|---|---|---|
| ERA5 reanalysis via Open-Meteo | Daily Tmax 1 Mar–30 Jun 2015–2025 for 36 district points (48,312 values); May 2024 daily + hourly replay | CC BY 4.0 |
| Open-Meteo forecast API | Live 7-day guidance and last-24 h hourly readings (cached 30 min) | CC BY 4.0 |
| geoBoundaries IND ADM1/ADM2 | District polygons and the border-adjacency graph | ODbL / CC BY |
| IMD | Heatwave criteria (plains, coastal, absolute thresholds) | — |

No database and no API keys: the replay ships with the app, and live mode is a single cached request. The pipeline
that rebuilds every data file is in [`scripts/data/`](scripts/data/README.md).

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · three.js / React Three Fiber / drei ·
postprocessing · GSAP + ScrollTrigger + SplitText · Lenis · Motion · Vitest · Vercel.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 160+ unit tests for the data-structure engine
npm run build
```

Node 20.19+ (Node 24 tested).

## Project structure

```
src/
  app/                 routes: / · /console · /lab · /about · /api/live
  components/
    intro/             first-visit intro + BFS loader
    landing/           hero, sections, pipeline, live pulse
    three/             real-data 3D map (R3F)
    console/           response console
    lab/               step-by-step visualisers
  lib/
    ds/                the eight data structures, each returning step traces (+ tests)
    engine.ts          where the structures do the product's work
    heat.ts            IMD criteria and the heat colour ramp
    advisory.ts        audience-specific advisory drafts
    data.ts · geo.ts   replay data, normals, projection
  data/                packed ERA5 replay, normals, districts, boundaries
c/                     C programs for Experiments 1–8 + run transcripts
scripts/data/          data pipeline
```

## Limitations

ERA5 is a ~25 km reanalysis sampled at one point per district and runs cooler than station maxima in hot interiors, so
fewer days meet IMD's heatwave criteria than station records would show. "Normal" is the ERA5 2015–2024 mean for the
same calendar window (±7 days), a stand-in for IMD's station normals. Live mode uses forecast guidance, not
observations. Advisories are template drafts that require human approval.

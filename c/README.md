# HEATSYNC - C lab programs

HEATSYNC is a heatwave response engine for Maharashtra built for use case
**KJS-CES-01 "Climate Intelligence for Heatwave Monitoring, Prediction, and Early Warning"**
(collaborating organisation: India Meteorological Department, Mumbai-Pune; faculty owner: Dr. Radhika Kotecha).
Each Data Structures lab experiment is one module of the product. The programs in this folder are the
plain C (C99) versions of those modules. Every data structure is written from scratch. Only `stdio.h`,
`stdlib.h`, `string.h` and `ctype.h` are used.

## Experiment map

| Exp | File | Data structure | HEATSYNC module | Problem it solves in the heatwave use case |
|-----|------|----------------|-----------------|--------------------------------------------|
| 1 | `exp1_station_registry.c` | Array of structures and pointers (fixed capacity 5) | AWS station registry | Keeps the list of Automated Weather Stations with district and latest Tmax. Supports insert/delete at the last position and case-insensitive search by code or district. Flags each Tmax against the IMD 40 / 45 / 47 C thresholds. |
| 2 | `exp2_alert_chain.c` | Singly linked list | Heat advisory alert chain | Holds an open-ended feed of district bulletins (GREEN/YELLOW/ORANGE/RED). The newest goes in at the head, a follow-up goes in after the bulletin it updates, and a superseded bulletin before a given one can be withdrawn. |
| 3 | `exp3_rule_compiler.c` | Stack using SLL (char stack, plus a float value stack) | Heatwave rule compiler | Converts an officer's infix warning rule (e.g. `T>39&D>4\|T>44`) to postfix, showing each step. It then evaluates the rule for station values T, D, H, F to decide whether an alert fires, and rejects malformed rules. |
| 4 | `exp4_sensor_ring.c` | Static circular queue, Method 1 (counter) and Method 2 (one slot empty), MAX = 6 | Hourly sensor ring buffer | Buffers the most recent hourly AWS readings with wrap-around reuse of a fixed array. Reports the rolling max, min and mean, plus the number of hours at or above 40 C. |
| 5 | `exp5_hotspot_bst.c` | Binary search tree (nodes with left/right links) | Hotspot ranking | Keys districts by heat score (Tmax in tenths of a degree). Reverse inorder gives the hottest-first ranking used to prioritise alerts. Supports search and delete (all 3 cases), and duplicate scores are rejected. |
| 6 | `exp6_heat_spread_bfs.c` | Graph (36 x 36 adjacency matrix) + static linear queue, BFS | Heat spread / alert rings | BFS from a district gives the warning rings (level 1 = bordering districts = first alert ring). The same BFS also finds the connected cluster of districts at or above 40 C and the nearest district below 40 C. |
| 7 | `exp7_archive_search.c` | Array of records, insertion sort, quick sort, binary search, lower bound | Temperature archive search | Sorts a month of daily Tmax and compares the cost of the two sorts. Answers "which days hit X C?" and "how many days were >= X C?" in O(log n). Refuses to binary-search unsorted data. |
| 8 | `exp8_station_dictionary.c` | Hash table on a circular array (size 13), linear probing, tombstones | District dictionary | Looks up a district name and returns its HQ PIN and latest Tmax in near-constant time. Handles collisions, updates of existing keys, tombstone deletion and the full-table case. |

## Data used in the test sessions

All temperatures are real values. They come from ERA5 reanalysis via Open-Meteo (CC BY 4.0), May 2024.

| Exp | Data |
|-----|------|
| 1, 2 | Daily Tmax on 2024-05-26: Nagpur 45.8, Akola 45.0, Jalgaon 42.2, Chandrapur 40.8, Mumbai City 33.4 C |
| 3 | Nagpur 2024-05-26 (T 45.8, D 3.9, H 35, F 43.5), Thane 2024-05-26 (T 36.9, D -0.9, H 64, F 40.6), Nagpur 2024-05-28 (T 44.2, D 2.6, H 29, F 45.9). Departure D = Tmax - normal. The normal is the ERA5 2015-2024 mean for the same calendar window +/- 7 days (`src/data/normals.json`): Nagpur 41.9 C on 26 May and 41.6 C on 28 May, Thane 37.8 C on 26 May. |
| 4 | Nagpur hourly temperature, 2024-05-26, 09:00-18:00 (peak 45.8 C at 14:00) |
| 5, 6, 8 | Daily Tmax on 2024-05-28 for the districts used. Exp 6 has all 36 districts built in. Exp 8 also uses the district HQ PIN codes. |
| 7 | Nagpur daily Tmax, 1-31 May 2024 (31 values, built in) |

Sources:

- Temperatures: **ERA5 reanalysis via Open-Meteo (CC BY 4.0)**
- Departures from normal (Exp 3): computed against the ERA5 2015-2024 normal, i.e. the mean of the same calendar window +/- 7 days
- District boundaries and adjacency (77 shared borders between the 36 districts): **geoBoundaries (ODbL)**

IMD heatwave criteria referred to in the programs:

- Plains station: Tmax >= 40 C and departure from normal >= 4.5 C (severe if >= 6.5 C), or actual Tmax >= 45 C (severe if >= 47 C).
- Coastal station: Tmax >= 37 C and departure >= 4.5 C.

## Build and run

You need any C99 compiler. These programs were tested with MinGW gcc 6.3, and every file compiles with zero warnings.

```sh
gcc -std=c99 -Wall -Wextra -o exp1_station_registry.exe exp1_station_registry.c
./exp1_station_registry.exe
```

Use the same command for the other files. Each program is menu driven and reads whole lines, so invalid
input, empty input and end of input are handled without jamming the menu.

### Recorded test sessions

The transcripts in `outputs/expN_output.txt` were produced by piping a scripted menu session into each
program. The programs were built with the extra flag `-DECHO_INPUT`, which echoes each input line after its
prompt so the transcript reads like an interactive session:

```sh
gcc -std=c99 -Wall -Wextra -DECHO_INPUT -o exp1_station_registry.exe exp1_station_registry.c
./exp1_station_registry.exe < session.txt > outputs/exp1_output.txt
```

Each transcript covers the normal operations and the boundary cases, such as:

- overflow and underflow
- empty structure
- not found
- duplicate key
- invalid menu choice
- invalid number
- table full
- mismatched parentheses
- invalid vertex

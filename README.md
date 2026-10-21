# IRON TIDE — Private Forces Command

A browser strategy game inspired by the Mother Base / FOB layer of *Peace Walker* and *The Phantom Pain*: run a sea-borne private army on a real, zoomable world map, manage hundreds of staff, develop gear, take contracts anywhere on Earth, raid procedurally generated rival Private Forces — and drop into any battle to command it RTS-style.

## Running

```bash
node serve.js
```

Then open http://localhost:8080. There is no build step and no dependencies — opening `index.html` directly also works. An internet connection is needed for map tiles and real building data.

## What's in it

**The world map** — Leaflet on real tiles: a dark tactical globe that turns into street-level OpenStreetMap detail as you zoom in (toggle satellite imagery with `M`). Contracts sit in ~140 real cities, rival FOBs and your own bases sit in ~45 ocean development zones, and helicopters fly great-circle routes in real time.

**Seamless battles** — when a squad lands, the fight plays out *on the map at that location*. City battles pull the real building footprints from OpenStreetMap (falling back to a procedural city if the servers are slow), so your squad paths around actual streets. FOB fights happen on generated sea platforms. Every battle simulates whether you watch or not; zoom in and the command HUD appears, zoom out (or `Esc`) and you're back on the globe. The squad AI keeps fighting the whole time; any operative you give an order to switches to MANUAL until you release them (`Q`) or leave.

**Battle mechanics** — guard vision cones and suspicion, Sneaking → Caution → Alert phases with reinforcements and evasion, stealth vs assault stances, cover, night (local solar time), lethal vs non-lethal weapons, one-dart takedowns on unaware guards, Fulton extraction of sleeping enemies (they join your brig), downed operatives who bleed out unless revived, sabotage/intel/hold/extract/eliminate objectives, and support calls (supply drop, smoke, sleep gas, precision strike).

**Staff** — every person has six department stats (graded E → S++), skills (Sharpshooter, Ghost, Medic, Troublemaker, Diplomat, Interrogator…), morale, injuries, nationality and a procedural portrait. Departments level up from their staff. Troublemakers start brawls, disease outbreaks need Quarantine, prisoners slowly turn loyal, low morale causes desertion, and the dead go on the memorial wall.

**Base management** — platforms for Command, Combat, R&D, Base Dev, Support, Intel, Medical and Quarantine; GMP economy with salaries and upkeep; raw → processed materials; ~45 R&D projects across weapons, gear, support, FOB defenses, intel and base upgrades.

**FOBs & rival PFs** — 14 randomly generated Private Forces with emblems, leaders, tiers, leagues and their own FOBs and defenses. Scout them with Intel, infiltrate to hack their core and steal resources and staff, and defend your own FOBs (and Mother Base) when their hostility boils over: assign security staff, research cameras, UAVs and mines, and fight off intruders who Fulton your sleeping staff.

**Sound & feel** — every sound is synthesized live with the Web Audio API (no audio files): positional gunfire that differs by weapon (rifles, suppressed, tranq darts, MG, sniper), explosions, Fulton balloons, helicopters, radio chatter, an "you've been spotted" alert sting and UI feedback. The generative soundtrack adapts to what you're watching — ambient at base, a tense pulse while sneaking, drums and bass when the squad is on alert. Visual effects include muzzle flashes, travelling tracers, explosions with debris, shockwaves and lingering smoke, screen shake, an alert vignette, an "uplink" transition into battles, animated mission-result stamps, floating resource gains and a radar boot screen.

**Quality of life** — sidenav badges (waiting staff, idle R&D, contracts, incursions, unread alerts), an R&D queue, staff search, hover cards for units in battle, camera follow, auto-opening mission reports, click-to-dismiss toasts and volume controls in SYS.

## Controls

| Key | Action |
| --- | --- |
| `Space`, `1`–`3`, `+` / `-` | Pause, set / change speed |
| `N` | Mute audio |
| `B` `T` `R` `O` `F` `L` | Base, sTaff, R&D, Ops, FOB, Log panels |
| `M` | Satellite imagery |
| Left click / `Shift`+drag | Select operatives / box select |
| Right click | Move · attack enemy · Fulton sleeper or hostage · revive ally · interact with objective |
| `1`–`9`, `Ctrl`+`A`, `Tab` | Select operative, select all, cycle & center |
| `S` / `H` / `X` / `Q` / `F` | Stance, hold, recall to LZ, release to AI, camera follow |
| `Z` `C` `V` `G` | Supply drop, smoke, sleep gas, strike |
| `Esc` | Cancel / close / leave battle |

The game autosaves to browser local storage every 6 in-game hours and when the tab closes.

## Code layout

- `js/data.js` — cities, ocean zones, skills, weapons, R&D tree, name pools
- `js/state.js`, `staff.js`, `base.js`, `rnd.js`, `pf.js`, `contracts.js` — strategic simulation
- `js/battle/` — terrain (OSM fetch, procedural maps, A*, line of sight), simulation, AI, map overlay renderer
- `js/map.js` — Leaflet world map, markers, auto-focus on zoom
- `js/ui/` — top bar, panels, deployment planning, battle HUD

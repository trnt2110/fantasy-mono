# Fantasy Football Game — Game Design

> **Living document.** Updated at the end of each implementation phase to reflect what was actually built.
> Last updated: Phase 0 (bootstrap)

---

## Format

Season-long FPL-style. One team per user per competition. Points accumulate across all gameweeks (GW1–GW38 per competition). No in-season live updates — scoring is post-match only.

---

## Squad Composition

| Attribute | Value |
|---|---|
| Total squad size | 15 players |
| Starting XI | 11 (must be submitted before deadline each GW) |
| Bench | 4 (ordered for auto-sub priority) |
| Budget at team creation | 100.0m |
| Max players from one club | 3 |

### Position Requirements (Full Squad)
| Position | Minimum | Maximum |
|---|---|---|
| GK | 2 | 2 |
| DEF | 5 | 5 |
| MID | 5 | 5 |
| FWD | 3 | 3 |

### Starting XI Constraints
- Exactly 1 GK
- Outfield formation must be one of the 7 supported formations
- 10 outfield players (DEF + MID + FWD) matching the formation

### Supported Formations (outfield slots)
`3-4-3`, `3-5-2`, `4-3-3`, `4-4-2`, `4-5-1`, `5-3-2`, `5-4-1`

---

## Scoring Rules

| Event | GK | DEF | MID | FWD |
|---|---|---|---|---|
| Playing 1–59 min | 1 | 1 | 1 | 1 |
| Playing 60+ min | 2 | 2 | 2 | 2 |
| Goal scored | 10 | 6 | 5 | 4 |
| Assist | 3 | 3 | 3 | 3 |
| Clean sheet (90 min) | 4 | 4 | 1 | — |
| Every 2 goals conceded | -1 | -1 | — | — |
| Every 3 saves | 1 | — | — | — |
| Penalty save | 5 | — | — | — |
| Penalty miss | -2 | -2 | -2 | -2 |
| Yellow card | -1 | -1 | -1 | -1 |
| Red card | -3 | -3 | -3 | -3 |
| Own goal | -2 | -2 | -2 | -2 |
| Bonus (1st/2nd/3rd) | 3/2/1 | 3/2/1 | 3/2/1 | 3/2/1 |

### Scoring Notes
- **Clean sheet** requires the player to have played ≥ 60 minutes in the match
- **Goals conceded** deduction applies per 2 goals (floor division — 3 conceded = −1, not −1.5)
- **Bonus points**: awarded post-match per API-Football's BPS data; 0, 1, 2, or 3 points possible
- **Saves**: floor(saves / 3) × 1 point — only applies to GK

---

## Captain & Vice-Captain

Each GW pick submission designates 1 captain and 1 vice-captain from the starting XI.

| Rule | Detail |
|---|---|
| Captain | Earns 2× their GW points |
| Captain played 0 minutes | Vice-captain earns 2× instead |
| Both played 0 minutes | No multiplier applied |
| Late captain pick | Not allowed after deadline |

---

## Auto-Substitution

Triggered during gameweek finalisation for starting players who played 0 minutes.

**Algorithm:**
1. For each starting position with a 0-minute player:
2. Scan bench in priority order (1 → 4)
3. Select first bench player who: (a) played > 0 minutes, AND (b) whose position maintains a valid formation
4. Swap: bench player enters starting XI; 0-minute player goes to bench
5. GK exception: the starting GK can only be replaced by the bench GK (bench slot 1 is always the backup GK)
6. Maximum 1 auto-sub per starting position slot

**Formation validity during auto-sub:**
- `Formation.isValid(after_swap)` must return true
- If no valid bench replacement exists, the 0-minute player stays in starting XI (earns 0 pts)
- Auto-subs are applied before captain/vice-captain multiplier

---

## Transfer Rules

| Rule | Detail |
|---|---|
| Free transfers per GW | 1 |
| Carry-over (banking) | 1 unused free transfer carries over (max banked = 2; does not stack beyond 2) |
| Extra transfer cost | −4 points per transfer beyond the free allocation |
| Point deduction timing | Deducted from the **current** GW's GameweekScore |
| Deadline | Must be confirmed before the GW deadline |
| Wildcard transfers | Free (no point cost), see Chips section |

**Deadline rule:** 1.5 hours before first fixture kickoff of the gameweek. `Gameweek.deadlineTime` is seeded automatically from the earliest `Fixture.kickoffAt` in that GW minus 90 minutes.

**Transfer execution:**
- Transfers occur at the current `Player.currentPrice` at time of confirmation
- `priceOut` and `priceIn` are snapshot at transfer time and stored in `Transfer` table
- Budget adjustment: `budget = budget + priceOut - priceIn`

---

## Chips

| Chip | Effect | Availability |
|---|---|---|
| Wildcard | Unlimited free transfers for one GW; no point deductions | 1× per season half (GW1–19 and GW20–38) |

**Wildcard rules:**
- Activating wildcard resets the transfer penalty counter for that GW
- Any transfers made before wildcard activation in the same GW are also retroactively freed
- Wildcard cannot be used in the same GW as a second wildcard (each half has 1)

> **Stretch goal (not in MVP):** Triple Captain (3× instead of 2×), Bench Boost (all 15 players score), Free Hit (unlimited free transfers for 1 GW, reverts to previous squad next GW)

---

## Price Changes

- Player prices change ±0.1m based on net transfer volume between gameweeks
- **Price rise trigger:** net transfer-in exceeds 2% of total active fantasy teams in that competition
- **Price fall trigger:** net transfer-out exceeds 2% of total active fantasy teams
- Changes applied by `player-price-update` BullMQ job after `gameweek-finalise` completes
- Price floor: 4.0m | Price ceiling: 15.0m
- `PlayerPriceHistory` row written on each change

---

## Mini-Leagues

- Users create a private league → unique 8-character alphanumeric invite code generated
- Others join via invite code (must have a fantasy team in the same competition)
- Standings: cumulative total points, descending; rank recalculated after each GW finalisation
- Standings visible to members only
- **Global leaderboard:** all fantasy teams in a competition; same ranking logic; paginated

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Player transferred between clubs mid-season | `Player.clubId` updated; existing `PlayerPick` rows preserved (historical); price may change |
| Player unavailable mid-season (injury/retirement) | `Player.isAvailable = false`; existing picks preserved; transfers away refund current price |
| Double gameweek (2 fixtures in 1 GW) | Both `PlayerPerformance` rows sum; player can earn points from 2 games |
| Blank gameweek (no fixture for a player) | Player earns 0 points; auto-sub may trigger |
| GK auto-sub | Starting GK (0 min) can only be replaced by bench GK (bench position 1) |
| Captain in double GW | Captain multiplier applies to combined points from both fixtures |
| Vice-captain fallback in double GW | If captain played 0 min across both games, vice-captain gets 2× |
| Player with red card | Plays partial minutes; scores points for time played + −3 for red card |
| Formation validity | System enforces valid formation at pick submission; auto-sub revalidates |
| Budget exactly 0.0 | Allowed (cannot go negative) |
| Same player in/out same GW | Not allowed (transfer in = transfer out for same player is a no-op, rejected) |

# Training mode and local versus

Ship Training first so players can learn the four fighters and give specific feedback about attack range, timing, and ring-outs. Ship local versus after that so two people can test the same matchups without the CPU influencing the result.

| Milestone | Proposed release | Completion criterion |
| --- | --- | --- |
| Training | `v0.1.0-alpha.2` | Every fighter can practice against an idle, guarding, or attacking dummy and reset the drill without returning to the menu. |
| Local versus | `v0.1.0-alpha.3` | Two people can select fighters, finish a best-of-three match on one keyboard, and rematch. |

Both milestones use the existing roster, Foundry arena, and offline browser entry point. Leave online play, controller support, recorded dummy inputs, and key rebinding for later releases.

## Milestone 1 · Training mode

### Player flow

1. Choose **Training** from a mode selector that defaults to **Solo Arcade**.
2. Pick a fighter and a dummy using the existing roster and rival selector. Relabel the rival selector **Practice Dummy** in this mode.
3. Enter the Foundry. Keep both health bars and the player's special cooldown visible. Replace the timer and round score with a **Training** label.
4. Change the dummy behavior in the arena and use **Reset Positions** or **R** to restore both fighters. Keep the chosen behavior and move across resets.

| Dummy behavior | Expected behavior |
| --- | --- |
| **Stand Still** | Faces the player and accepts hits without moving on its own. Default behavior. |
| **Guard** | Holds guard whenever it can act. Block effects, chip damage, and knockback follow the normal rules. |
| **Repeat Attack** | Uses the selected Strike, Heavy, or Special whenever its repeat interval and the normal eligibility rules allow it. Defaults to Heavy. It faces the player before each attempt, even when the move is out of range. |

Use a one-second repeat interval measured from the end of the previous attack. Start the next attack when both that interval and any applicable cooldown have elapsed. A behavior change applies after a move already in progress. The dummy never teleports into range or chases the player.

On a knockout or ring-out, show the usual outcome briefly, then restore both fighters to their starting positions with full health and available specials. Leave the drill running. A manual reset clears pending inputs, attacks, hit effects, and cooldowns immediately. Suspend dummy timing while the game is paused or the Controls dialog is open.

### Implementation order

1. Add an explicit match mode in [game.js](../game.js) and the mode selector in [index.html](../index.html). Use the existing selection and start flow for Solo Arcade and Training.
2. Add dummy behavior logic alongside `cpuTick`. Use `beginAttack` and the shared combat simulation for dummy attacks so timing, hit checks, and hit effects stay consistent with Arcade.
3. Extract the shared fighter-position reset from `newRound`. Give Training its own reset path that does not increment a score, start a countdown, or show a match result. Let Arcade retain its existing round and timer behavior.
4. Add dummy settings and reset controls to the arena. Keep native keyboard behavior for focused form controls so arrow keys can change a dropdown and Space can activate a focused button.
5. Update the Controls dialog and README. Publish the training prerelease after the checks below pass.

### Acceptance checks

- Start Training as each fighter. Verify the selected dummy and behavior appear in the arena and survive repeated manual and automatic resets.
- Land an unguarded hit, then repeat it against Guard and compare chip damage, hit effects, and knockback.
- Practice Gemini’s Parallax with **↑ + D** and **↓ + D** against each repeated attack. Check that each attempt follows the same timing as in Arcade and that a whiff leaves Gemini open.
- Confirm that Repeat Attack respects recovery and the real special cooldown. Pause during the delay, resume, and check that the dummy waits for the remaining time.
- Cause a knockout and a ring-out. Verify the game returns to practice automatically without changing settings.
- Play an Arcade match to verify the timer, scoring, pause, and rematch still work.

## Milestone 2 · Local two-player versus

### Player flow

Choose **Local Versus**, then select Player 1 and Player 2 fighters. Allow mirror matches and distinguish the sides with **P1** and **P2** labels on the selection screen, health bars, cooldown indicators, and results. Both players start in The Foundry under the Arcade rules. **Rematch** keeps the two picks and resets the score. **Fighter Select** lets either player change fighters.

| Action | Player 1 | Proposed Player 2 bindings |
| --- | --- | --- |
| Move left / right | **← / →** | **J / L** |
| Sidestep away / toward camera | **↑ / ↓** | **I / K** |
| Strike | **A** | **U** |
| Heavy | **S** | **O** |
| Special | **D** | **P** |
| Hold guard | **Space** | **Right Shift** |

Escape pauses both players. Show both layouts before a fight and in Controls. For the shared-keyboard alpha, retain the on-screen controls for Player 1 in Arcade and Training. Make the Local Versus keyboard requirement clear in setup.

### Implementation order

1. Generalize the current single attack queue into one input state per human fighter. Map physical key codes to player and action. Preserve the existing short attack buffer and give each player independent held inputs, guard, and directional specials.
2. Route each fighter through human input, the existing CPU, or practice dummy logic according to the active mode. Reuse the existing hit resolution and round scoring so both players can exchange hits on the same simulation tick.
3. Expand fighter select and result messaging for Local Versus. Allow duplicate fighter IDs in this mode and report winners by side, including in mirror matches.
4. Add the Player 2 cooldown display and keyboard legend. Clear both input states on pause, focus loss, round reset, rematch, and return to setup. Verify keys held before a reset cannot produce an accidental attack when the game resumes.
5. Update the Controls dialog and README. Publish the versus prerelease after the checks below pass.

### Acceptance checks

- Check both players moving, attacking, and guarding at the same time. Confirm there are no software binding collisions and test common multi-key combinations on a laptop and an external keyboard for hardware rollover.
- Check directional Parallax on both sides, including after fighters swap sides. World-space movement directions should remain consistent.
- Complete a match by knockout, ring-out, and timeout. Verify a draw replays the round and a mirror-match result identifies the winner by player number.
- Pause while both players are holding inputs, then release and resume. Repeat during focus loss and a round transition to check for stuck movement or attacks.
- Verify rematches preserve fighter picks and clear scores, cooldowns, and queued inputs. Regression-check Arcade, Training, and the existing on-screen controls.

## Release verification

For each milestone, verify key gameplay paths in a desktop browser and check that the extracted release ZIP opens offline. Check the Training UI at narrow widths as well as desktop widths. Include the new controls and feedback prompts in the release notes. Ask testers to name the fighter, matchup, and move involved when reporting unclear hits, failed sidesteps, or unexpected ring-outs.

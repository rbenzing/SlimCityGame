# Start menu and game lifecycle

A full-screen overlay, distinct from every panel above in that it replaces
the whole screen rather than floating over the viewport. It shows on first
load as the start screen, and reopens as a pause overlay over a running
game (from the corner Menu button, or Escape). Either way it is the same
component, composing a self-generated **SlimCity** brand mark over five
stacked actions: **Resume Game** (present only over a running game, and
first in the stack there, since leaving is the common reason to open the
overlay), **New Game**, **Save Game**, **Load Game**, and **Options**, plus
**Quit**. Save and Quit are disabled without an active game; Load is
disabled with no saves to offer.

New Game seeds a fresh procedural map from a fresh random seed; that seed
is stored in the save header, so Load reconstructs the exact terrain by
reading it back before the save itself loads. New Game, Load, and Quit all
work by writing an intent and reloading the page — the browser tears down
the worker, the WebGL context, and every listener for free, and the fresh
boot reads the intent back — so there is no in-app teardown path to keep
correct. Save and Options act on the live game instead. The save browser
lists each slot's name and timestamp with Load and Delete actions.

Options covers rendering (Bloom), gameplay (an unlock-everything sandbox
toggle, and an unlimited-money toggle for testing — both bypass their
respective gates rather than replacing them), and audio (master volume,
mute). It renders as a full-screen dialog like the rest of the menu; its
own Back action returns to the main list, but Escape does not stop
there — as from every sub-view, Escape only ever means Resume: over a
running game it closes the whole overlay and resumes play outright,
skipping past Back entirely, and on the menu-only start screen, with no
game to resume, Escape does nothing at all.

Audio also embeds a full music player, wherever one is wired in:
transport (previous, play/pause, next, a seek bar disabled until a track
is actually chosen, and an elapsed/total time readout), the full playlist
with the current track picked out — reading "Nothing playing" until one
actually is, and every title cut to the panel's width shown in full as a
tooltip — shuffle and repeat toggles (repeat cycles off → all → one)
that persist alongside the rest of the settings, and a Rescan action for
the `public/songs/` folder. A drop zone on the panel accepts `.mp3`/`.wav`
files dragged in for the current session only; those tracks are labeled
`dropped`, and a Clear dropped action appears once at least one exists.
With no tracks at all, the transport and playlist give way to a line
explaining where to put files — Rescan, Shuffle, Repeat, and the Music
Volume slider stay put either way. A playback error the browser reports
surfaces as its own line beneath the drop zone.

Opening the pause overlay pauses the city at whatever speed it was
running; closing it — by Resume, or by Escape — restores that same speed,
including staying paused if that is how the player left it, so the two
exits can never disagree.


# Arca as a TaleSpire Symbiote

This folder is the whole Symbiote. TaleSpire opens the deployed app
(`entryPoint` in `manifest.json`) in its side panel and injects its API, so
the dice buttons on character sheets put rolls straight in your dice tray.

## Install (each player, once)

1. In TaleSpire, open **Settings** and turn on **Symbiotes**. A Symbiotes
   panel appears on the right.
2. In that panel, click **Open Symbiotes Directory**. On Windows this is
   `%AppData%\..\LocalLow\BouncyRock Entertainment\TaleSpire\Symbiotes`.
3. Copy this whole `symbiote` folder in there and rename it `Arca`. The
   result must be `...\Symbiotes\Arca\manifest.json`, not one folder deeper.
4. Back in TaleSpire, Arca is now listed in the Symbiotes panel. Open it and
   sign in with the email your GM added to the campaign.

## What it does in TaleSpire

- **d20 next to every skill and attribute:** puts a d20 in your tray, labelled
  with the skill and the number to roll under, e.g. "Bushcraft (12)".
- **Damage dice next to each weapon at hand, and the damage bonuses:** puts
  that weapon's damage in the tray.
- **Death roll, round rest, stretch rest:** each has its die too.
- **Runs in the background** (`runInBackground`), so live inventory sync keeps
  going while the panel is closed.

Outside TaleSpire none of the dice buttons appear. The sheet still shows
every number you roll against.

## Pointing it at another deployment

Change `entryPoint` (and `about.website`) in `manifest.json` to your URL. It
must be the full `https://` address.

## Developing

Turn on **Symbiotes debugging** in TaleSpire's settings and attach Chrome
DevTools at `http://localhost:8080`. To try a local build, point `entryPoint`
at `http://localhost:3000` while `npm run dev` is running.

API reference: https://symbiote-docs.talespire.com/

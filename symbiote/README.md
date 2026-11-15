# Arca as a TaleSpire Symbiote

This folder is the whole Symbiote. TaleSpire opens the deployed app
(`entryPoint` in `manifest.json`) in its side panel and injects its API, so
the dice buttons on character sheets put rolls straight in your dice tray.

## Install (each player, once)

**From the mod browser** (once Arca is published — see `MODIO.md`): in
TaleSpire, open the Symbiotes panel, choose **Open Community Mod Browser**,
find Arca and install it.

**From the download:** unzip `arca-symbiote-install.zip` (built with
`npm run symbiote:pack`) and double-click `install-arca.bat`. Run it again any
time to update.

**By hand:** copy this folder into
`%AppData%\..\LocalLow\BouncyRock Entertainment\TaleSpire\Symbiotes` and name
it `Arca`, so the result is `...\Symbiotes\Arca\manifest.json`.

Then in TaleSpire: **Settings → Symbiotes** on, open **Arca** from the
Symbiotes panel, and sign in with the email your GM added you with.

## What happens automatically

- **Staying signed in.** Sign in once; every visit renews the session, so
  you are only asked again after a month of not using Arca.
- **The right campaign.** The first time the GM opens Arca inside a TaleSpire
  campaign, Arca offers to link it to the Arca campaign they are in. After
  that, anyone opening Arca inside that TaleSpire campaign lands in the linked
  Arca campaign — no campaign menu.
- **Dice.** The d20 beside every skill and attribute, the damage dice beside
  each weapon, death rolls and rests put the roll in your tray, labelled with
  what it is for. You must be on a board.
- **Colours.** Arca takes on TaleSpire's colours and font.

Forgot your password? Use **Forgot your password?** on the sign-in screen; your
GM sees the request on the Members page and resets it.

## Pointing it at another deployment

Change `entryPoint` (and `about.website`) in `manifest.json` to your URL. It
must be the full `https://` address.

## Developing

Turn on **Symbiotes debugging** in TaleSpire's settings and attach Chrome
DevTools at `http://localhost:8080`. To try a local build, point `entryPoint`
at `http://localhost:3000` while `npm run dev` is running.

API reference: https://symbiote-docs.talespire.com/

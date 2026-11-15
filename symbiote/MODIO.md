# Publishing Arca on mod.io

TaleSpire's in-game **Community Mod Browser** lists Symbiotes from mod.io
(https://mod.io/g/talespire). Once Arca is published there, players install
it from inside TaleSpire with one click and get updates without copying
folders.

## 1. Build the upload

```bash
npm run symbiote:pack
```

This writes `dist/arca-symbiote-modio.zip`: `manifest.json`, the bridge script,
the description and the icons at the zip's top level. Upload that file.
(`dist/arca-symbiote-install.zip` is the separate download for players who
install by hand; it adds `install-arca.bat`.)

## 2. Create the mod on mod.io

Sign in at mod.io with the account that should own the listing, open the
TaleSpire game page, and choose **Add mod**. Use the text below. TaleSpire's
docs do not spell out mod.io's exact form fields, so match these to whatever
the form asks for.

- **Name:** Arca
- **Summary** (250 characters max):
  Shared Dragonbane inventory and character sheets for your table, inside
  TaleSpire. Skill, attribute and damage dice go straight to your dice tray.
- **Listing image** (16:9, at least 512×288): `symbiote/listing.png` (1280×720)
- **Tags:** Symbiote, and whatever system / utility tags the form offers
- **Description:**

  > Arca keeps your party's inventory and Dragonbane character sheets in one
  > place, shared live with everyone at the table.
  >
  > - Every pack, cart and chest the party owns, updated live.
  > - Character sheets laid out like the printed Dragonbane sheet: skills
  >   with advancement, heroic abilities, spells, armour, money, rest.
  > - The d20 beside each skill and attribute — and the damage dice beside
  >   each weapon — put the roll in TaleSpire's dice tray.
  > - Opens straight into your Arca campaign once your GM links it to the
  >   TaleSpire campaign.
  >
  > Your GM adds you by email; sign in once and Arca keeps you signed in.

- **File:** `dist/arca-symbiote-modio.zip`, version from `manifest.json`.

## 3. Updating

Bump `version` in `manifest.json`, run `npm run symbiote:pack`, and upload the
new zip as a new file on the same mod. The app itself updates on every push to
`main` without a new upload — the Symbiote only points at the deployed site.

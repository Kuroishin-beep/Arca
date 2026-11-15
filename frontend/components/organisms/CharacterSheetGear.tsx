"use client";

import {
  type ArmourPiece,
  type CharacterSheet as CharacterSheetData,
  type HeroicAbility,
  type Money,
  derive,
} from "@backend/domain/character";
import { Button } from "@frontend/components/atoms/Button";
import { IconButton } from "@frontend/components/atoms/IconButton";
import { NumberStepper } from "@frontend/components/atoms/NumberStepper";
import { RollButton } from "@frontend/components/atoms/RollButton";
import { SHEET_BOX, SHEET_HEADING } from "@frontend/components/molecules/SheetBox";
import { LongText, TextInput } from "@frontend/components/molecules/SheetFields";

/**
 * The parts of the printed Dragonbane sheet the first version of this screen
 * did not have: the derived strip under the attributes, heroic abilities,
 * armour and helmet, the purse, and the rest boxes.
 *
 * Same contract as the rest of the sheet (`CharacterSheet.tsx`): each block
 * saves ONE section through `onSave`, so two people at the table editing
 * different blocks never overwrite each other.
 */

type Save = (patch: Partial<CharacterSheetData>) => void;

const newId = (prefix: string) =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;

/* ================================================================== *
 * Derived strip — damage bonuses and movement
 * ================================================================== */

/** Under the attributes on the printed sheet. Nothing here is stored: each
 *  number follows STR, AGL or kin the moment those change. */
export function DerivedStrip({ sheet }: { sheet: CharacterSheetData }) {
  const { strDamageBonus, aglDamageBonus, movement } = derive(sheet);
  const cells = [
    { label: "Damage bonus STR", value: strDamageBonus, roll: strDamageBonus },
    { label: "Damage bonus AGL", value: aglDamageBonus, roll: aglDamageBonus },
    { label: "Movement", value: `${movement} m`, roll: null },
  ];
  return (
    <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-3 panel:grid-cols-3">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface2 px-3 py-2"
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
            {cell.label}
          </dt>
          <dd className="flex items-center gap-1 font-mono text-base font-bold tabular-nums text-text">
            {cell.value ?? <span className="font-normal text-faint">—</span>}
            {cell.roll ? (
              <RollButton notation={cell.roll} label={cell.label} />
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ================================================================== *
 * Heroic abilities
 * ================================================================== */

export function HeroicAbilities({
  sheet,
  canEdit,
  onSave,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: Save;
}) {
  const setAbilities = (abilities: HeroicAbility[]) => onSave({ abilities });
  const patch = (id: string, fields: Partial<HeroicAbility>) =>
    setAbilities(
      sheet.abilities.map((a) => (a.id === id ? { ...a, ...fields } : a)),
    );

  return (
    <section className={SHEET_BOX}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className={SHEET_HEADING}>Heroic abilities</h2>
        <span className="text-xs text-faint">Kin, profession and earned</span>
      </div>

      {sheet.abilities.length === 0 ? (
        <p className="mb-3 text-base text-muted">
          No abilities written down yet — your kin and profession each give one.
        </p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {sheet.abilities.map((ability) => (
            <li
              key={ability.id}
              className="grid items-end gap-2 rounded-sm border border-border bg-surface2 p-3 panel:grid-cols-[1fr_auto_auto]"
            >
              <TextInput
                id={`ability-name-${ability.id}`}
                label="Ability"
                value={ability.name}
                disabled={!canEdit}
                onCommit={(name) => name.trim() && patch(ability.id, { name })}
              />
              <div>
                <label
                  htmlFor={`ability-wp-${ability.id}`}
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  WP cost
                </label>
                {canEdit ? (
                  <NumberStepper
                    id={`ability-wp-${ability.id}`}
                    label="WP cost"
                    value={ability.wp}
                    min={0}
                    max={20}
                    size="sm"
                    onChange={(wp) => patch(ability.id, { wp })}
                  />
                ) : (
                  <p className="font-mono text-base tabular-nums text-text">
                    {ability.wp}
                  </p>
                )}
              </div>
              {canEdit ? (
                <IconButton
                  icon="trash"
                  label={`Remove ${ability.name}`}
                  size={16}
                  onClick={() =>
                    setAbilities(sheet.abilities.filter((a) => a.id !== ability.id))
                  }
                  className="h-9 w-9 border border-border hover:text-danger"
                />
              ) : null}
              <div className="panel:col-span-3">
                <LongText
                  id={`ability-notes-${ability.id}`}
                  label="Effect"
                  value={ability.notes}
                  disabled={!canEdit}
                  placeholder="What it lets you do."
                  onCommit={(notes) => patch(ability.id, { notes })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <Button
          size="sm"
          icon="plus"
          onClick={() =>
            setAbilities([
              ...sheet.abilities,
              { id: newId("ability"), name: "New ability", wp: 3, notes: "" },
            ])
          }
        >
          Add ability
        </Button>
      ) : null}
    </section>
  );
}

/* ================================================================== *
 * Armour and helmet
 * ================================================================== */

export function Protection({
  sheet,
  canEdit,
  onSave,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: Save;
}) {
  const set = (slot: "armour" | "helmet", fields: Partial<ArmourPiece>) =>
    onSave({
      protection: {
        ...sheet.protection,
        [slot]: { ...sheet.protection[slot], ...fields },
      },
    });

  const total = sheet.protection.armour.rating + sheet.protection.helmet.rating;

  return (
    <section className={SHEET_BOX}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className={SHEET_HEADING}>Armour</h2>
        <span className="text-xs text-faint">
          Total rating{" "}
          <span className="font-mono font-bold tabular-nums text-text">{total}</span>
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {(["armour", "helmet"] as const).map((slot) => {
          const piece = sheet.protection[slot];
          const label = slot === "armour" ? "Armour" : "Helmet";
          return (
            <div
              key={slot}
              className="grid items-end gap-2 rounded-sm border border-border bg-surface2 p-3 panel:grid-cols-[1fr_auto]"
            >
              <TextInput
                id={`${slot}-name`}
                label={label}
                value={piece.name}
                disabled={!canEdit}
                placeholder={slot === "armour" ? "Leather armour" : "Open helmet"}
                onCommit={(name) => set(slot, { name })}
              />
              <div>
                <label
                  htmlFor={`${slot}-rating`}
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  Rating
                </label>
                {canEdit ? (
                  <NumberStepper
                    id={`${slot}-rating`}
                    label={`${label} rating`}
                    value={piece.rating}
                    min={0}
                    max={10}
                    size="sm"
                    onChange={(rating) => set(slot, { rating })}
                  />
                ) : (
                  <p className="font-mono text-base tabular-nums text-text">
                    {piece.rating}
                  </p>
                )}
              </div>
              <div className="panel:col-span-2">
                <TextInput
                  id={`${slot}-banes`}
                  label="Bane on"
                  value={piece.banes}
                  disabled={!canEdit}
                  placeholder={slot === "armour" ? "Sneaking, Evade" : "Awareness"}
                  onCommit={(banes) => set(slot, { banes })}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================== *
 * Purse
 * ================================================================== */

const COINS: { key: keyof Money; label: string }[] = [
  { key: "gold", label: "Gold" },
  { key: "silver", label: "Silver" },
  { key: "copper", label: "Copper" },
];

export function Purse({
  sheet,
  canEdit,
  onSave,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: Save;
}) {
  return (
    <section className={SHEET_BOX}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className={SHEET_HEADING}>Money</h2>
        <span className="text-xs text-faint">1 gold = 10 silver = 100 copper</span>
      </div>
      <div className="grid grid-cols-1 gap-2 panel:grid-cols-3">
        {COINS.map((coin) => (
          <div key={coin.key} className="rounded-sm border border-border bg-surface2 p-2">
            <label
              htmlFor={`money-${coin.key}`}
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted"
            >
              {coin.label}
            </label>
            {canEdit ? (
              <NumberStepper
                id={`money-${coin.key}`}
                label={`${coin.label} coins`}
                value={sheet.money[coin.key]}
                min={0}
                max={999_999}
                size="sm"
                onChange={(n) => onSave({ money: { ...sheet.money, [coin.key]: n } })}
              />
            ) : (
              <p className="font-mono text-base tabular-nums text-text">
                {sheet.money[coin.key]}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ================================================================== *
 * Rest
 * ================================================================== */

/**
 * The sheet's rest boxes. A round rest and a stretch rest can each be taken
 * once per shift, so they are ticks; a shift rest restores everything and
 * clears both ticks, so it is one button that writes all of that at once.
 */
export function RestBox({
  sheet,
  canEdit,
  onSave,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: Save;
}) {
  const { maxHp, maxWp } = derive(sheet);
  const rests = [
    { key: "round" as const, label: "Round rest", gain: "Recover D6 WP" },
    {
      key: "stretch" as const,
      label: "Stretch rest",
      gain: "Heal D6 HP, recover D6 WP and one condition",
    },
  ];

  return (
    <section className={SHEET_BOX}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className={SHEET_HEADING}>Rest</h2>
        <span className="text-xs text-faint">Each once per shift</span>
      </div>
      <ul className="flex flex-col gap-2">
        {rests.map((rest) => (
          <li key={rest.key} className="flex items-center gap-2">
            <label className="relative flex min-w-0 flex-1 cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={sheet.rest[rest.key]}
                disabled={!canEdit}
                onChange={(e) =>
                  onSave({ rest: { ...sheet.rest, [rest.key]: e.target.checked } })
                }
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span className="min-w-0">
                <span className="block text-base font-medium text-text">{rest.label}</span>
                <span className="block text-sm text-muted">{rest.gain}</span>
              </span>
            </label>
            <RollButton notation="D6" label={rest.label} />
          </li>
        ))}
      </ul>
      {canEdit ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() =>
            onSave({
              hp: maxHp,
              wp: maxWp,
              conditions: {
                exhausted: false,
                sickly: false,
                dazed: false,
                angry: false,
                scared: false,
                disheartened: false,
              },
              rest: { round: false, stretch: false },
            })
          }
        >
          Shift rest — restore all
        </Button>
      ) : null}
    </section>
  );
}

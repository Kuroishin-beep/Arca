import { TextField } from "@frontend/components/atoms/Field";
import { fieldsForTypes, type Stats } from "@backend/domain/item-fields";

/**
 * The inputs a type adds to an item form — Grip, STR, Damage… for a weapon,
 * Effect for gear (`backend/domain/item-fields.ts`).
 *
 * Driven by the types the form CURRENTLY holds, not the ones it was opened
 * with: typing "Weapon" into the types field makes the weapon inputs appear,
 * which is the whole point of a type — it is what decides which database's
 * columns an item has.
 *
 * Named `stat:<key>` so the action can collect them without a list of keys of
 * its own to keep in step (`statsFromForm`).
 */
export function StatFields({
  idPrefix,
  types,
  values,
  readOnly,
}: {
  idPrefix: string;
  types: readonly string[];
  values: Stats;
  readOnly?: boolean;
}) {
  const fields = fieldsForTypes(types);
  if (fields.length === 0) return null;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-muted">
        {types.some((t) => t.trim().toLowerCase() === "weapon")
          ? "Weapon stats"
          : "Item details"}
      </legend>
      <div className="grid grid-cols-2 gap-3 panel:grid-cols-3">
        {fields.map((field) => (
          <TextField
            key={field.key}
            id={`${idPrefix}-stat-${field.key}`}
            name={`stat:${field.key}`}
            label={field.label}
            readOnly={readOnly}
            numeric={field.numeric}
            defaultValue={values[field.key] ?? ""}
            placeholder={field.placeholder}
            maxLength={80}
            className={field.key === "effect" || field.key === "features" ? "col-span-2 panel:col-span-3" : undefined}
          />
        ))}
      </div>
    </fieldset>
  );
}

/** "Grip 1H · Damage 1D6 · …" as small chips, for list rows that have no
 *  room for columns. Nothing when the item has no type fields. */
export function StatChips({ types, stats }: { types: readonly string[]; stats: Stats }) {
  const shown = fieldsForTypes(types).filter((f) => stats[f.key]);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((field) => (
        <span
          key={field.key}
          className="rounded-sm border border-border px-1 text-xs text-muted"
        >
          <span className="text-faint">{field.short}</span>{" "}
          <span className="font-mono">{stats[field.key]}</span>
        </span>
      ))}
    </>
  );
}

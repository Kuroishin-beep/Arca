"use client";

import { useOptimistic, useState, useTransition } from "react";

import {
  renameCharacterAction,
  updateCharacterAction,
} from "@backend/actions/character";
import {
  AGES,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  type AttributeKey,
  type CharacterSheet as CharacterSheetData,
  type ConditionKey,
  DEATH_ROLL_SLOTS,
  KINS,
  PROFESSIONS,
  SKILLS,
  SKILL_KINDS,
  type SkillKind,
  type Spell,
  baseChance,
  clampSheet,
  conditionFor,
  derive,
  skillState,
  skillLevel,
  skillValue,
  SKILL_LEVEL_MAX,
  advancementTarget,
} from "@backend/domain/character";
import type { CharacterView } from "@backend/domain/view";
import { Button } from "@frontend/components/atoms/Button";
import { Icon } from "@frontend/components/atoms/Icon";
import { IconButton } from "@frontend/components/atoms/IconButton";
import { NumberStepper } from "@frontend/components/atoms/NumberStepper";
import { RollButton } from "@frontend/components/atoms/RollButton";
import { DiceFinder } from "@frontend/components/organisms/DiceFinder";
import {
  DerivedStrip,
  HeroicAbilities,
  Protection,
  Purse,
  RestBox,
} from "@frontend/components/organisms/CharacterSheetGear";
import { SHEET_BOX, SHEET_HEADING } from "@frontend/components/molecules/SheetBox";
import {
  LongText,
  Select,
  TextChip,
  TextInput,
} from "@frontend/components/molecules/SheetFields";


/**
 * The character sheet — SCOPE.md S1, and the one screen in Arca where every
 * number on it is editable in place.
 *
 * ── Why this is a client component ────────────────────────────────────────
 *
 * The rest of the app pushes state into the URL and renders on the server,
 * which is right for a list you navigate. A sheet is not navigated, it is
 * POKED: hit points go down mid-combat, a condition goes on, a skill gets
 * ticked. Round-tripping each of those through a URL would put a page
 * transition between a player and their own hit points.
 *
 * ── Optimism, and its revert ──────────────────────────────────────────────
 *
 * `useOptimistic` rather than `useState` for the same reason `OptimisticItems`
 * gives: the revert is the API's job, not ours. The guess lives exactly as long
 * as the transition that made it, so a rejected write drops back to server
 * truth without a line of rollback code. Text inputs are the exception — they
 * hold their own state while being typed into and save on blur, because a field
 * that reverts mid-word is unusable.
 *
 * ── Sections, not a sheet ─────────────────────────────────────────────────
 *
 * Every save sends ONE section. Two people edit this screen at once as a matter
 * of course — a GM marking damage while the player ticks a skill — and a
 * whole-sheet save means whoever clicked second silently discards the other's
 * work.
 */
export function CharacterSheet({
  character,
  canEdit,
}: {
  character: CharacterView;
  /** False only if the permission rules ever widen read beyond write. Today
   *  anyone who can open a sheet can edit it, but rendering the read-only case
   *  costs little and means the screen cannot leak an editable control. */
  canEdit: boolean;
}) {
  const [sheet, applyOptimistic] = useOptimistic(
    character.sheet,
    (current, patch: Partial<CharacterSheetData>) =>
      clampSheet({ ...current, ...patch }),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const derived = derive(sheet);

  /**
   * Save one section. The optimistic apply and the action must be inside the
   * same transition — that is what scopes the revert to this write.
   */
  const save = (patch: Partial<CharacterSheetData>) => {
    if (!canEdit) return;
    setError(null);
    startTransition(async () => {
      applyOptimistic(patch);
      const result = await updateCharacterAction(character.containerId, patch);
      if (!result.ok) {
        setError(result.error ?? "Could not save that change.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* One live region for the whole sheet. A failed save has to say so
          somewhere a screen reader reaches, and the alternative — a message per
          control — is thirty regions competing to be announced. */}
      <div aria-live="polite">
        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-danger bg-danger-weak p-3 text-base text-text">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-danger" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>

      <Identity
        character={character}
        sheet={sheet}
        canEdit={canEdit}
        onSave={save}
        onError={setError}
      />

      <Attributes sheet={sheet} canEdit={canEdit} onSave={save} />

      {/* Skills, then what is tracked during play, then what is looked up.
          One column in the docked panel; two once there is room; three on a
          wide screen, so the sheet uses the width instead of leaving it
          empty either side. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* At xl, Skills spans both rows of the left column and the other two
            stack on the right; at 2xl all three sit side by side. One render
            of each, placed by the grid — never a hidden duplicate. */}
        <div className="xl:row-span-2 2xl:row-span-1">
          <Skills sheet={sheet} canEdit={canEdit} onSave={save} />
        </div>

        <div className="flex flex-col gap-4">
          <Vitals sheet={sheet} canEdit={canEdit} onSave={save} />
          <RestBox sheet={sheet} canEdit={canEdit} onSave={save} />
          <Protection sheet={sheet} canEdit={canEdit} onSave={save} />
          <Purse sheet={sheet} canEdit={canEdit} onSave={save} />
        </div>

        <div className="flex flex-col gap-4">
          <LookupColumn sheet={sheet} canEdit={canEdit} onSave={save} castsSpells={derived.castsSpells} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 * Identity
 * ================================================================== */

function Identity({
  character,
  sheet,
  canEdit,
  onSave,
  onError,
}: {
  character: CharacterView;
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: (patch: Partial<CharacterSheetData>) => void;
  onError: (message: string | null) => void;
}) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState(character.name);

  /**
   * The character's name IS the container's name, so this is the ordinary
   * rename reached from a second screen — see `renameCharacterAction`.
   *
   * The value comes from the EVENT rather than from `name`. A blur that
   * arrives in the same tick as the last keystroke — which is what a form
   * submit, an autofill, or a test harness produces — runs the handler from the
   * previous render, where the closed-over state is one edit behind. Reading
   * the DOM cannot be stale.
   */
  const commitName = (typed: string) => {
    const trimmed = typed.trim();
    if (trimmed === character.name) return;
    if (trimmed === "") {
      setName(character.name);
      return;
    }
    onError(null);
    startTransition(async () => {
      const result = await renameCharacterAction(
        character.containerId,
        trimmed,
      );
      if (!result.ok) {
        setName(character.name);
        onError(result.error ?? "Could not rename that character.");
      }
    });
  };

  const setProfile = (patch: Partial<CharacterSheetData["profile"]>) =>
    onSave({ profile: { ...sheet.profile, ...patch } });

  return (
    <section className={SHEET_BOX}>
      <div className="flex flex-col gap-3 panel:flex-row panel:items-start">
        <div className="min-w-0 flex-1">
          <label htmlFor="character-name" className="sr-only">
            Character name
          </label>
          <input
            id="character-name"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => commitName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setName(character.name);
            }}
            maxLength={120}
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-serif text-2xl font-bold text-text hover:border-border focus:border-border disabled:hover:border-transparent"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Free text, so homebrew kin are typed in; the book's kin are
                suggestions and the only ones with their own base movement. */}
            <KinPicker
              kin={sheet.profile.kin}
              disabled={!canEdit}
              onCommit={(kin) => setProfile({ kin })}
            />

            <TextChip
              id="profession"
              label="Profession"
              value={sheet.profile.profession}
              placeholder="Profession"
              disabled={!canEdit}
              suggestions={PROFESSIONS}
              onCommit={(v) => setProfile({ profession: v })}
            />

            <Select
              id="age"
              label="Age"
              value={sheet.profile.age}
              disabled={!canEdit}
              onChange={(v) =>
                setProfile({ age: v as CharacterSheetData["profile"]["age"] })
              }
              options={AGES.map((a) => ({ value: a.key, label: a.label }))}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <LongText
          id="appearance"
          label="Appearance"
          value={sheet.profile.appearance}
          disabled={!canEdit}
          placeholder="What the table sees."
          onCommit={(v) => setProfile({ appearance: v })}
        />
        <LongText
          id="weakness"
          label="Weakness"
          value={sheet.profile.weakness}
          disabled={!canEdit}
          placeholder="The flaw that gets them into trouble."
          onCommit={(v) => setProfile({ weakness: v })}
        />
        <LongText
          id="memento"
          label="Memento"
          value={sheet.profile.memento}
          disabled={!canEdit}
          placeholder="The one thing they would run back for."
          onCommit={(v) => setProfile({ memento: v })}
        />
      </div>
    </section>
  );
}

/* ================================================================== *
 * Vitals — hit points, willpower, death rolls
 * ================================================================== */

function Vitals({
  sheet,
  canEdit,
  onSave,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: (patch: Partial<CharacterSheetData>) => void;
}) {
  const { maxHp, maxWp } = derive(sheet);

  return (
    // Full width until `md`. Two of these side by side inside a 380px panel
    // leaves about 170px a card, and the row of minus / plus / Rest does not
    // fit it — the docked panel is the PRIMARY target (Design.md Step F), so it
    // gets the comfortable layout rather than the squeezed one.
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      <PointsCard
        label="Hit points"
        hint="Maximum is CON"
        current={sheet.hp}
        max={maxHp}
        tone="danger"
        canEdit={canEdit}
        onChange={(hp) => onSave({ hp })}
      />
      <PointsCard
        label="Willpower"
        hint="Maximum is WIL"
        current={sheet.wp}
        max={maxWp}
        tone="info"
        canEdit={canEdit}
        onChange={(wp) => onSave({ wp })}
      />
      <DeathRollsCard
        rolls={sheet.deathRolls}
        con={sheet.attributes.CON}
        canEdit={canEdit}
        onChange={(deathRolls) => onSave({ deathRolls })}
      />
    </div>
  );
}

function PointsCard({
  label,
  hint,
  current,
  max,
  tone,
  canEdit,
  onChange,
}: {
  label: string;
  hint: string;
  current: number;
  max: number;
  tone: "danger" | "info";
  canEdit: boolean;
  onChange: (value: number) => void;
}) {
  const empty = current === 0;
  const hurt = current <= Math.floor(max / 2);
  const accent = tone === "danger" ? "text-danger" : "text-info";

  return (
    <section className={`flex flex-col ${SHEET_BOX}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className={SHEET_HEADING}>{label}</h2>
        <span className="text-xs text-faint">{hint}</span>
      </div>

      <p
        className={`mt-1 font-serif text-2xl font-bold tabular-nums ${
          empty ? accent : hurt ? "text-warning" : "text-text"
        }`}
      >
        {current}
        <span className="text-base font-normal text-muted"> / {max}</span>
      </p>

      {canEdit ? (
        <div className="mt-3 flex items-center gap-2">
          <IconButton
            icon="minus"
            label={`Lose one ${label.toLowerCase()}`}
            size={32}
            disabled={current <= 0}
            onClick={() => onChange(current - 1)}
            className="border border-border disabled:cursor-not-allowed disabled:text-faint"
          />
          <IconButton
            icon="plus"
            label={`Recover one ${label.toLowerCase()}`}
            size={32}
            disabled={current >= max}
            onClick={() => onChange(current + 1)}
            className="border border-border disabled:cursor-not-allowed disabled:text-faint"
          />
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={current >= max}
            onClick={() => onChange(max)}
          >
            Rest
          </Button>
        </div>
      ) : null}

      {empty ? (
        <p className={`mt-2 text-sm ${accent}`}>
          {tone === "danger"
            ? "Down. Roll for death at the start of each turn."
            : "Spent. No more magic until you rest."}
        </p>
      ) : null}
    </section>
  );
}

function DeathRollsCard({
  rolls,
  con,
  canEdit,
  onChange,
}: {
  rolls: CharacterSheetData["deathRolls"];
  /** Death rolls are CON rolls — shown on the dice label. */
  con: number;
  canEdit: boolean;
  onChange: (rolls: CharacterSheetData["deathRolls"]) => void;
}) {
  const dead = rolls.failures >= DEATH_ROLL_SLOTS;
  const stable = rolls.successes >= DEATH_ROLL_SLOTS;

  return (
    <section className={`flex flex-col sm:col-span-2 xl:col-span-1 2xl:col-span-2 ${SHEET_BOX}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={SHEET_HEADING}>Death rolls</h2>
        <span className="flex items-center gap-1 text-xs text-faint">
          Three ends it either way
          <RollButton notation="D20" label={`Death roll (CON ${con})`} />
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <Pips
          label="Successes"
          tone="success"
          count={rolls.successes}
          canEdit={canEdit}
          onChange={(successes) => onChange({ ...rolls, successes })}
        />
        <Pips
          label="Failures"
          tone="danger"
          count={rolls.failures}
          canEdit={canEdit}
          onChange={(failures) => onChange({ ...rolls, failures })}
        />
      </div>

      {stable || dead ? (
        <p
          className={`mt-2 text-sm ${dead ? "text-danger" : "text-success"}`}
        >
          {dead ? "Dead. The GM has the last word on that." : "Stabilised."}
        </p>
      ) : null}

      {canEdit && (rolls.successes > 0 || rolls.failures > 0) ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 self-start"
          onClick={() => onChange({ successes: 0, failures: 0 })}
        >
          Clear
        </Button>
      ) : null}
    </section>
  );
}

/**
 * Three clickable pips. Clicking the nth sets the count to n, and clicking the
 * one already at the end clears back to n-1 — which is how a tally behaves when
 * you mis-tick it, and it means undo is in the same place as do.
 */
function Pips({
  label,
  tone,
  count,
  canEdit,
  onChange,
}: {
  label: string;
  tone: "success" | "danger";
  count: number;
  canEdit: boolean;
  onChange: (count: number) => void;
}) {
  const fill = tone === "success" ? "bg-success" : "bg-danger";

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-sm text-muted">{label}</span>
      <div className="flex gap-1">
        {Array.from({ length: DEATH_ROLL_SLOTS }, (_, index) => {
          const slot = index + 1;
          const on = count >= slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={!canEdit}
              aria-pressed={on}
              onClick={() => onChange(on && count === slot ? slot - 1 : slot)}
              className={`h-6 w-6 rounded-sm border ${
                on ? `${fill} border-transparent` : "border-border-strong bg-surface2"
              } disabled:cursor-not-allowed`}
            >
              <span className="sr-only">
                {label} {slot} of {DEATH_ROLL_SLOTS}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== *
 * Attributes
 * ================================================================== */

function Attributes({
  sheet,
  canEdit,
  onSave,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: (patch: Partial<CharacterSheetData>) => void;
}) {
  const setAttribute = (key: AttributeKey, value: number) =>
    onSave({ attributes: { ...sheet.attributes, [key]: value } });

  const setCondition = (key: ConditionKey, on: boolean) =>
    onSave({ conditions: { ...sheet.conditions, [key]: on } });

  return (
    <section className={SHEET_BOX}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className={SHEET_HEADING}>Attributes</h2>
        <span className="text-xs text-faint">
          Base chance and conditions are derived
        </span>
      </div>

      {/* Two across at `panel` rather than three: an attribute box holds a
          stepper that is 128px wide before its own padding, and three columns
          inside 380px gives it 110px. The hard rule is no horizontal scroll at
          375px, and a stepper that does not fit its column is how you break
          it. */}
      <div className="grid grid-cols-1 gap-3 panel:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {ATTRIBUTE_KEYS.map((key) => (
          <AttributeBox
            key={key}
            attribute={key}
            score={sheet.attributes[key]}
            condition={sheet.conditions[conditionFor(key).key]}
            canEdit={canEdit}
            onScore={(value) => setAttribute(key, value)}
            onCondition={(on) => setCondition(conditionFor(key).key, on)}
          />
        ))}
      </div>

      <DerivedStrip sheet={sheet} />
    </section>
  );
}

function AttributeBox({
  attribute,
  score,
  condition,
  canEdit,
  onScore,
  onCondition,
}: {
  attribute: AttributeKey;
  score: number;
  condition: boolean;
  canEdit: boolean;
  onScore: (value: number) => void;
  onCondition: (on: boolean) => void;
}) {
  const { label: conditionLabel } = conditionFor(attribute);

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-3 ${
        condition ? "border-warning bg-warning-weak" : "border-border bg-surface2"
      }`}
    >
      <div>
        <label
          htmlFor={`attr-${attribute}`}
          className="block font-mono text-sm font-bold text-text"
          title={ATTRIBUTE_LABELS[attribute]}
        >
          {attribute}
        </label>
        <span className="flex items-center justify-between gap-1 text-xs text-faint">
          {ATTRIBUTE_LABELS[attribute]}
          <RollButton
            notation="D20"
            label={`${ATTRIBUTE_LABELS[attribute]} (${score})`}
            className="-my-1"
          />
        </span>
      </div>

      {canEdit ? (
        <NumberStepper
          id={`attr-${attribute}`}
          label={ATTRIBUTE_LABELS[attribute]}
          value={score}
          min={ATTRIBUTE_MIN}
          max={ATTRIBUTE_MAX}
          onChange={onScore}
          size="sm"
        />
      ) : (
        <p className="font-mono text-xl font-bold tabular-nums text-text">
          {score}
        </p>
      )}

      <p className="text-xs text-muted">
        Base chance{" "}
        <span className="font-mono tabular-nums text-text">
          {baseChance(score)}
        </span>
      </p>

      <label
        className={`flex items-center gap-2 text-xs ${
          canEdit ? "cursor-pointer" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={condition}
          disabled={!canEdit}
          onChange={(e) => onCondition(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-[var(--color-warning)]"
        />
        <span className={condition ? "font-medium text-warning" : "text-faint"}>
          {conditionLabel}
        </span>
        <span className="sr-only">
          , a condition on {ATTRIBUTE_LABELS[attribute]}
        </span>
      </label>
    </div>
  );
}

/* ================================================================== *
 * Skills
 * ================================================================== */

type SkillPatch = { trained?: boolean; marked?: boolean; advances?: number };

function Skills({
  sheet,
  canEdit,
  onSave,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: (patch: Partial<CharacterSheetData>) => void;
}) {
  // Thirty-three skills is a lot of rows in a 380px panel, and most of them are
  // untrained most of the time. The filter is the difference between a sheet
  // you can use at the table and one you scroll past.
  const [trainedOnly, setTrainedOnly] = useState(false);
  // Levels are read-only until asked for: a stepper on every row is thirty-
  // three chances to change a number by accident mid-session.
  const [editingLevels, setEditingLevels] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const setSkill = (name: string, patch: SkillPatch) =>
    onSave({
      skills: {
        ...sheet.skills,
        [name]: { ...skillState(sheet.skills, name), ...patch },
      },
    });

  const trainedCount = SKILLS.filter(
    (s) => skillState(sheet.skills, s.name).trained,
  ).length;
  const marked = SKILLS.filter((s) => skillState(sheet.skills, s.name).marked);

  return (
    <section className={`@container ${SHEET_BOX}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className={SHEET_HEADING}>Skills</h2>
          <p className="text-xs text-faint">
            {trainedCount} trained · {marked.length} marked for advancement
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Labelled with the ACTION, not the state. */}
          <Button
            size="sm"
            variant={trainedOnly ? "primary" : "ghost"}
            onClick={() => setTrainedOnly((on) => !on)}
            aria-pressed={trainedOnly}
          >
            {trainedOnly ? "Show all" : "Trained only"}
          </Button>
          {canEdit ? (
            <>
              <Button
                size="sm"
                variant={editingLevels ? "primary" : "ghost"}
                icon={editingLevels ? "check" : "edit"}
                onClick={() => setEditingLevels((on) => !on)}
                aria-pressed={editingLevels}
              >
                {editingLevels ? "Done" : "Edit levels"}
              </Button>
              <Button
                size="sm"
                variant={advancing ? "primary" : "secondary"}
                icon="arrow-up"
                onClick={() => setAdvancing((on) => !on)}
                aria-pressed={advancing}
                aria-controls="advancement"
              >
                Advancement{marked.length > 0 ? ` (${marked.length})` : ""}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {advancing && canEdit ? (
        <Advancement
          sheet={sheet}
          marked={marked.map((s) => s.name)}
          onSkill={setSkill}
          onClose={() => setAdvancing(false)}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        {SKILL_KINDS.map(({ kind, label }) => (
          <SkillGroup
            key={kind}
            kind={kind}
            label={label}
            sheet={sheet}
            trainedOnly={trainedOnly}
            editingLevels={editingLevels && canEdit}
            canEdit={canEdit}
            onSkill={setSkill}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-faint">
        Left box: trained (doubles the starting level). Right box: marked for
        advancement — tick it when a roll comes up a dragon or a demon.
      </p>
    </section>
  );
}

/**
 * Advancement, the Dragonbane way: between sessions, roll a d20 for every
 * marked skill; higher than the level raises it by one. The sheet cannot see
 * TaleSpire's dice, so each marked skill gets its die (inside TaleSpire) and
 * two answers. Either answer spends the mark.
 */
function Advancement({
  sheet,
  marked,
  onSkill,
  onClose,
}: {
  sheet: CharacterSheetData;
  marked: string[];
  onSkill: (name: string, patch: SkillPatch) => void;
  onClose: () => void;
}) {
  return (
    <div
      id="advancement"
      className="mb-4 rounded-sm border border-primary bg-primary-weak p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-text">
          Advancement
        </h3>
        <IconButton icon="close" label="Close advancement" size={14} onClick={onClose} />
      </div>
      {marked.length === 0 ? (
        <p className="text-sm text-muted">
          No skills marked. Tick a skill&apos;s right-hand box when a roll comes
          up a dragon (1) or a demon (20); between sessions, roll for each here.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            Roll a d20 for each. Higher than the level raises it by one.
          </p>
          <ul className="flex flex-col gap-2">
            {marked.map((name) => {
              const skill = SKILLS.find((s) => s.name === name);
              if (!skill) return null;
              const state = skillState(sheet.skills, name);
              const level = skillLevel(sheet.attributes[skill.attribute], state);
              const target = advancementTarget(level);
              return (
                <li
                  key={name}
                  className="flex flex-wrap items-center gap-2 rounded-sm bg-surface px-3 py-2"
                >
                  <span className="min-w-0 flex-1 font-medium text-text">{name}</span>
                  <span className="text-sm text-muted">
                    {target === null ? (
                      "Already 18"
                    ) : (
                      <>
                        beat <span className="font-mono font-bold text-text">{target}</span>
                      </>
                    )}
                  </span>
                  <RollButton notation="D20" label={`Advance ${name} (beat ${level})`} />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={target === null}
                    onClick={() =>
                      onSkill(name, { marked: false, advances: (state.advances ?? 0) + 1 })
                    }
                  >
                    Raised +1
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onSkill(name, { marked: false })}>
                    No change
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function SkillGroup({
  kind,
  label,
  sheet,
  trainedOnly,
  editingLevels,
  canEdit,
  onSkill,
}: {
  kind: SkillKind;
  label: string;
  sheet: CharacterSheetData;
  trainedOnly: boolean;
  editingLevels: boolean;
  canEdit: boolean;
  onSkill: (name: string, patch: SkillPatch) => void;
}) {
  const rows = SKILLS.filter((s) => s.kind === kind).filter(
    (s) => !trainedOnly || skillState(sheet.skills, s.name).trained,
  );

  if (rows.length === 0) {
    return (
      <div>
        <h3 className="mb-1 font-serif text-sm font-bold uppercase tracking-wider text-muted">
          {label}
        </h3>
        <p className="text-sm text-faint">Nothing trained here yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 font-serif text-sm font-bold uppercase tracking-wider text-muted">
        {label}
      </h3>
      {/* Columns, not a grid: a grid fills row by row, so an alphabetical
          list read A, Aw, B, Be... across. Columns fill the left one top to
          bottom first, the way a printed sheet reads. Two only when the BOX is
          wide enough (a container query), so names are not cut to "Acrobat…"
          and the editing stepper always fits. */}
      <ul className={`gap-x-6 ${editingLevels ? "@3xl:columns-2" : "@xl:columns-2"}`}>
        {rows.map((skill) => {
          const state = skillState(sheet.skills, skill.name);
          const score = sheet.attributes[skill.attribute];
          const level = skillLevel(score, state);
          const raised = (state.advances ?? 0) > 0;
          return (
            <li
              key={skill.name}
              className="flex break-inside-avoid items-center gap-2 border-b border-border py-1.5 last:border-0"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2" title={skill.name}>
                <input
                  type="checkbox"
                  checked={state.trained}
                  disabled={!canEdit}
                  onChange={(e) =>
                    onSkill(skill.name, { trained: e.target.checked })
                  }
                  className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-base ${
                    state.trained ? "font-medium text-text" : "text-muted"
                  }`}
                >
                  {skill.name}
                </span>
              </label>

              <span className="w-9 shrink-0 text-right font-mono text-xs text-faint">
                {skill.attribute}
              </span>

              {editingLevels ? (
                <NumberStepper
                  id={`skill-level-${skill.name.replace(/\W+/g, "-")}`}
                  label={`${skill.name} level`}
                  value={level}
                  min={1}
                  max={SKILL_LEVEL_MAX}
                  size="sm"
                  onChange={(next) =>
                    onSkill(skill.name, {
                      advances: next - skillValue(score, state.trained),
                    })
                  }
                />
              ) : (
                <span
                  className={`w-8 shrink-0 text-right font-mono text-base tabular-nums ${
                    state.trained || raised ? "font-bold text-primary" : "text-muted"
                  }`}
                  title={raised ? `Raised ${state.advances ?? 0} by advancement` : undefined}
                >
                  {level}
                </span>
              )}

              <RollButton notation="D20" label={`${skill.name} (${level})`} />

              {/* The advancement tick. Earned on a dragon or a demon, spent
                  between sessions. `relative` contains the sr-only span (see
                  the page's blank-scroll fix). */}
              <label
                className="relative flex shrink-0 items-center"
                title="Marked for advancement"
              >
                <input
                  type="checkbox"
                  checked={state.marked}
                  disabled={!canEdit}
                  onChange={(e) =>
                    onSkill(skill.name, { marked: e.target.checked })
                  }
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="sr-only">
                  Advancement mark for {skill.name}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ================================================================== *
 * Spells
 * ================================================================== */

function NoSpells() {
  return (
    <section className={SHEET_BOX}>
      <h2 className={`mb-1 ${SHEET_HEADING}`}>Spells</h2>
      <p className="text-base text-muted">
        Train a magic skill — Animism, Elementalism or Mentalism — and the spell
        list opens here.
      </p>
    </section>
  );
}

function Spells({
  sheet,
  canEdit,
  onSave,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: (patch: Partial<CharacterSheetData>) => void;
}) {
  // Read-only until the pencil, like heroic abilities.
  const [editingId, setEditingId] = useState<string | null>(null);
  const setSpells = (spells: Spell[]) => onSave({ spells });

  const add = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `spell-${Date.now()}`;
    setSpells([...sheet.spells, { id, name: "New spell", rank: 1, school: "", notes: "" }]);
    setEditingId(id);
  };

  const patch = (id: string, fields: Partial<Spell>) =>
    setSpells(
      sheet.spells.map((s) => (s.id === id ? { ...s, ...fields } : s)),
    );

  return (
    <section className={SHEET_BOX}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className={SHEET_HEADING}>Spells</h2>
        <span className="text-xs text-faint">
          {sheet.spells.length} known
        </span>
      </div>

      {sheet.spells.length === 0 ? (
        <p className="mb-3 text-base text-muted">Nothing learned yet.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {sheet.spells.map((spell) =>
            editingId === spell.id && canEdit ? (
              <li
                key={spell.id}
                className="grid items-end gap-2 rounded-sm border border-primary bg-surface2 p-3 panel:grid-cols-[1fr_auto]"
              >
                <TextInput
                  id={`spell-name-${spell.id}`}
                  label="Name"
                  value={spell.name}
                  onCommit={(name) => {
                    if (name.trim()) patch(spell.id, { name: name.trim() });
                  }}
                />
                <div>
                  <label
                    htmlFor={`spell-rank-${spell.id}`}
                    className="mb-1 block text-sm font-medium text-muted"
                  >
                    Rank
                  </label>
                  <NumberStepper
                    id={`spell-rank-${spell.id}`}
                    label="rank"
                    value={spell.rank}
                    min={0}
                    max={3}
                    size="sm"
                    onChange={(rank) => patch(spell.id, { rank })}
                  />
                </div>
                <div className="panel:col-span-2">
                  <TextInput
                    id={`spell-school-${spell.id}`}
                    label="School"
                    value={spell.school}
                    placeholder="Elementalism"
                    onCommit={(school) => patch(spell.id, { school })}
                  />
                </div>
                <div className="panel:col-span-2">
                  <LongText
                    id={`spell-notes-${spell.id}`}
                    label="Effect"
                    value={spell.notes}
                    placeholder="What it does."
                    onCommit={(notes) => patch(spell.id, { notes })}
                  />
                </div>
                <div className="flex items-center gap-2 panel:col-span-2">
                  <Button size="sm" variant="primary" icon="check" onClick={() => setEditingId(null)}>
                    Done
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon="trash"
                    className="ml-auto"
                    onClick={() => {
                      setSpells(sheet.spells.filter((s) => s.id !== spell.id));
                      setEditingId(null);
                    }}
                  >
                    Forget
                  </Button>
                </div>
              </li>
            ) : (
              <li key={spell.id} className="rounded-sm border border-border bg-surface2 p-3">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 font-medium text-text">{spell.name}</h3>
                  <span className="shrink-0 rounded-sm bg-accent-weak px-1.5 py-0.5 font-mono text-xs text-accent">
                    {spell.rank === 0 ? "Trick" : `Rank ${spell.rank}`}
                  </span>
                  {canEdit ? (
                    <IconButton
                      icon="edit"
                      label={`Edit ${spell.name}`}
                      size={14}
                      onClick={() => setEditingId(spell.id)}
                      className="-my-1 h-7 w-7"
                    />
                  ) : null}
                </div>
                {spell.school.trim() ? (
                  <p className="text-xs uppercase tracking-wide text-faint">{spell.school}</p>
                ) : null}
                {spell.notes.trim() ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-muted">{spell.notes}</p>
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}

      {canEdit ? (
        <Button size="sm" icon="plus" onClick={add}>
          Add spell
        </Button>
      ) : null}
    </section>
  );
}

const CUSTOM_KIN = "__custom";
/** The book's kin, without "Other": a homebrew kin is named, not "Other". */
const BOOK_KIN = KINS.filter((k) => k.key !== "other");

/**
 * Kin: every kin from the book in a dropdown, and "Custom…" for anything
 * else, which opens a text field for its name. A dropdown rather than the old
 * suggestion list, because a browser filters suggestions by what is already
 * typed — with "Human" filled in, Human was the only kin it would ever offer.
 */
function KinPicker({
  kin,
  disabled,
  onCommit,
}: {
  kin: string;
  disabled: boolean;
  onCommit: (kin: string) => void;
}) {
  const known = BOOK_KIN.find(
    (k) => k.key === kin.trim().toLowerCase() || k.label.toLowerCase() === kin.trim().toLowerCase(),
  );
  const [custom, setCustom] = useState(!known);

  return (
    <>
      <Select
        id="kin"
        label="Kin"
        value={custom ? CUSTOM_KIN : (known?.key ?? CUSTOM_KIN)}
        disabled={disabled}
        onChange={(value) => {
          if (value === CUSTOM_KIN) {
            setCustom(true);
            return;
          }
          setCustom(false);
          const picked = BOOK_KIN.find((k) => k.key === value);
          if (picked) onCommit(picked.label);
        }}
        options={[
          ...BOOK_KIN.map((k) => ({ value: k.key, label: k.label })),
          { value: CUSTOM_KIN, label: "Custom…" },
        ]}
      />
      {custom ? (
        <TextChip
          id="kin-custom"
          label="Kin name"
          value={known ? "" : kin}
          placeholder="e.g. Goblin"
          disabled={disabled}
          onCommit={(value) => {
            if (value.trim() !== "") onCommit(value.trim());
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Dice, heroic abilities and spells: the column a player LOOKS THINGS UP in.
 * DiceFinder lives here so rolling never means leaving the sheet.
 */
function LookupColumn({
  sheet,
  canEdit,
  onSave,
  castsSpells,
}: {
  sheet: CharacterSheetData;
  canEdit: boolean;
  onSave: (patch: Partial<CharacterSheetData>) => void;
  castsSpells: boolean;
}) {
  return (
    <>
      <section id="dice" className={`scroll-mt-4 ${SHEET_BOX}`}>
        <h2 className={`mb-2 ${SHEET_HEADING}`}>Dice</h2>
        <DiceFinder />
      </section>
      <HeroicAbilities sheet={sheet} canEdit={canEdit} onSave={onSave} />
      {castsSpells ? (
        <Spells sheet={sheet} canEdit={canEdit} onSave={onSave} />
      ) : (
        <NoSpells />
      )}
    </>
  );
}

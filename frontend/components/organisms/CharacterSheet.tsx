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
  skillValue,
} from "@backend/domain/character";
import type { CharacterView } from "@backend/domain/view";
import { Button } from "@frontend/components/atoms/Button";
import { Chip } from "@frontend/components/atoms/Chip";
import { Icon } from "@frontend/components/atoms/Icon";
import { IconButton } from "@frontend/components/atoms/IconButton";
import { NumberStepper } from "@frontend/components/atoms/NumberStepper";

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
        movement={derived.movement}
        canEdit={canEdit}
        onSave={save}
        onError={setError}
      />

      <Vitals sheet={sheet} canEdit={canEdit} onSave={save} />

      <Attributes sheet={sheet} canEdit={canEdit} onSave={save} />

      <Skills sheet={sheet} canEdit={canEdit} onSave={save} />

      {derived.castsSpells ? (
        <Spells sheet={sheet} canEdit={canEdit} onSave={save} />
      ) : (
        <NoSpells />
      )}
    </div>
  );
}

/* ================================================================== *
 * Identity
 * ================================================================== */

function Identity({
  character,
  sheet,
  movement,
  canEdit,
  onSave,
  onError,
}: {
  character: CharacterView;
  sheet: CharacterSheetData;
  movement: number;
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
    <section className="rounded-lg border border-border bg-surface p-4">
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
            <Select
              id="kin"
              label="Kin"
              value={sheet.profile.kin}
              disabled={!canEdit}
              onChange={(v) =>
                setProfile({ kin: v as CharacterSheetData["profile"]["kin"] })
              }
              options={KINS.map((k) => ({ value: k.key, label: k.label }))}
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

            {/* Derived, and labelled as such: kin's base plus the AGL step.
                There is nothing to edit here because there is nothing stored. */}
            <Chip tone="accent">
              <span className="text-faint">Movement</span>
              <span className="font-mono tabular-nums">{movement} m</span>
            </Chip>
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
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
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
    <section className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-text">{label}</h3>
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
  canEdit,
  onChange,
}: {
  rolls: CharacterSheetData["deathRolls"];
  canEdit: boolean;
  onChange: (rolls: CharacterSheetData["deathRolls"]) => void;
}) {
  const dead = rolls.failures >= DEATH_ROLL_SLOTS;
  const stable = rolls.successes >= DEATH_ROLL_SLOTS;

  return (
    <section className="flex flex-col rounded-lg border border-border bg-surface p-4 md:col-span-2 lg:col-span-1">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-text">Death rolls</h3>
        <span className="text-xs text-faint">Three ends it either way</span>
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
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-bold text-text">Attributes</h2>
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
        <span className="text-xs text-faint">
          {ATTRIBUTE_LABELS[attribute]}
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

  const setSkill = (name: string, patch: { trained?: boolean; marked?: boolean }) =>
    onSave({
      skills: {
        ...sheet.skills,
        [name]: { ...skillState(sheet.skills, name), ...patch },
      },
    });

  const trainedCount = SKILLS.filter(
    (s) => skillState(sheet.skills, s.name).trained,
  ).length;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-bold text-text">Skills</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-faint">
            {trainedCount} trained · value is the base chance, doubled
          </span>
          {/* Labelled with the ACTION, not the state. A button reading "Show
              all" while everything is already shown is a button that has told
              you what it is rather than what it does. */}
          <Button
            size="sm"
            variant={trainedOnly ? "primary" : "secondary"}
            onClick={() => setTrainedOnly((on) => !on)}
            aria-pressed={trainedOnly}
          >
            {trainedOnly ? "Show all" : "Trained only"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {SKILL_KINDS.map(({ kind, label }) => (
          <SkillGroup
            key={kind}
            kind={kind}
            label={label}
            sheet={sheet}
            trainedOnly={trainedOnly}
            canEdit={canEdit}
            onSkill={setSkill}
          />
        ))}
      </div>
    </section>
  );
}

function SkillGroup({
  kind,
  label,
  sheet,
  trainedOnly,
  canEdit,
  onSkill,
}: {
  kind: SkillKind;
  label: string;
  sheet: CharacterSheetData;
  trainedOnly: boolean;
  canEdit: boolean;
  onSkill: (name: string, patch: { trained?: boolean; marked?: boolean }) => void;
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
      <ul className="grid gap-x-6 lg:grid-cols-2">
        {rows.map((skill) => {
          const state = skillState(sheet.skills, skill.name);
          const score = sheet.attributes[skill.attribute];
          return (
            <li
              key={skill.name}
              className="flex items-center gap-2 border-b border-border py-1.5 last:border-0"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2">
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

              <span
                className={`w-8 shrink-0 text-right font-mono text-base tabular-nums ${
                  state.trained ? "font-bold text-primary" : "text-muted"
                }`}
              >
                {skillValue(score, state.trained)}
              </span>

              {/* The advancement tick. Earned on a dragon or a demon, spent
                  between sessions — so it is a state a player sets during play,
                  not a derived one. */}
              <label className="shrink-0" title="Advancement mark">
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
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-1 font-serif text-lg font-bold text-text">Spells</h2>
      <p className="text-base text-muted">
        This section appears once a magic skill is trained — Animism,
        Elementalism or Mentalism.
      </p>
      <p className="mt-1 text-sm text-faint">
        Which is the object-graph point made small: a spell list is a property
        of what the character IS, not a section every sheet has to carry empty.
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
  const setSpells = (spells: Spell[]) => onSave({ spells });

  const add = () =>
    setSpells([
      ...sheet.spells,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `spell-${Date.now()}`,
        name: "New spell",
        rank: 1,
        school: "",
        notes: "",
      },
    ]);

  const patch = (id: string, fields: Partial<Spell>) =>
    setSpells(
      sheet.spells.map((s) => (s.id === id ? { ...s, ...fields } : s)),
    );

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-bold text-text">Spells</h2>
        <span className="text-xs text-faint">
          {sheet.spells.length} known
        </span>
      </div>

      {sheet.spells.length === 0 ? (
        <p className="mb-3 text-base text-muted">Nothing learned yet.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {sheet.spells.map((spell) => (
            <li
              key={spell.id}
              className="grid items-end gap-2 rounded-md border border-border bg-surface2 p-3 md:grid-cols-[1fr_auto_10rem_auto]"
            >
              <TextInput
                id={`spell-name-${spell.id}`}
                label="Name"
                value={spell.name}
                disabled={!canEdit}
                onCommit={(name) => patch(spell.id, { name })}
              />
              <div>
                <label
                  htmlFor={`spell-rank-${spell.id}`}
                  className="mb-1 block text-sm font-medium text-muted"
                >
                  Rank
                </label>
                {canEdit ? (
                  <NumberStepper
                    id={`spell-rank-${spell.id}`}
                    label="rank"
                    value={spell.rank}
                    min={0}
                    max={3}
                    onChange={(rank) => patch(spell.id, { rank })}
                  />
                ) : (
                  <p className="font-mono text-base tabular-nums text-text">
                    {spell.rank}
                  </p>
                )}
              </div>
              <TextInput
                id={`spell-school-${spell.id}`}
                label="School"
                value={spell.school}
                disabled={!canEdit}
                placeholder="Elementalism"
                onCommit={(school) => patch(spell.id, { school })}
              />
              {canEdit ? (
                <IconButton
                  icon="trash"
                  label={`Forget ${spell.name}`}
                  size={36}
                  onClick={() =>
                    setSpells(sheet.spells.filter((s) => s.id !== spell.id))
                  }
                  className="border border-border hover:text-danger"
                />
              ) : null}
            </li>
          ))}
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

/* ================================================================== *
 * Small shared inputs
 *
 * Text holds its own state and commits on blur. Every other control on this
 * sheet writes on click, but a field that reverted mid-word — which optimistic
 * state would do on every keystroke's round trip — is a field nobody can type
 * a sentence into.
 * ================================================================== */

function TextInput({
  id,
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        // From the event, not from `draft` — see the note on `commitName`.
        onBlur={(e) => {
          if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value);
        }}
        className="h-9 w-full rounded-md border border-border bg-surface px-2 text-base text-text placeholder:text-faint"
      />
    </div>
  );
}

function LongText({
  id,
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      <textarea
        id={id}
        value={draft}
        rows={2}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
        }}
        className="w-full rounded-md border border-border bg-surface2 p-2 text-base text-text placeholder:text-faint"
      />
    </div>
  );
}

/** A compact labelled select that reads as a chip in the identity row. */
function Select({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface2 px-1.5 py-0.5">
      <label htmlFor={id} className="text-xs text-faint">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs text-text focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Free text that still reads as a chip — profession, where an enum would cost
 *  every homebrew class and buy nothing, since nothing is derived from it. */
function TextChip({
  id,
  label,
  value,
  placeholder,
  suggestions,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  suggestions?: readonly string[];
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const listId = `${id}-suggestions`;

  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface2 px-1.5 py-0.5">
      <label htmlFor={id} className="text-xs text-faint">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        list={suggestions ? listId : undefined}
        size={Math.max(8, draft.length || 8)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value);
        }}
        className="bg-transparent text-xs text-text placeholder:text-faint focus:outline-none"
      />
      {suggestions ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </span>
  );
}

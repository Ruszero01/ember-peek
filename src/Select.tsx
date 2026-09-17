// One dropdown, drawn once. Callers pass the choices in and get the chosen value back;
// nothing about the surface, the chevron or the list is theirs to describe. The stylesheet
// travels with the component for the same reason `Toggle`'s does — a control that is copied
// around by hand drifts, and the copy that drifts is always the one without the open list.
import "./select.css";

export type SelectChoice = { value: string; label: string };

/** The plugin-side twin of this component is `.ui-select` in `sdk/web/ui.css`; a change to
 *  the look belongs in both, the way `.ui-button` mirrors the host's own buttons. */
export function Select({
  value,
  choices,
  label,
  disabled = false,
  busy = false,
  onChange,
}: {
  value: string;
  choices: readonly SelectChoice[];
  /** Accessible name. The visible label sits beside the control, so it is not read here. */
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <span className="select-control">
      <select
        aria-label={label}
        value={value}
        disabled={disabled || busy}
        onChange={(event) => onChange(event.target.value)}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </span>
  );
}

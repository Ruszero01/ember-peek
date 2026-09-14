// One switch, drawn once. Callers pass state in and get the next state back; nothing about the
// geometry, the colours or the motion is theirs to describe. The stylesheet travels with the
// component for the same reason — a control that is copied around by hand drifts, and the copy that
// drifts is always the one without the animation.
import "./toggle.css";

export type ToggleProps = {
  /** Fully controlled: the switch never keeps a copy of the state it is given. */
  checked: boolean;
  /** Receives the next state, so a caller does not have to negate the current one itself. */
  onChange: (checked: boolean) => void;
  /** Accessible name. The visible label sits next to the switch, so it is not read from here. */
  label: string;
  /**
   * Blocked for good, and it should look it.
   */
  disabled?: boolean;
  /**
   * Blocked only while a write is in flight. The control still refuses clicks, but it is not drawn
   * as unusable and does not blink: the settings form marks every option of a plugin busy during one
   * save, and dimming them all for that instant is what a flash looks like.
   */
  busy?: boolean;
};

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  busy = false,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || busy}
      disabled={disabled || busy}
      className={`toggle${checked ? " on" : ""}${disabled ? " is-disabled" : ""}${busy ? " busy" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

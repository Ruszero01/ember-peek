/** Keep local edits until a settings snapshot acknowledges the latest value. */
export class SettingDraft {
  constructor(value) { this.value = value; this.pending = false; }
  edit(value) { this.value = value; this.pending = true; }
  receive(value) {
    if (this.pending && Math.abs(value - this.value) > 1e-8) return false;
    this.value = value; this.pending = false; return true;
  }
  reset(value) { this.value = value; this.pending = false; }
}

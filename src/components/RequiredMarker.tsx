// The single app-wide convention for marking form-field optionality:
// REQUIRED fields render this marker after their label; OPTIONAL fields render
// nothing (no "(optional)" suffix). Rendered inside a field's label element,
// e.g. `<FormLabel>Amount <RequiredMarker /></FormLabel>`.
//
// The asterisk is purely visual (`aria-hidden`) — the canonical machine-readable
// signal is `aria-required`/validation on the input itself.
export function RequiredMarker() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

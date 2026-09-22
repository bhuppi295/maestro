/**
 * Renders a VS Code codicon — the same icon set the editor itself uses, so
 * Maestro's chrome matches native buttons instead of relying on emoji, which
 * render inconsistently per OS/font and don't match VS Code's visual weight.
 * Name is the codicon id without the `codicon-` prefix, e.g. "check".
 */
export default function Icon({
  name,
  className = '',
  spin = false,
}: {
  name: string;
  className?: string;
  spin?: boolean;
}) {
  return (
    <span
      className={`codicon codicon-${name} ${spin ? 'codicon-modifier-spin' : ''} ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

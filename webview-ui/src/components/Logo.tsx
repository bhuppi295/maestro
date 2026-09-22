interface Props {
  size?: number;
}

/**
 * Maestro product mark — gradient tile with the M + command-dot glyph.
 * Replaces the generic music-note codicon so header, setup and zero
 * states all carry the orchestration identity.
 */
export default function Logo({ size = 26 }: Props) {
  return (
    <span
      className="mo-logo"
      style={{ width: size, height: size, borderRadius: size * 0.32 }}
      aria-hidden="true"
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 18.5V8l5 5.5 3-3.5 3 3.5 5-5.5v10.5" />
        <circle cx="17.4" cy="4.4" r="1.9" fill="#fff" stroke="none" />
      </svg>
    </span>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="vh-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#c026d3" />
        </linearGradient>
        <radialGradient id="vh-h" cx="0.25" cy="0.15" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#vh-g)" />
      <rect width="512" height="512" rx="116" fill="url(#vh-h)" />
      <g fill="#fff">
        <rect x="86" y="198" width="46" height="116" rx="23" opacity="0.78" />
        <rect x="160" y="150" width="46" height="212" rx="23" opacity="0.92" />
        <rect x="233" y="96" width="46" height="320" rx="23" />
        <rect x="306" y="150" width="46" height="212" rx="23" opacity="0.92" />
        <rect x="380" y="198" width="46" height="116" rx="23" opacity="0.78" />
      </g>
    </svg>
  );
}

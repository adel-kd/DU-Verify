// The stamp is the product's signature motif: every confirmed verification
// gets a hand-stamped seal, echoing the bank/notary stamps Ethiopian
// merchants already associate with an authenticated document.
export default function Seal({ state = "pending", size = 72 }) {
  const palette = {
    valid: { ring: "#12A783", mark: "#12A783", label: "VERIFIED" },
    used: { ring: "#D5573B", mark: "#D5573B", label: "USED" },
    mismatch: { ring: "#E2A63B", mark: "#E2A63B", label: "MISMATCH" },
    error: { ring: "#D5573B", mark: "#D5573B", label: "UNCONFIRMED" },
    unavailable: { ring: "#222222", mark: "#222222", label: "TRY AGAIN" },
    pending: { ring: "#8CA0B3", mark: "#8CA0B3", label: "PENDING" },
  }[state] || { ring: "#8CA0B3", mark: "#8CA0B3", label: "PENDING" };

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={state === "valid" ? "animate-[stampIn_0.4s_ease-out]" : ""}>
      <circle cx="50" cy="50" r="46" fill="none" stroke={palette.ring} strokeWidth="3" strokeDasharray="4 3" />
      <circle cx="50" cy="50" r="38" fill="none" stroke={palette.ring} strokeWidth="1.5" />
      {state === "valid" && (
        <path d="M36 43 L46 53 L65 34" fill="none" stroke={palette.mark} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {state === "mismatch" && (
        <>
          <path d="M50 31 V48" fill="none" stroke={palette.mark} strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="57" r="2.5" fill={palette.mark} />
        </>
      )}
      {(state === "error" || state === "used") && (
        <>
          <path d="M41 36 L59 54" fill="none" stroke={palette.mark} strokeWidth="4" strokeLinecap="round" />
          <path d="M59 36 L41 54" fill="none" stroke={palette.mark} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {(state === "unavailable" || state === "pending") && (
        <>
          <circle cx="41" cy="44" r="2.5" fill={palette.mark} />
          <circle cx="50" cy="44" r="2.5" fill={palette.mark} />
          <circle cx="59" cy="44" r="2.5" fill={palette.mark} />
        </>
      )}
      <text x="50" y="72" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif" fontSize="8" fontWeight="700" fill={palette.mark} letterSpacing="0.8">
        {palette.label}
      </text>
    </svg>
  );
}

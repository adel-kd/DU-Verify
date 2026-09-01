// The stamp is the product's signature motif: every confirmed verification
// gets a hand-stamped seal, echoing the bank/notary stamps Ethiopian
// merchants already associate with an authenticated document.
export default function Seal({ state = "pending", size = 72 }) {
  const palette = {
    valid: { ring: "#12A783", mark: "#12A783", label: "VERIFIED" },
    used: { ring: "#D5573B", mark: "#D5573B", label: "DUPLICATE" },
    mismatch: { ring: "#E2A63B", mark: "#E2A63B", label: "MISMATCH" },
    error: { ring: "#D5573B", mark: "#D5573B", label: "UNCONFIRMED" },
    // Neutral BLACK state: we could not determine the outcome.
    // Never red, never green.
    unavailable: { ring: "#1F2937", mark: "#1F2937", label: "UNAVAILABLE" },
    pending: { ring: "#8CA0B3", mark: "#8CA0B3", label: "PENDING" },
  }[state] || { ring: "#8CA0B3", mark: "#8CA0B3", label: "PENDING" };

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={state === "valid" ? "animate-[stampIn_0.4s_ease-out]" : ""}>
      <circle cx="50" cy="50" r="46" fill="none" stroke={palette.ring} strokeWidth="3" strokeDasharray="4 3" />
      <circle cx="50" cy="50" r="38" fill="none" stroke={palette.ring} strokeWidth="1.5" />
      <text x="50" y="46" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif" fontSize="10" fontWeight="700" fill={palette.mark} letterSpacing="1">
        {palette.label}
      </text>
      <text x="50" y="62" textAnchor="middle" fontFamily="'Inter', sans-serif" fontSize="6.5" fill={palette.mark} letterSpacing="2">
        DIGITAL VERIFICATION
      </text>
      {state === "valid" && (
        <path d="M35 51 L45 61 L67 39" fill="none" stroke={palette.mark} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

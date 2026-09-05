
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import logoSmall from "../assets/verified-logo.png";

export default function TopBar({ dark = true }) {
  const { user } = useAuth();

  const nav = useNavigate();
  const location = useLocation();

  const onSettings = location.pathname === "/settings";

  /*
   * ============================================================
   * CURRENT LOGGED-IN ACCOUNT
   * ============================================================
   *
   * owner -> owner's own name
   * staff -> staff member's own name
   * admin -> admin's own name
   *
   * This comes directly from the authenticated user.
   *
   * TopBar must NOT fetch businessId or another user's account.
   */
  const displayName = user?.ownerName || "";

  /*
   * DU PT belongs to the business.
   *
   * publicUser() already normalizes this:
   *
   * owner -> owner's business balance
   * staff -> their business's balance
   * admin -> no balance
   */
  const duptBalance = user?.duptBalance;

  /*
   * ============================================================
   * HOME ROUTE
   * ============================================================
   */
  let homePath = "/verify";

  if (user?.role === "admin") {
    homePath = "/admin";
  } else if (user?.role === "owner") {
    homePath = "/dashboard";
  }

  const isAdmin = user?.role === "admin";

  /*
   * Client/owner dashboard must NOT show the Settings button.
   *
   * Settings remains available for staff.
   */
  const canShowSettings =
    user?.role !== "owner" &&
    user?.role !== "admin";

  return (
    <header
      className={
        "sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-xl sm:px-6 " +
        "flex items-center justify-between gap-3 " +
        (dark
          ? "border-white/10 bg-[#13201b]/95 text-paper shadow-[0_8px_30px_-20px_rgba(0,0,0,0.8)]"
          : "border-black/10 bg-white/90 text-ink")
      }
    >
      {/* ======================================================
          LEFT SIDE
      ======================================================= */}

      <Link
        to={homePath}
        className="group flex min-w-0 items-center gap-2.5"
      >
        {/* Logo */}
        <img
          src={logoSmall}
          alt="DU Verify"
          className="h-9 w-9 shrink-0 transition-transform duration-300 group-hover:scale-105"
        />

        {/* App name */}
        <span className="font-display text-[15px] font-bold tracking-[-0.02em] whitespace-nowrap">
          DU Verify
        </span>

        {/* ====================================================
            BUSINESS / PLATFORM LABEL
        ==================================================== */}

        {isAdmin ? (
          <span className="hidden md:inline text-mist text-sm truncate">
            / Platform admin
          </span>
        ) : (
          user?.businessName && (
            <span className="hidden md:inline text-mist text-sm truncate max-w-[220px]">
              / {user.businessName}
            </span>
          )
        )}
      </Link>

      {/* ======================================================
          RIGHT SIDE
      ======================================================= */}

      <div className="flex items-center gap-2 sm:gap-3 text-sm shrink-0">

        {/* ====================================================
            CURRENT USER
        ==================================================== */}

        {displayName && (
          <span className="hidden sm:inline text-mist whitespace-nowrap">
            Welcome,{" "}
            <span className="text-paper font-medium">
              {displayName}
            </span>
          </span>
        )}

        {/* ====================================================
            BUSINESS DU PT BALANCE
        ==================================================== */}

        {!isAdmin &&
          duptBalance !== undefined && (
          <span className="rounded-full border border-seal/30 bg-seal/10 px-2.5 py-1 font-semibold tabular-nums text-seal sm:px-3 whitespace-nowrap">
              {Number(duptBalance || 0).toLocaleString()} DU PT
            </span>
          )}

        {/* ====================================================
            SETTINGS
        ====================================================

            IMPORTANT:
            - Owner/client admin -> HIDDEN
            - Platform admin -> HIDDEN
            - Staff -> SHOWN
        */}

        {canShowSettings && (
          <button
            type="button"
            onClick={() => nav("/settings")}
            aria-label="Settings"
            title="Settings"
            className={
              "rounded-full p-1.5 transition " +
              (onSettings
                ? "bg-white/10 text-paper"
                : "text-mist hover:text-paper hover:bg-white/5")
            }
          >
            <GearIcon />
          </button>
        )}
      </div>
    </header>
  );
}

/* ============================================================
   SETTINGS ICON
============================================================ */

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="3"
      />

      <path
        d="
          M19.4 15a1.65 1.65 0 0 0
          .33 1.82l.06.06a2 2 0 1 1
          -2.83 2.83l-.06-.06a1.65 1.65
          0 0 0-1.82-.33 1.65 1.65
          0 0 0-1 1.51V21a2 2 0 0 1
          -4 0v-.09A1.65 1.65 0 0 0
          9 19.4a1.65 1.65 0 0 0-1.82
          .33l-.06.06a2 2 0 1 1
          -2.83-2.83l.06-.06a1.65 1.65
          0 0 0 .33-1.82 1.65 1.65
          0 0 0-1.51-1H3a2 2 0 0 1
          0-4h.09A1.65 1.65 0 0 0
          4.6 9a1.65 1.65 0 0 0-.33-1.82
          l-.06-.06a2 2 0 1 1
          2.83-2.83l.06.06a1.65 1.65
          0 0 0 1.82.33H9a1.65 1.65
          0 0 0 1-1.51V3a2 2 0 0 1
          4 0v.09a1.65 1.65 0 0 0
          1 1.51 1.65 1.65 0 0 0
          1.82-.33l.06-.06a2 2 0 1 1
          2.83 2.83l-.06.06a1.65 1.65
          0 0 0-.33 1.82V9a1.65 1.65
          0 0 0 1.51 1H21a2 2 0 0 1
          0 4h-.09a1.65 1.65 0 0 0-1.51 1z
        "
      />
    </svg>
  );
}

import { useEffect, useState } from "react";
import api from "../lib/api.js";

export default function BillingPanel({
  duptBalance,
  onBalanceChange,
  showLedger = false,
}) {
  const [packages, setPackages] = useState([]);
  const [etbPerDupt, setEtbPerDupt] = useState(2);
  const [customAmount, setCustomAmount] = useState("");
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);

  // ------------------------------------------------------------
  // Load packages + live custom rate
  // ------------------------------------------------------------

  useEffect(() => {
    api
      .get("/billing/packages")
      .then(({ data }) => {
        setPackages(data.packages || []);
      })
      .catch(() => { });

    api
      .get("/billing/rate")
      .then(({ data }) => {
        setEtbPerDupt(data.etbPerDupt || 2);
      })
      .catch(() => { });
  }, []);

  // ------------------------------------------------------------
  // Refresh balance
  //
  // This is important after returning from Chapa.
  // ------------------------------------------------------------

  async function refreshBalance() {
    try {
      setRefreshingBalance(true);

      const { data } = await api.get("/billing/balance");

      const newBalance =
        data.duptBalance ??
        data.walletBalance ??
        0;

      // Tell parent/AuthContext about the new balance.
      if (onBalanceChange) {
        onBalanceChange(newBalance);
      }

      return newBalance;
    } catch (err) {
      console.error(
        "[billing] failed to refresh balance:",
        err
      );

      return null;
    } finally {
      setRefreshingBalance(false);
    }
  }

  // ------------------------------------------------------------
  // Detect return from Chapa
  //
  // Chapa redirects to:
  //
  // /dashboard?topup=success
  //
  // or:
  //
  // /dashboard?topup=failed
  // ------------------------------------------------------------

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    const topupStatus =
      params.get("topup");

    if (
      topupStatus !== "success" &&
      topupStatus !== "pending"
    ) {
      return;
    }

    // Give the backend callback/webhook a moment to finish
    // before asking for the latest balance.
    let cancelled = false;

    async function syncAfterPayment() {
      setRefreshingBalance(true);

      // Try immediately first.
      let balance =
        await refreshBalance();

      if (cancelled) return;

      // In some cases Chapa's callback and frontend redirect
      // can arrive almost simultaneously. If the webhook has not
      // finished yet, retry briefly.
      if (
        topupStatus === "success" &&
        balance !== null
      ) {
        for (let i = 0; i < 4; i++) {
          if (cancelled) return;

          await new Promise((resolve) =>
            setTimeout(resolve, 1000)
          );

          balance =
            await refreshBalance();

          if (cancelled) return;
        }
      }

      setRefreshingBalance(false);
    }

    syncAfterPayment();

    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------
  // Billing ledger
  // ------------------------------------------------------------

  useEffect(() => {
    if (!showLedger) return;

    setLedgerLoading(true);

    api
      .get("/billing/ledger", {
        params: {
          limit: 20,
        },
      })
      .then(({ data }) => {
        setLedger(data.items || []);
      })
      .catch(() => { })
      .finally(() => {
        setLedgerLoading(false);
      });
  }, [showLedger]);

  // ------------------------------------------------------------
  // Custom top-up preview
  // ------------------------------------------------------------

  const previewDupt =
    customAmount &&
      Number(customAmount) > 0
      ? Math.floor(
        Number(customAmount) / etbPerDupt
      )
      : 0;

  // ------------------------------------------------------------
  // Start custom top-up
  // ------------------------------------------------------------

  async function startCustomTopUp(e) {
    e.preventDefault();

    setError("");

    const amount =
      Number(customAmount);

    if (!amount || amount <= 0) {
      setError(
        "Enter a valid ETB amount"
      );
      return;
    }

    setBusyKey("custom");

    try {
      const { data } =
        await api.post(
          "/billing/topup",
          {
            mode: "custom",
            amount,
          }
        );

      if (!data.checkout_url) {
        throw new Error(
          "Chapa checkout URL was not returned"
        );
      }

      window.location.href =
        data.checkout_url;
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.message ||
        "Top-up failed"
      );

      setBusyKey(null);
    }
  }

  // ------------------------------------------------------------
  // Buy package
  // ------------------------------------------------------------

  async function buyPackage(pkg) {
    setError("");

    setBusyKey(pkg._id);

    try {
      const { data } =
        await api.post(
          "/billing/topup",
          {
            mode: "package",
            packageId: pkg._id,
          }
        );

      if (!data.checkout_url) {
        throw new Error(
          "Chapa checkout URL was not returned"
        );
      }

      window.location.href =
        data.checkout_url;
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.message ||
        "Purchase failed"
      );

      setBusyKey(null);
    }
  }

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------

  return (
    <div className="space-y-6">

      {/* DU PT BALANCE */}

      {duptBalance !== undefined && (
        <div className="bg-ink text-paper rounded-2xl p-5 text-center">

          <p className="text-xs uppercase tracking-wide text-mist">
            DU PT Balance
          </p>

          <p className="font-display text-3xl font-bold mt-1">
            {Number(
              duptBalance || 0
            ).toLocaleString()}{" "}
            DU PT
          </p>

          {refreshingBalance && (
            <p className="text-xs text-mist mt-2">
              Updating balance…
            </p>
          )}

        </div>
      )}

      {/* ERROR */}

      {error && (
        <div className="bg-alarm/10 border border-alarm/30 text-alarm rounded-xl px-4 py-2.5 text-sm">
          {error}
        </div>
      )}

      {/* CUSTOM TOP-UP */}

      <section>
        <h3 className="font-display font-semibold text-ink dark:text-paper mb-2">
          Custom Top Up
        </h3>

        <form
          onSubmit={startCustomTopUp}
          className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 space-y-3"
        >
          <label className="block">

            <span className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">
              ETB amount
            </span>

            <input
              type="number"
              min="2"
              step="1"
              value={customAmount}
              onChange={(e) =>
                setCustomAmount(
                  e.target.value
                )
              }
              placeholder="400"
              className="w-full mt-1.5 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-lg font-display"
            />

          </label>

          {previewDupt > 0 && (
            <p className="text-sm text-ink/60 dark:text-mist">
              You receive{" "}
              <span className="font-semibold text-seal">
                {previewDupt} DU PT
              </span>
            </p>
          )}

          <button
            type="submit"
            disabled={
              busyKey === "custom"
            }
            className="w-full bg-ink text-paper font-medium rounded-lg px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {busyKey === "custom"
              ? "Redirecting…"
              : "Continue"}
          </button>

        </form>
      </section>

      {/* DISCOUNTED PACKAGES */}

      {packages.length > 0 && (
        <section>

          <h3 className="font-display font-semibold text-ink dark:text-paper mb-2">
            Discounted Packages
          </h3>

          <div className="grid sm:grid-cols-3 gap-3">

            {packages.map((pkg) => (
              <div
                key={pkg._id}
                className="bg-white rounded-2xl border border-seal/30 shadow-sm p-4 flex flex-col"
              >

                <p className="font-display font-semibold text-ink dark:text-paper">
                  {pkg.name}
                </p>

                <p className="text-2xl font-display font-bold text-seal mt-1">
                  {pkg.duptAmount.toLocaleString()} DU PT
                </p>

                <p className="text-sm text-ink/60 dark:text-mist mt-1">
                  ETB{" "}
                  {pkg.priceETB.toLocaleString()}
                </p>

                <p className="text-xs text-ink/40 dark:text-mist">
                  ETB{" "}
                  {(
                    pkg.priceETB /
                    pkg.duptAmount
                  ).toFixed(2)}{" "}
                  / verification
                </p>

                <button
                  type="button"
                  onClick={() =>
                    buyPackage(pkg)
                  }
                  disabled={
                    busyKey === pkg._id
                  }
                  className="mt-3 bg-seal text-ink dark:text-paper font-semibold rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                >
                  {busyKey === pkg._id
                    ? "Redirecting…"
                    : "Buy"}
                </button>

              </div>
            ))}

          </div>
        </section>
      )}

      {/* BILLING LEDGER */}

      {showLedger && (
        <section>

          <h3 className="font-display font-semibold text-ink dark:text-paper mb-2">
            Billing history
          </h3>

          <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm overflow-x-auto">

            <table className="w-full text-sm min-w-[520px]">

              <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line">

                <tr>
                  <th className="py-2 px-4 font-medium">
                    Date
                  </th>

                  <th className="font-medium">
                    Type
                  </th>

                  <th className="font-medium">
                    DU PT
                  </th>

                  <th className="font-medium">
                    Balance after
                  </th>
                </tr>

              </thead>

              <tbody>

                {ledgerLoading && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-6 text-center text-ink/30 px-4"
                    >
                      Loading…
                    </td>
                  </tr>
                )}

                {!ledgerLoading &&
                  ledger.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-6 text-center text-ink/30 px-4"
                      >
                        No billing activity yet
                      </td>
                    </tr>
                  )}

                {ledger.map(
                  (entry) => (
                    <tr
                      key={entry._id}
                      className="border-b border-black/5 dark:border-line last:border-0"
                    >

                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {new Date(
                          entry.createdAt
                        ).toLocaleString()}
                      </td>

                      <td className="whitespace-nowrap">
                        {entry.type.replaceAll(
                          "_",
                          " "
                        )}
                      </td>

                      <td
                        className={
                          entry.duptAmount >= 0
                            ? "text-seal font-medium"
                            : "text-alarm font-medium"
                        }
                      >
                        {entry.duptAmount >=
                          0
                          ? "+"
                          : ""}
                        {entry.duptAmount}
                      </td>

                      <td>
                        {entry.balanceAfter}
                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </section>
      )}

    </div>
  );
}
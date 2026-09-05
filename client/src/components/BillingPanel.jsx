import { useEffect, useMemo, useState } from "react";
import api from "../lib/api.js";

const EMPTY_METHODS = { chapaEnabled: true, bankTransferEnabled: false };

export default function BillingPanel({
  duptBalance,
  onBalanceChange,
  showLedger = false,
}) {
  const [packages, setPackages] = useState([]);
  const [etbPerDupt, setEtbPerDupt] = useState(2);
  const [customTopupEnabled, setCustomTopupEnabled] = useState(true);
  const [customAmount, setCustomAmount] = useState("");
  const [paymentMethods, setPaymentMethods] = useState(EMPTY_METHODS);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState("chapa");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [transferPurchase, setTransferPurchase] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [transferResult, setTransferResult] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);

  async function loadTransferHistory() {
    try {
      const { data } = await api.get("/billing/bank-transfers");
      setTransfers(data.items || []);
    } catch {
      setTransfers([]);
    }
  }

  useEffect(() => {
    api.get("/billing/packages").then(({ data }) => setPackages(data.packages || [])).catch(() => {});
    api
      .get("/billing/rate")
      .then(({ data }) => {
        setEtbPerDupt(data.etbPerDupt || 2);
        setCustomTopupEnabled(data.customTopupEnabled !== false);
      })
      .catch(() => {});
    api
      .get("/billing/payment-options")
      .then(({ data }) => {
        const methods = data.paymentMethods || EMPTY_METHODS;
        const accounts = data.accounts || [];
        setPaymentMethods(methods);
        setPaymentAccounts(accounts);
        setSelectedAccountId(accounts[0]?._id || "");
        setSelectedMethod((current) => {
          if (current === "chapa" && methods.chapaEnabled) return current;
          if (current === "bank_transfer" && methods.bankTransferEnabled) return current;
          return methods.chapaEnabled ? "chapa" : "bank_transfer";
        });
      })
      .catch(() => {});
    loadTransferHistory();
  }, []);

  async function refreshBalance() {
    try {
      setRefreshingBalance(true);
      const { data } = await api.get("/billing/balance");
      const newBalance = data.duptBalance ?? data.walletBalance ?? 0;
      onBalanceChange?.(newBalance);
      return newBalance;
    } catch (requestError) {
      console.error("[billing] failed to refresh balance:", requestError);
      return null;
    } finally {
      setRefreshingBalance(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topupStatus = params.get("topup");
    if (topupStatus !== "success" && topupStatus !== "pending") return undefined;

    let cancelled = false;
    async function syncAfterPayment() {
      const txRef = params.get("tx_ref");
      if (txRef) {
        for (let index = 0; index < 5 && !cancelled; index += 1) {
          try {
            const { data } = await api.post(`/billing/confirm/${encodeURIComponent(txRef)}`);
            if (data.duptBalance != null) onBalanceChange?.(data.duptBalance);
            break;
          } catch (requestError) {
            if (index === 4) console.error("[billing] payment confirmation failed:", requestError);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
      if (!cancelled) await refreshBalance();
    }
    syncAfterPayment();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showLedger) return;
    setLedgerLoading(true);
    api
      .get("/billing/ledger", { params: { limit: 20 } })
      .then(({ data }) => setLedger(data.items || []))
      .catch(() => {})
      .finally(() => setLedgerLoading(false));
  }, [showLedger, duptBalance]);

  const hasPendingTransfer = transfers.some((item) =>
    ["processing", "pending_review", "crediting"].includes(item.status)
  );

  useEffect(() => {
    if (!hasPendingTransfer) return undefined;
    const interval = window.setInterval(() => {
      loadTransferHistory();
      refreshBalance();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [hasPendingTransfer]);

  const previewDupt =
    customAmount && Number(customAmount) > 0
      ? Math.floor(Number(customAmount) / etbPerDupt)
      : 0;

  const selectedAccount = useMemo(
    () => paymentAccounts.find((account) => account._id === selectedAccountId) || null,
    [paymentAccounts, selectedAccountId]
  );

  async function beginPurchase(purchase, key) {
    setError("");
    setTransferResult(null);

    if (selectedMethod === "bank_transfer") {
      if (!paymentMethods.bankTransferEnabled || paymentAccounts.length === 0) {
        setError("Direct bank transfer is not available right now.");
        return;
      }
      setTransferPurchase(purchase);
      setReceipt(null);
      return;
    }

    if (!paymentMethods.chapaEnabled) {
      setError("Chapa payment is not available right now.");
      return;
    }

    setBusyKey(key);
    try {
      const payload =
        purchase.mode === "package"
          ? { mode: "package", packageId: purchase.packageId }
          : { mode: "custom", amount: purchase.amount };
      const { data } = await api.post("/billing/topup", payload);
      if (!data.checkout_url) throw new Error("Chapa checkout URL was not returned");
      window.location.href = data.checkout_url;
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Payment could not start");
      setBusyKey(null);
    }
  }

  function startCustomTopUp(event) {
    event.preventDefault();
    const amount = Number(customAmount);
    if (!amount || amount <= 0 || previewDupt < 1) {
      setError(`Enter at least ETB ${etbPerDupt}`);
      return;
    }
    beginPurchase(
      { mode: "custom", amount, etbAmount: amount, duptAmount: previewDupt, label: "Custom top up" },
      "custom"
    );
  }

  function buyPackage(pkg) {
    beginPurchase(
      {
        mode: "package",
        packageId: pkg._id,
        etbAmount: pkg.priceETB,
        duptAmount: pkg.duptAmount,
        label: `${pkg.name} package`,
      },
      pkg._id
    );
  }

  async function submitBankTransfer(event) {
    event.preventDefault();
    setError("");
    if (!transferPurchase || !selectedAccountId) {
      setError("Choose a purchase and payment account first.");
      return;
    }
    if (!receipt) {
      setError("Upload your payment screenshot or PDF receipt.");
      return;
    }

    const formData = new FormData();
    formData.append("mode", transferPurchase.mode);
    formData.append("paymentAccountId", selectedAccountId);
    formData.append("receipt", receipt);
    if (transferPurchase.mode === "package") {
      formData.append("packageId", transferPurchase.packageId);
    } else {
      formData.append("amount", String(transferPurchase.amount));
    }

    setBusyKey("bank-transfer");
    try {
      const { data } = await api.post("/billing/bank-transfer", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setTransferResult(data);
      await loadTransferHistory();
      if (data.status === "success") {
        if (data.duptBalance != null) onBalanceChange?.(data.duptBalance);
        await refreshBalance();
        setTransferPurchase(null);
        setReceipt(null);
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          requestError.message ||
          "Could not submit the receipt"
      );
    } finally {
      setBusyKey(null);
    }
  }

  const anyPaymentMethod = paymentMethods.chapaEnabled || paymentMethods.bankTransferEnabled;

  return (
    <div className="space-y-6">
      {duptBalance !== undefined && (
        <div className="bg-ink text-paper rounded-2xl p-5 text-center">
          <p className="text-xs uppercase tracking-wide text-mist">DU PT Balance</p>
          <p className="font-display text-3xl font-bold mt-1">
            {Number(duptBalance || 0).toLocaleString()} DU PT
          </p>
          {refreshingBalance && <p className="text-xs text-mist mt-2">Updating balance…</p>}
        </div>
      )}

      <section className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4">
        <h3 className="font-display font-semibold text-ink dark:text-paper">Choose payment method</h3>
        <p className="text-xs text-ink/45 dark:text-mist mt-1 mb-3">
          Pay online with Chapa or transfer directly to a DU Verify account.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {paymentMethods.chapaEnabled && (
            <label className={`flex gap-3 border rounded-xl p-3 cursor-pointer ${selectedMethod === "chapa" ? "border-seal bg-seal/5" : "border-black/10 dark:border-line"}`}>
              <input type="radio" name="payment-method" value="chapa" checked={selectedMethod === "chapa"} onChange={() => { setSelectedMethod("chapa"); setTransferPurchase(null); }} />
              <span><strong className="block text-sm">Chapa</strong><span className="text-xs text-ink/45 dark:text-mist">Secure online checkout</span></span>
            </label>
          )}
          {paymentMethods.bankTransferEnabled && (
            <label className={`flex gap-3 border rounded-xl p-3 cursor-pointer ${selectedMethod === "bank_transfer" ? "border-seal bg-seal/5" : "border-black/10 dark:border-line"}`}>
              <input type="radio" name="payment-method" value="bank_transfer" checked={selectedMethod === "bank_transfer"} onChange={() => setSelectedMethod("bank_transfer")} />
              <span><strong className="block text-sm">Direct bank transfer</strong><span className="text-xs text-ink/45 dark:text-mist">Upload a screenshot or receipt</span></span>
            </label>
          )}
        </div>
        {!anyPaymentMethod && <p className="text-sm text-alarm mt-3">Payments are temporarily unavailable.</p>}
      </section>

      {error && <div className="bg-alarm/10 border border-alarm/30 text-alarm rounded-xl px-4 py-2.5 text-sm">{error}</div>}

      {transferResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${transferResult.status === "success" ? "bg-seal/10 border-seal/30 text-sealDark" : "bg-amber-50 border-amber-300 text-amber-900"}`}>
          <p className="font-semibold">{transferResult.status === "success" ? "Payment approved" : "Waiting for admin approval"}</p>
          <p className="mt-1">{transferResult.userMessage}</p>
          {transferResult.txRef && <p className="text-xs mt-1 opacity-70">Reference: {transferResult.txRef}</p>}
        </div>
      )}

      {customTopupEnabled && (
        <section>
          <h3 className="font-display font-semibold text-ink dark:text-paper mb-2">Custom Top Up</h3>
          <form onSubmit={startCustomTopUp} className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm p-4 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">ETB amount</span>
              <input type="number" min={etbPerDupt} step="1" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder="400" className="w-full mt-1.5 border border-black/10 dark:border-line bg-transparent rounded-lg px-3 py-2 text-lg font-display" />
            </label>
            {previewDupt > 0 && <p className="text-sm text-ink/60 dark:text-mist">You receive <span className="font-semibold text-seal">{previewDupt} DU PT</span></p>}
            <button type="submit" disabled={busyKey === "custom" || !anyPaymentMethod} className="w-full bg-ink text-paper font-medium rounded-lg px-4 py-2.5 text-sm disabled:opacity-50">
              {busyKey === "custom" ? "Redirecting…" : selectedMethod === "chapa" ? "Continue with Chapa" : "Continue with bank transfer"}
            </button>
          </form>
        </section>
      )}

      {packages.length > 0 && (
        <section>
          <h3 className="font-display font-semibold text-ink dark:text-paper mb-2">Discounted Packages</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {packages.map((pkg) => (
              <div key={pkg._id} className="bg-white dark:bg-panel rounded-2xl border border-seal/30 shadow-sm p-4 flex flex-col">
                <p className="font-display font-semibold text-ink dark:text-paper">{pkg.name}</p>
                <p className="text-2xl font-display font-bold text-seal mt-1">{pkg.duptAmount.toLocaleString()} DU PT</p>
                <p className="text-sm text-ink/60 dark:text-mist mt-1">ETB {pkg.priceETB.toLocaleString()}</p>
                <p className="text-xs text-ink/40 dark:text-mist">ETB {(pkg.priceETB / pkg.duptAmount).toFixed(2)} / verification</p>
                <button type="button" onClick={() => buyPackage(pkg)} disabled={busyKey === pkg._id || !anyPaymentMethod} className="mt-3 bg-seal text-ink font-semibold rounded-lg px-3 py-2 text-sm disabled:opacity-50">
                  {busyKey === pkg._id ? "Redirecting…" : selectedMethod === "chapa" ? "Buy with Chapa" : "Pay by transfer"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedMethod === "bank_transfer" && transferPurchase && (
        <section className="bg-white dark:bg-panel rounded-2xl border-2 border-seal/30 shadow-sm p-4 sm:p-5">
          <h3 className="font-display font-semibold text-ink dark:text-paper">Pay ETB {Number(transferPurchase.etbAmount).toLocaleString()}</h3>
          <p className="text-sm text-ink/55 dark:text-mist mt-1">{transferPurchase.label} · {transferPurchase.duptAmount.toLocaleString()} DU PT</p>
          <p className="text-xs text-ink/45 dark:text-mist mt-2">Transfer the exact amount to one account below, then upload the complete receipt.</p>
          <div className="space-y-2 mt-4">
            {paymentAccounts.map((account) => (
              <label key={account._id} className={`block border rounded-xl p-3 cursor-pointer ${selectedAccountId === account._id ? "border-seal bg-seal/5" : "border-black/10 dark:border-line"}`}>
                <span className="flex gap-3 items-start">
                  <input type="radio" name="bank-account" checked={selectedAccountId === account._id} onChange={() => setSelectedAccountId(account._id)} className="mt-1" />
                  <span>
                    <strong className="block text-sm">{account.label || account.provider}</strong>
                    <span className="block text-sm font-mono mt-1">{account.accountNumber}</span>
                    <span className="block text-xs text-ink/50 dark:text-mist">Holder: {account.accountHolderName}</span>
                    {account.instructions && <span className="block text-xs text-ink/50 dark:text-mist mt-1">{account.instructions}</span>}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {selectedAccount && (
            <form onSubmit={submitBankTransfer} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink/50 dark:text-mist">Receipt screenshot or PDF</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReceipt(event.target.files?.[0] || null)} className="block w-full mt-1.5 text-sm border border-black/10 dark:border-line rounded-lg p-2" />
              </label>
              <button disabled={busyKey === "bank-transfer"} className="w-full bg-seal text-ink font-semibold rounded-lg px-4 py-2.5 text-sm disabled:opacity-50">
                {busyKey === "bank-transfer" ? "Verifying receipt…" : "Submit receipt"}
              </button>
            </form>
          )}
        </section>
      )}

      {transfers.length > 0 && (
        <section>
          <h3 className="font-display font-semibold text-ink dark:text-paper mb-2">Bank transfer status</h3>
          <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm divide-y divide-black/5">
            {transfers.slice(0, 5).map((item) => (
              <div key={item._id} className="p-3 flex items-center justify-between gap-3 text-sm">
                <div><p className="font-medium">ETB {item.amount} · {item.duptAmount} DU PT</p><p className="text-xs text-ink/40 dark:text-mist">{new Date(item.submittedAt || item.createdAt).toLocaleString()}</p>{item.reviewReason && item.status !== "success" && <p className="text-xs text-ink/50 dark:text-mist mt-1">{item.reviewReason}</p>}</div>
                <span className={`text-xs font-semibold ${item.status === "success" ? "text-seal" : item.status === "rejected" ? "text-alarm" : "text-amber-700"}`}>
                  {item.status === "pending_review" ? "Waiting for admin" : item.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {showLedger && (
        <section>
          <h3 className="font-display font-semibold text-ink dark:text-paper mb-2">Billing history</h3>
          <div className="bg-white dark:bg-panel rounded-2xl border border-black/5 dark:border-line shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="text-left text-ink/40 dark:text-mist border-b border-black/5 dark:border-line"><tr><th className="py-2 px-4 font-medium">Date</th><th className="font-medium">Type</th><th className="font-medium">DU PT</th><th className="font-medium">Balance after</th></tr></thead>
              <tbody>
                {ledgerLoading && <tr><td colSpan={4} className="py-6 text-center text-ink/30 px-4">Loading…</td></tr>}
                {!ledgerLoading && ledger.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-ink/30 px-4">No billing activity yet</td></tr>}
                {ledger.map((entry) => (
                  <tr key={entry._id} className="border-b border-black/5 dark:border-line last:border-0">
                    <td className="py-2.5 px-4 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td><td className="whitespace-nowrap">{entry.type.replaceAll("_", " ")}</td><td className={entry.duptAmount >= 0 ? "text-seal font-medium" : "text-alarm font-medium"}>{entry.duptAmount >= 0 ? "+" : ""}{entry.duptAmount}</td><td>{entry.balanceAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

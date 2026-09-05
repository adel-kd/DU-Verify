import {
  useEffect,
  useRef,
  useState,
} from "react";

import jsQR from "jsqr";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileCheck2,
  ReceiptText,
  ScanLine,
  UploadCloud,
} from "lucide-react";

import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import TopBar from "../components/TopBar.jsx";
import Footer from "../components/Footer.jsx";
import Seal from "../components/Seal.jsx";
import CameraCapture from "../components/CameraCapture.jsx";
import AnnouncementBanner from "../components/AnnouncementBanner.jsx";
import UnverifiedNotice from "../components/UnverifiedNotice.jsx";
import ProviderBadge from "../components/ProviderBadge.jsx";


/* ============================================================
   PROVIDER LABELS
============================================================ */

const BANK_LABELS = {
  CBEBirr: "CBE Birr",
};


/* ============================================================
   RESULT STATES
============================================================ */

const SEAL_STATE = {
  VALID: "valid",
  ALREADY_USED: "used",
  AMOUNT_MISMATCH: "mismatch",
  RECEIVER_MISMATCH: "mismatch",
  NOT_VERIFIED: "error",
  OCR_FAILED: "unavailable",
  PROVIDER_ERROR: "unavailable",
  PROVIDER_UNAVAILABLE: "unavailable",
  INVALID_FORMAT: "unavailable",
  SITE_ERROR: "unavailable",
};

const RESULT_TONE = {
  VALID: "border-seal/30 bg-seal/[0.06]",
  AMOUNT_MISMATCH: "border-[#E2A63B]/40 bg-[#E2A63B]/10",
  RECEIVER_MISMATCH: "border-[#E2A63B]/40 bg-[#E2A63B]/10",
  NOT_VERIFIED: "border-alarm/35 bg-alarm/[0.07]",
  ALREADY_USED: "border-alarm/35 bg-alarm/[0.07]",
  OCR_FAILED: "border-ink/20 bg-ink/[0.04] dark:border-white/15 dark:bg-black/20",
  PROVIDER_ERROR: "border-ink/20 bg-ink/[0.04] dark:border-white/15 dark:bg-black/20",
  PROVIDER_UNAVAILABLE: "border-ink/20 bg-ink/[0.04] dark:border-white/15 dark:bg-black/20",
  INVALID_FORMAT: "border-ink/20 bg-ink/[0.04] dark:border-white/15 dark:bg-black/20",
  SITE_ERROR: "border-ink/20 bg-ink/[0.04] dark:border-white/15 dark:bg-black/20",
};

const TRY_AGAIN_STATUSES = new Set([
  "OCR_FAILED",
  "PROVIDER_ERROR",
  "PROVIDER_UNAVAILABLE",
  "INVALID_FORMAT",
  "SITE_ERROR",
]);


const RESULT_COPY = {
  VALID:
    "This receipt matches a confirmed transaction.",

  ALREADY_USED:
    "This exact reference has already been redeemed here before.",

  AMOUNT_MISMATCH:
    "The confirmed amount doesn't match what was entered.",

  RECEIVER_MISMATCH:
    "This transaction is real, but it was not paid to this business's account.",

  NOT_VERIFIED:
    "Payment unconfirmed. The payment provider was reached but did not confirm this transaction.",

  OCR_FAILED:
    "Could not read this receipt.",

  PROVIDER_UNAVAILABLE:
    "We couldn't reliably reach the payment provider. This does not mean the payment is invalid. Please try again.",

  PROVIDER_ERROR:
    "We couldn't reliably reach the payment provider. This does not mean the payment is invalid. Please try again.",

  INVALID_FORMAT:
    "This doesn't look like a valid receipt for the selected bank. Please try again.",

  SITE_ERROR:
    "Something went wrong while completing this check. Please try again.",
};


const OCR_FAILURE_COPY = {
  NOT_TRANSACTION:
    "This does not look like a payment receipt or USSD confirmation.",

  CBE_USSD_NOT_ACCEPTED:
    "CBE USSD results are not accepted.",

  TOO_BLURRY:
    "The image is too blurry to read the reference number. Please retake the photo.",

  NO_REFERENCE:
    "Could not find a transaction reference in this image.",

  API_ERROR:
    "Receipt scanning is temporarily unavailable. Please contact your administrator.",
};


/* ============================================================
   HELPERS
============================================================ */

function providerLabel(provider) {
  return BANK_LABELS[provider] || provider;
}

function withTryAgain(message) {
  const value = String(message || "").trim();

  if (!value) {
    return "We couldn't complete this check. Please try again.";
  }

  if (/please try again[.!]?$/i.test(value)) {
    return value;
  }

  const sentence = /[.!?]$/.test(value) ? value : `${value}.`;
  return `${sentence} Please try again.`;
}

function resultMessage(result) {
  if (result.status === "NOT_VERIFIED") {
    return RESULT_COPY.NOT_VERIFIED;
  }

  let message = result.userMessage;

  if (!message && result.status === "OCR_FAILED") {
    message = OCR_FAILURE_COPY[result.failureReason] || RESULT_COPY.OCR_FAILED;
  }

  message = message || RESULT_COPY[result.status] || "Verification completed.";

  return TRY_AGAIN_STATUSES.has(result.status)
    ? withTryAgain(message)
    : message;
}


/* ============================================================
   TIME HELPERS
============================================================ */

function formatRelativeTime(
  value,
  now = Date.now()
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const diffMs =
    now - date.getTime();

  if (diffMs < 60 * 1000) {
    return "Just now";
  }

  const diffSeconds =
    Math.floor(diffMs / 1000);

  const minutes =
    Math.floor(diffSeconds / 60);

  if (minutes < 60) {
    return `${minutes} ${minutes === 1
      ? "minute"
      : "minutes"
      } ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} ${hours === 1
      ? "hour"
      : "hours"
      } ago`;
  }

  const days =
    Math.floor(hours / 24);

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


function formatExactTime(value) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );
}


function isOlderThanOneHour(
  value,
  now = Date.now()
) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const ageMs =
    now - date.getTime();

  return (
    ageMs >=
    60 * 60 * 1000
  );
}


function getTransactionTime(result) {
  if (!result) {
    return null;
  }

  return (
    result.log?.transactionTime ||

    result.providerDetails?.transactionTime ||

    result.providerData?.transactionDate ||

    result.providerData?.transactionTime ||

    result.providerData?.paidAt ||

    result.providerData?.date ||

    result.providerData?.timestamp ||

    null
  );
}


/* ============================================================
   CBE QR HELPERS
============================================================ */

/**
 * Check whether a QR payload looks like a CBE receipt.
 *
 * We intentionally keep this broad.
 *
 * The frontend preserves the COMPLETE QR payload.
 * It does not extract or modify the token.
 */
function isCBEReceiptPayload(value) {
  if (!value) {
    return false;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  return (
    normalized.includes(
      "mbreciept.cbe.com.et"
    ) ||
    normalized.includes(
      "mb.cbe.com.et"
    )
  );
}


/**
 * Decode a QR code from an image file.
 *
 * Returns the COMPLETE QR payload.
 */
async function decodeQRCode(file) {
  if (!file) {
    return null;
  }

  return new Promise((resolve) => {
    const image =
      new Image();

    const objectUrl =
      URL.createObjectURL(file);

    image.onload = () => {
      try {
        const MAX_SIZE = 1800;

        let width =
          image.naturalWidth;

        let height =
          image.naturalHeight;

        if (
          width > MAX_SIZE ||
          height > MAX_SIZE
        ) {
          const scale =
            Math.min(
              MAX_SIZE / width,
              MAX_SIZE / height
            );

          width =
            Math.floor(
              width * scale
            );

          height =
            Math.floor(
              height * scale
            );
        }

        const canvas =
          document.createElement(
            "canvas"
          );

        canvas.width = width;
        canvas.height = height;

        const context =
          canvas.getContext(
            "2d",
            {
              willReadFrequently:
                true,
            }
          );

        if (!context) {
          URL.revokeObjectURL(
            objectUrl
          );

          resolve(null);
          return;
        }

        context.drawImage(
          image,
          0,
          0,
          width,
          height
        );

        const imageData =
          context.getImageData(
            0,
            0,
            width,
            height
          );

        const qr =
          jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
            {
              inversionAttempts:
                "attemptBoth",
            }
          );

        URL.revokeObjectURL(
          objectUrl
        );

        if (!qr?.data) {
          resolve(null);
          return;
        }

        resolve(
          qr.data.trim()
        );
      } catch (error) {
        console.warn(
          "[CBE QR] decode failed:",
          error
        );

        URL.revokeObjectURL(
          objectUrl
        );

        resolve(null);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(
        objectUrl
      );

      resolve(null);
    };

    image.src =
      objectUrl;
  });
}


async function tryCBEQRCode(file) {
  if (!file) {
    return {
      found: false,
    };
  }

  const qrData =
    await decodeQRCode(file);

  if (!qrData) {
    return {
      found: false,
    };
  }

  console.log(
    "[CBE QR] decoded:",
    qrData
  );

  if (
    isCBEReceiptPayload(qrData)
  ) {
    return {
      found: true,
      isCBE: true,
      value: qrData,
    };
  }

  return {
    found: true,
    isCBE: false,
    value: qrData,
  };
}


/* ============================================================
   VERIFY COMPONENT
============================================================ */

export default function Verify() {
  const {
    user,
    updateWallet,
  } = useAuth();


  /* ==========================================================
     REGISTERED PAYMENT ACCOUNTS
  ========================================================== */

  const [
    paymentAccounts,
    setPaymentAccounts,
  ] = useState([]);

  const [
    accountsLoading,
    setAccountsLoading,
  ] = useState(true);

  const [
    accountsError,
    setAccountsError,
  ] = useState("");

  /*
   * Provider selected for verification.
   */
  const [
    bank,
    setBank,
  ] = useState("");

  /*
   * Provider whose payment information
   * is currently being shown.
   */
  const [
    activeAccountId,
    setActiveAccountId,
  ] = useState(null);

  /*
   * Mobile long-press support.
   */
  const longPressTimer =
    useRef(null);


  /* ==========================================================
     FORM STATE
  ========================================================== */

  const [amount, setAmount] =
    useState("");

  const [payerPhone, setPayerPhone] =
    useState("");

  const [
    transactionRef,
    setTransactionRef,
  ] = useState("");

  const [file, setFile] =
    useState(null);

  const [preview, setPreview] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [result, setResult] =
    useState(null);

  const [error, setError] =
    useState("");


  /* ==========================================================
     CBE QR STATE
  ========================================================== */

  const [
    cbeQrDetected,
    setCbeQrDetected,
  ] = useState(false);

  const [
    cbeQrValue,
    setCbeQrValue,
  ] = useState("");


  /* ==========================================================
     CURRENT TIME
  ========================================================== */

  const [
    currentTime,
    setCurrentTime,
  ] = useState(Date.now());


  const fileInput =
    useRef(null);


  /* ==========================================================
     FETCH REGISTERED PAYMENT ACCOUNTS
  ========================================================== */

  useEffect(() => {
    let cancelled = false;

    async function loadPaymentAccounts() {
      setAccountsLoading(true);
      setAccountsError("");

      try {
        const { data } =
          await api.get(
            "/payment-accounts"
          );

        if (cancelled) {
          return;
        }

        /*
         * Only accounts actually returned by
         * the backend are exposed as providers.
         *
         * The backend should already filter
         * disabled/unconfigured accounts.
         */
        const accounts =
          Array.isArray(data?.accounts)
            ? data.accounts
            : [];

        setPaymentAccounts(
          accounts
        );

        /*
         * Automatically select the first
         * registered provider.
         *
         * Don't overwrite an existing
         * selection unnecessarily.
         */
        if (accounts.length > 0) {
          setBank((current) => {
            const stillExists =
              accounts.some(
                (account) =>
                  account.provider ===
                  current
              );

            return stillExists
              ? current
              : accounts[0].provider;
          });
        } else {
          setBank("");
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error(
          "[payment accounts] failed:",
          err
        );

        setPaymentAccounts([]);
        setBank("");

        setAccountsError(
          err.response?.data?.error ||
          "Could not load the registered payment accounts."
        );
      } finally {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      }
    }

    loadPaymentAccounts();

    return () => {
      cancelled = true;
    };
  }, []);


  /* ==========================================================
     LIVE CLOCK
  ========================================================== */

  useEffect(() => {
    const interval =
      setInterval(() => {
        setCurrentTime(
          Date.now()
        );
      }, 15_000);

    return () => {
      clearInterval(interval);
    };
  }, []);


  /* ==========================================================
     CLEAN STATE WHEN BANK CHANGES
  ========================================================== */

  useEffect(() => {
    if (bank !== "CBE") {
      setCbeQrDetected(false);
      setCbeQrValue("");
    }

    setResult(null);
    setError("");
  }, [bank]);


  /* ==========================================================
     FILE HANDLING
  ========================================================== */

  async function handleFile(file) {
    if (!file) {
      return;
    }

    setFile(file);

    /*
     * Revoke old preview before replacing it.
     */
    if (preview) {
      URL.revokeObjectURL(
        preview
      );
    }

    const nextPreview =
      URL.createObjectURL(file);

    setPreview(nextPreview);

    setResult(null);
    setError("");

    /*
     * Reset previous QR state.
     */
    setCbeQrDetected(false);
    setCbeQrValue("");


    /*
     * CBE:
     *
     * Try QR decoding immediately.
     *
     * No backend request happens here.
     */
    if (bank === "CBE") {
      const qr =
        await tryCBEQRCode(file);

      if (
        qr.found &&
        qr.isCBE &&
        qr.value
      ) {
        /*
         * Preserve the COMPLETE QR payload.
         */
        setCbeQrDetected(true);

        setCbeQrValue(
          qr.value
        );

        /*
         * Put the complete URL in the
         * reference field too.
         */
        setTransactionRef(
          qr.value
        );

        console.log(
          "[CBE QR] receipt URL detected:",
          qr.value
        );
      }
    }
  }


  async function onPickFile(e) {
    const selectedFile =
      e.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    await handleFile(
      selectedFile
    );
  }


  /* ==========================================================
     PAYMENT ACCOUNT INTERACTION
  ========================================================== */

  function startLongPress(accountId) {
    clearTimeout(
      longPressTimer.current
    );

    longPressTimer.current =
      setTimeout(() => {
        setActiveAccountId(
          accountId
        );
      }, 400);
  }


  function cancelLongPress() {
    clearTimeout(
      longPressTimer.current
    );
  }


  function selectProvider(
    provider
  ) {
    setBank(provider);

    /*
     * Clicking a provider is also the
     * bank selector.
     */
    setResult(null);
    setError("");
  }


  function copyAccount(
    accountId,
    accountNumber
  ) {
    if (
      navigator.clipboard?.writeText &&
      accountNumber
    ) {
      navigator.clipboard.writeText(
        accountNumber
      );
    }

    setActiveAccountId(
      accountId
    );
  }


  /* ==========================================================
     VERIFY
  ========================================================== */

  async function handleVerify() {
    if (!bank) {
      setError(
        "Please select a registered payment provider."
      );

      return;
    }

    const hasReference =
      transactionRef.trim()
        .length > 0;


    /*
     * Image is optional when a reference
     * or CBE QR URL exists.
     */
    if (
      !file &&
      !hasReference
    ) {
      setError(
        "Please upload a receipt or enter the transaction reference."
      );

      return;
    }


    setLoading(true);
    setError("");
    setResult(null);


    try {
      const form =
        new FormData();


      /*
       * Image is still sent.
       *
       * Backend can use OCR fallback
       * where necessary.
       */
      if (file) {
        form.append(
          "image",
          file
        );
      }


      form.append(
        "bankName",
        bank
      );


      /*
       * Expected amount is optional.
       */
      if (amount) {
        form.append(
          "expectedAmount",
          amount
        );
      }


      /*
       * CBE QR:
       *
       * transactionRef contains the
       * COMPLETE URL decoded from QR.
       */
      if (hasReference) {
        form.append(
          "transactionRef",
          transactionRef.trim()
        );
      }


      /*
       * CBE Birr payer phone.
       */
      if (
        bank === "CBEBirr" &&
        payerPhone
      ) {
        form.append(
          "phoneNumber",
          payerPhone
        );
      }


      /*
       * Tell backend this came from
       * the CBE QR when applicable.
       */
      if (
        bank === "CBE" &&
        cbeQrDetected &&
        cbeQrValue
      ) {
        form.append(
          "verificationSource",
          "qr"
        );

        form.append(
          "qrData",
          cbeQrValue
        );
      }


      const { data } =
        await api.post(
          "/verify",
          form,
          {
            headers: {
              "content-type":
                "multipart/form-data",
            },
          }
        );


      setResult(data);

      setCurrentTime(
        Date.now()
      );


      /*
       * Update DU PT balance.
       */
      if (
        data.duptBalance != null ||
        data.walletBalance != null
      ) {
        updateWallet(
          data.duptBalance ??
          data.walletBalance
        );
      }

    } catch (err) {
      const message =
        err.response?.data
          ?.error ||
        err.message ||
        "Verification failed";


      console.error(
        "[verify] client error:",
        message
      );


      setError(withTryAgain(message));

    } finally {
      setLoading(false);
    }
  }


  /* ==========================================================
     DERIVED VALUES
  ========================================================== */

  const canVerify =
    !loading &&
    Boolean(
      bank &&
      (
        file ||
        transactionRef.trim()
      )
    );


  const transactionTime =
    getTransactionTime(result);


  const transactionIsOld =
    isOlderThanOneHour(
      transactionTime,
      currentTime
    );


  const selectedAccount =
    paymentAccounts.find(
      (account) =>
        account.provider === bank
    );


  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <div className="app-atmosphere min-h-screen flex flex-col">

      <TopBar
        duptBalance={
          user?.duptBalance
        }
      />


      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-9 lg:px-8">

        {/* Email verification gate */}
        <UnverifiedNotice />

        {/* Admin announcements */}
        <AnnouncementBanner />


        {/* =====================================================
            LOW WALLET BALANCE
        ====================================================== */}

        {user?.lowBalanceThreshold !==
          undefined &&
          user.duptBalance <
          user.lowBalanceThreshold && (

            <div className="flex items-start gap-3 rounded-2xl border border-alarm/25 bg-alarm/10 px-4 py-3 text-sm font-medium text-alarm">
              <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
              <span>
                This business has {user.duptBalance} DU PT remaining. Let the owner know a top-up will be needed soon.
              </span>

            </div>
          )}

        <header className="max-w-2xl pt-2">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-sealDark dark:text-seal">
            Payment desk
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-4xl dark:text-white">
            Verify a payment with confidence.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink/55 dark:text-white/55">
            Add the details you have. A receipt image or transaction reference is enough to begin.
          </p>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-7">
          <aside className="hidden rounded-[24px] border border-black/[0.07] bg-[#15221d] p-6 text-white shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)] lg:sticky lg:top-24 lg:block">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-seal">A quick, safe check</p>
            <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">Three details. One clear answer.</h2>
            <ol className="mt-6 space-y-5">
              <li className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-seal"><ReceiptText size={16} aria-hidden="true" /></span>
                <span><strong className="block text-sm font-semibold">Choose the source</strong><span className="mt-0.5 block text-xs leading-5 text-white/55">Tap the logo shown on the receipt.</span></span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-seal"><ScanLine size={16} aria-hidden="true" /></span>
                <span><strong className="block text-sm font-semibold">Add the receipt</strong><span className="mt-0.5 block text-xs leading-5 text-white/55">Upload, photograph, or enter its reference.</span></span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-seal"><FileCheck2 size={16} aria-hidden="true" /></span>
                <span><strong className="block text-sm font-semibold">Review the answer</strong><span className="mt-0.5 block text-xs leading-5 text-white/55">Match the amount, names, and payment time.</span></span>
              </li>
            </ol>
            <div className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-white/45">
              Each completed check costs 1 DU PT. Unavailable-provider checks are refunded automatically.
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="workflow-card overflow-visible rounded-[28px]">


        {/* =====================================================
            REGISTERED PAYMENT PROVIDERS
         
            ONE BOX:
            - provider selector
            - payment account information
        ====================================================== */}

        <section className="workflow-step">

          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="field-label">01 / Payment source</span>
              <h2 className="mt-1.5 font-display text-lg font-semibold tracking-tight text-ink dark:text-white">Which logo is on the receipt?</h2>
            </div>
            {selectedAccount && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-seal/10 px-2.5 py-1 text-[11px] font-bold text-sealDark dark:text-seal">
                <Check size={13} aria-hidden="true" /> Selected
              </span>
            )}
          </div>


          <p className="mt-1.5 text-xs leading-5 text-ink/45 dark:text-white/45">
            Tap a logo to select it. Hold or hover to see the payment destination.
          </p>


          {/* =================================================
              LOADING
          ================================================== */}

          {accountsLoading && (

            <div className="mt-3 flex items-center gap-2 text-sm text-ink/40 dark:text-mist">

              <span className="w-4 h-4 rounded-full border-2 border-ink/20 border-t-ink animate-spin" />

              Loading payment providers...

            </div>

          )}


          {/* =================================================
              ERROR
          ================================================== */}

          {!accountsLoading &&
            accountsError && (

              <div className="mt-3 rounded-xl bg-alarm/10 border border-alarm/20 px-3 py-2 text-xs text-alarm">

                {accountsError}

              </div>

            )}


          {/* =================================================
              NO REGISTERED ACCOUNTS
          ================================================== */}

          {!accountsLoading &&
            !accountsError &&
            paymentAccounts.length === 0 && (

              <div className="mt-3 rounded-xl bg-ink/5 px-3 py-3 text-sm text-ink/50 dark:text-mist">

                No payment providers have been
                configured for this business yet.

              </div>

            )}


          {/* =================================================
              PROVIDER BUTTONS
          ================================================== */}

          {!accountsLoading &&
            paymentAccounts.length > 0 && (

              <div className="mt-4 flex flex-wrap gap-3" role="radiogroup" aria-label="Payment source">

                {paymentAccounts.map(
                  (account) => {

                    const isSelected =
                      bank ===
                      account.provider;

                    const isActive =
                      activeAccountId ===
                      account._id;

                    return (
                      <div
                        key={
                          account._id
                        }
                        className="relative"
                        onMouseEnter={() =>
                          setActiveAccountId(
                            account._id
                          )
                        }
                        onMouseLeave={() =>
                          setActiveAccountId(
                            (id) =>
                              id ===
                                account._id
                                ? null
                                : id
                          )
                        }
                        onTouchStart={() =>
                          startLongPress(
                            account._id
                          )
                        }
                        onTouchEnd={
                          cancelLongPress
                        }
                        onTouchCancel={
                          cancelLongPress
                        }
                      >

                        {/* =================================
                            PROVIDER BUTTON

                            ALSO SELECTS BANK
                        ================================== */}

                        <button
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={providerLabel(account.provider)}
                          title={providerLabel(account.provider)}
                          onClick={() =>
                            selectProvider(
                              account.provider
                            )
                          }
                          className={`relative flex h-[68px] w-[68px] items-center justify-center rounded-2xl border transition duration-200 ${isSelected
                            ? "border-seal bg-seal/10 shadow-[0_10px_24px_-16px_rgba(18,167,131,0.9)] ring-2 ring-seal/20"
                            : "border-black/10 bg-[#f7f8f4] text-ink/70 hover:-translate-y-0.5 hover:border-seal/50 hover:bg-white dark:border-white/10 dark:bg-white/5"
                            }`}
                        >
                          <ProviderBadge
                            provider={account.provider}
                            showLabel={false}
                            plain
                            iconSize="h-11 w-11"
                          />
                          {isSelected && (
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-seal text-white dark:border-[#17211d]">
                              <Check size={11} strokeWidth={3} aria-hidden="true" />
                            </span>
                          )}

                        </button>


                        {/* =================================
                            PAYMENT ACCOUNT POPUP
                        ================================== */}

                        {isActive && (

                          <div
                            className="absolute left-0 top-full z-30 mt-2 w-60 rounded-2xl border border-white/10 bg-[#13201b] p-4 text-paper shadow-2xl"
                            onMouseEnter={() =>
                              setActiveAccountId(
                                account._id
                              )
                            }
                          >

                            <ProviderBadge
                              provider={account.provider}
                              showLabel={false}
                              plain
                              iconSize="h-9 w-9"
                            />

                            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-seal">Payment destination</p>


                            <p className="font-mono text-sm mt-1 break-all">

                              {account.accountNumber ||
                                "Account number unavailable"}

                            </p>


                            {account.accountHolderName && (

                              <p className="text-xs text-mist mt-0.5">

                                {
                                  account.accountHolderName
                                }

                              </p>

                            )}


                            {account.accountNumber && (

                              <button
                                type="button"
                                onClick={() =>
                                  copyAccount(
                                    account._id,
                                    account.accountNumber
                                  )
                                }
                                className="mt-2 text-xs bg-seal text-ink dark:text-paper font-semibold rounded-lg px-2.5 py-1"
                              >
                                Copy account
                              </button>

                            )}

                          </div>

                        )}

                      </div>
                    );
                  }
                )}

              </div>

            )}


          {/* =================================================
              SELECTED PROVIDER INDICATOR
          ================================================== */}

        </section>


        {/* =====================================================
            CBE QR INFO
        ====================================================== */}

        {bank === "CBE" && (

          <section className="workflow-step bg-seal/[0.06]">

            {cbeQrDetected ? (

              <div className="rounded-xl border border-seal/25 bg-white p-3 dark:bg-black/20">

                <p className="text-xs font-semibold text-seal uppercase tracking-wide">

                  CBE receipt QR detected

                </p>


                <p className="text-xs text-ink/60 dark:text-mist mt-1 break-all font-mono">

                  {cbeQrValue}

                </p>

              </div>

            ) : (

              <p className="flex items-start gap-2 text-xs leading-5 text-ink/55 dark:text-white/55">

                <ScanLine className="mt-0.5 shrink-0 text-seal" size={16} aria-hidden="true" />

                <span>CBE receipt QR codes are detected automatically when you upload a receipt image.</span>

              </p>

            )}

          </section>

        )}


        {/* =====================================================
            CBE BIRR PHONE
        ====================================================== */}

        {bank === "CBEBirr" && (

          <section className="workflow-step">

            <label className="field-label">

              Payer phone number

            </label>


            <input
              type="tel"
              value={payerPhone}
              onChange={(e) =>
                setPayerPhone(
                  e.target.value
                )
              }
              placeholder="09XXXXXXXX"
              className="field-control mt-2"
            />


            <p className="text-xs text-ink/40 dark:text-mist mt-1">

              CBE Birr needs the
              payer's phone number
              to look up the receipt.

            </p>

          </section>

        )}


        {/* =====================================================
            EXPECTED AMOUNT
        ====================================================== */}

        <section className="workflow-step">

          <span className="field-label">02 / Amount</span>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="expected-amount" className="font-display text-lg font-semibold tracking-tight text-ink dark:text-white">Expected amount</label>
            <span className="text-xs text-ink/40 dark:text-white/40">Optional</span>
          </div>


          <input
            id="expected-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) =>
              setAmount(
                e.target.value
              )
            }
            placeholder="0.00"
            className="field-control mt-3 font-display text-xl font-semibold tabular-nums"
          />

        </section>


        {/* =====================================================
            RECEIPT / CAMERA
        ====================================================== */}

        <section className="workflow-step">

          <span className="field-label">03 / Receipt</span>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink dark:text-white">Add the payment receipt</h2>
            <span className="text-xs text-ink/40 dark:text-white/40">Photo or screenshot</span>
          </div>


          <button
            type="button"
            onClick={() =>
              fileInput.current?.click()
            }
            className="group mt-3 flex min-h-40 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-black/20 bg-[#f7f8f4] px-4 py-7 text-ink/55 transition hover:border-seal hover:bg-seal/[0.04] hover:text-sealDark dark:border-white/15 dark:bg-black/20 dark:text-white/55"
          >

            {preview ? (

              <img
                src={preview}
                alt="Receipt preview"
                className="max-h-56 rounded-xl object-contain shadow-sm"
              />

            ) : (

              <>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sealDark shadow-sm transition-transform group-hover:-translate-y-0.5 dark:bg-white/10 dark:text-seal">
                  <UploadCloud size={20} aria-hidden="true" />
                </span>

                <span className="font-semibold text-ink dark:text-white">
                  Tap to upload a receipt
                </span>
                <span className="text-xs text-ink/40 dark:text-white/40">Keep all four corners visible</span>
              </>

            )}

          </button>


          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickFile}
            className="hidden"
          />


          <div className="mt-3">

            <CameraCapture
              onCapture={handleFile}
            />

          </div>

        </section>


        {/* =====================================================
            TRANSACTION REFERENCE
        ====================================================== */}

        <section className="workflow-step">

          <label className="field-label">

            {bank === "CBE" &&
              cbeQrDetected
              ? "CBE receipt link"
              : "Transaction reference"}

          </label>


          <input
            type="text"
            value={transactionRef}
            onChange={(e) => {

              setTransactionRef(
                e.target.value
              );

              /*
               * Manual editing means this is
               * no longer an untouched QR result.
               */
              setCbeQrDetected(false);
              setCbeQrValue("");

              setResult(null);
              setError("");

            }}
            placeholder={
              bank === "CBE"
                ? "CBE receipt URL or reference"
                : "Enter reference number manually"
            }
            autoComplete="off"
            spellCheck="false"
            className="field-control mt-2 font-mono text-sm tracking-wide"
          />


          <p className="text-xs text-ink/40 dark:text-mist mt-1">

            {bank === "CBE"
              ? "You can paste a CBE receipt link or use the QR code from the receipt."
              : "If the camera or OCR cannot read the receipt, enter the transaction reference manually."}

          </p>


          {transactionRef.trim() && (

            <button
              type="button"
              onClick={() => {

                setTransactionRef("");

                setCbeQrDetected(
                  false
                );

                setCbeQrValue("");

              }}
              className="text-xs text-alarm/70 hover:text-alarm mt-2"
            >
              Clear reference
            </button>

          )}

        </section>


        {/* =====================================================
            VERIFY BUTTON
        ====================================================== */}

        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <button
            type="button"
            onClick={handleVerify}
            disabled={!canVerify}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#15221d] px-4 py-3.5 font-semibold text-white shadow-[0_14px_28px_-18px_rgba(16,34,27,0.9)] transition hover:bg-[#0d1914] disabled:cursor-not-allowed disabled:opacity-35 dark:bg-seal dark:text-[#10201a] dark:hover:bg-seal/90"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-ink/30 dark:border-t-ink" />
                Checking payment…
              </>
            ) : (
              <>
                Verify transaction <span className="text-white/45 dark:text-ink/50">· 1 DU PT</span>
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" size={17} aria-hidden="true" />
              </>
            )}
          </button>
          <p className="mt-2.5 text-center text-[11px] text-ink/40 dark:text-white/40">The receipt is checked against the payment network, not the screenshot alone.</p>
        </div>

            </div>


        {/* =====================================================
            ERROR
        ====================================================== */}

        {error && (

          <div className="flex items-start gap-3 rounded-2xl border border-ink/20 bg-ink p-4 text-sm text-white shadow-sm dark:border-white/15 dark:bg-black">

            <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />

            {error}

          </div>

        )}


        {/* =====================================================
            RESULT
        ====================================================== */}

        {result && (

          <section className={`workflow-card flex items-start gap-4 rounded-[24px] p-5 sm:p-6 ${RESULT_TONE[result.status] || RESULT_TONE.SITE_ERROR}`}>

            <Seal
              state={
                SEAL_STATE[
                result.status
                ] ||
                "pending"
              }
              size={64}
            />


            <div className="flex-1">

              {/* RESULT MESSAGE */}

              <p className="text-sm text-ink/60 dark:text-mist">

                {resultMessage(result)}

              </p>

              {result.providerLink && (
                <a
                  href={result.providerLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-medium text-sealDark underline break-all"
                >
                  Open CBE receipt link
                </a>
              )}

              {/* VALID TRANSACTION */}

              {result.status === "VALID" &&
                result.log && (

                  <>

                    <dl className="mt-3 text-sm space-y-1">

                      {/* Amount — only when no expected amount was entered */}

                      {!amount && (
                        <div className="flex justify-between gap-4">

                          <dt className="text-ink/40 dark:text-mist">
                            Amount
                          </dt>

                          <dd className="font-medium">

                            {result.log.amount ?? "—"} ETB

                          </dd>

                        </div>
                      )}


                      {/* Paid at — always shown */}

                      <div className="flex justify-between gap-4">

                        <dt className="text-ink/40 dark:text-mist">
                          Paid at
                        </dt>

                        <dd
                          className={`font-medium text-right ${transactionIsOld
                              ? "text-alarm"
                              : "text-ink dark:text-paper"
                            }`}
                          title={formatExactTime(transactionTime)}
                        >

                          {formatRelativeTime(
                            transactionTime,
                            currentTime
                          )}

                        </dd>

                      </div>

                    </dl>


                    {/* OLD TRANSACTION WARNING */}

                    {transactionIsOld && (

                      <p className="text-xs text-alarm/80 mt-2">

                        ⚠ This transaction was
                        completed more than
                        one hour ago. Check the
                        payment details carefully
                        before accepting it.

                      </p>

                    )}


                    {/* NORMAL TRUST MESSAGE */}

                    {!transactionIsOld && (

                      <p className="text-xs text-ink/40 dark:text-mist mt-2">

                        Confirmed by the bank,
                        not just the screenshot
                        — check the time and
                        names against what the
                        customer told you before
                        accepting.

                      </p>

                    )}

                  </>

                )}
            </div>

          </section>

        )}

          </div>
        </div>

      </main>


      <Footer />

    </div>
  );
}

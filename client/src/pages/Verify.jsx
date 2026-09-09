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
import InstallStaffApp from "../components/InstallStaffApp.jsx";


/* ============================================================
   PROVIDER LABELS
============================================================ */

const BANK_LABELS = {
  CBEBirr: "CBE Birr",
};

const VERIFICATION_PROVIDERS = [
  "CBE",
  "Telebirr",
  "Awash",
  "Dashen",
  "Abyssinia",
  "CBEBirr",
  "MPesa",
];


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
    "CBE USSD results are not accepted. Use a mobile-banking receipt with a QR code or paste its complete receipt link.",

  CBE_LINK_REQUIRED:
    "CBE needs the complete mobile-banking receipt link. Scan the QR code or paste the link manually.",

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
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" &&
      url.hostname.toLowerCase() === "mbreciept.cbe.com.et" &&
      /^\/[A-Za-z0-9][A-Za-z0-9-]{5,100}$/.test(url.pathname);
  } catch {
    return false;
  }
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

  const [
    inspectedProvider,
    setInspectedProvider,
  ] = useState("");

  /*
   * Provider selected for verification.
   */
  const [
    bank,
    setBank,
  ] = useState("");

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

  const providerPressTimer =
    useRef(null);

  const providerRevealTimer =
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
            "/payment-accounts",
            {
              params: {
                forVerification: true,
              },
            }
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
            ? data.accounts.filter(
                (account) =>
                  account?.enabled !== false &&
                  VERIFICATION_PROVIDERS.includes(
                    account?.provider
                  )
              )
            : [];

        const configuredProviders =
          VERIFICATION_PROVIDERS.filter(
            (provider) =>
              accounts.some(
                (account) =>
                  account.provider === provider
              )
          );

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
        if (configuredProviders.length > 0) {
          setBank((current) =>
            configuredProviders.includes(current)
              ? current
              : configuredProviders[0]
          );
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

  useEffect(() => () => {
    clearTimeout(providerPressTimer.current);
    clearTimeout(providerRevealTimer.current);
  }, []);

  const configuredProviders =
    VERIFICATION_PROVIDERS.filter(
      (provider) =>
        paymentAccounts.some(
          (account) =>
            account.provider === provider
        )
    );


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

    if (!String(file.type || "").startsWith("image/")) {
      setError("Choose an image from your camera, gallery, or computer.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError("The receipt image is larger than 8 MB. Choose a smaller image and try again.");
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

    e.target.value = "";

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

  function revealProviderAccounts(
    provider,
    temporary = false
  ) {
    clearTimeout(providerRevealTimer.current);
    setInspectedProvider(provider);

    if (temporary) {
      providerRevealTimer.current = setTimeout(
        () => setInspectedProvider(""),
        3500
      );
    }
  }

  function startProviderLongPress(provider, pointerType) {
    if (pointerType === "mouse") {
      return;
    }

    clearTimeout(providerPressTimer.current);
    providerPressTimer.current = setTimeout(
      () => revealProviderAccounts(provider, true),
      450
    );
  }

  function cancelProviderLongPress() {
    clearTimeout(providerPressTimer.current);
  }


  /* ==========================================================
     VERIFY
  ========================================================== */

  async function handleVerify() {
    if (!bank) {
      setError(
        "Please select the provider shown on the receipt."
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

  const inspectedAccounts =
    inspectedProvider
      ? paymentAccounts.filter(
          (account) =>
            account.provider === inspectedProvider
        )
      : [];


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


      <main className="mx-auto w-full max-w-4xl flex-1 space-y-3 px-3 py-3 sm:px-6 sm:py-5">

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

        <header className="flex items-center justify-between gap-3 py-1">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.04em] text-ink sm:text-3xl dark:text-white">
            Verify payment
          </h1>
          {user?.role === "staff" && <InstallStaffApp />}
        </header>

        <div className="mx-auto w-full max-w-3xl">

          <div className="min-w-0 space-y-3">
            <div className="workflow-card compact-verify-card overflow-visible rounded-[24px]">


        {/* =====================================================
            REGISTERED PAYMENT PROVIDERS
         
            ONE BOX:
            - provider selector
            - receipt provider
            - receiving accounts
        ====================================================== */}

        <section className="workflow-step">

          <span className="field-label">01 / Provider</span>


          {/* =================================================
              LOADING
          ================================================== */}

          {accountsLoading && (

            <div className="mt-3 flex items-center gap-2 text-sm text-ink/40 dark:text-mist">

              <span className="w-4 h-4 rounded-full border-2 border-ink/20 border-t-ink animate-spin" />

              Loading receiving accounts...

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

                No receiving accounts have been configured for this business yet.

              </div>

            )}


          {/* =================================================
              PROVIDER BUTTONS
          ================================================== */}

          {!accountsLoading &&
            paymentAccounts.length > 0 && (

              <div className="mt-2 rounded-2xl border border-black/[0.08] bg-[#f7f8f4] p-2 dark:border-white/10 dark:bg-black/20">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Receipt source">
                  {configuredProviders.map((provider) => {
                    const isSelected = bank === provider;

                    return (
                      <button
                        key={provider}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={providerLabel(provider)}
                        title={providerLabel(provider)}
                        onClick={() => selectProvider(provider)}
                        onMouseEnter={() => revealProviderAccounts(provider)}
                        onMouseLeave={() => setInspectedProvider("")}
                        onFocus={() => revealProviderAccounts(provider)}
                        onBlur={() => setInspectedProvider("")}
                        onPointerDown={(event) => startProviderLongPress(provider, event.pointerType)}
                        onPointerUp={cancelProviderLongPress}
                        onPointerCancel={cancelProviderLongPress}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          revealProviderAccounts(provider, true);
                        }}
                        className={`relative flex h-[58px] min-w-[76px] flex-1 basis-[76px] touch-manipulation items-center justify-center rounded-xl border transition duration-200 sm:max-w-[92px] ${isSelected
                          ? "border-seal bg-seal/10 shadow-[0_10px_24px_-16px_rgba(18,167,131,0.9)] ring-2 ring-seal/20"
                          : "border-black/10 bg-white text-ink/70 hover:-translate-y-0.5 hover:border-seal/50 dark:border-white/10 dark:bg-white/5"
                        }`}
                      >
                        <ProviderBadge provider={provider} showLabel={false} plain iconSize="h-9 w-[62px]" />
                        {isSelected && (
                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-seal text-white">
                            <Check size={9} strokeWidth={3} aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {inspectedAccounts.length > 0 && (
                  <div className="mt-2 grid gap-1 border-t border-black/[0.07] px-2 pt-2 dark:border-white/10" aria-live="polite">
                    {inspectedAccounts.map((account) => (
                      <div key={account._id} className="flex min-w-0 items-center justify-between gap-3">
                        <span className="truncate font-mono text-xs font-semibold text-ink dark:text-paper">{account.accountNumber}</span>
                        <span className="truncate text-right text-xs text-ink/50 dark:text-mist">{account.accountHolderName}</span>
                      </div>
                    ))}
                  </div>
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

              <p className="flex items-start gap-2 text-xs leading-4 text-ink/55 dark:text-white/55">

                <ScanLine className="mt-0.5 shrink-0 text-seal" size={16} aria-hidden="true" />

                <span>CBE requires the mobile-banking receipt QR. USSD screenshots and old references are not accepted.</span>

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


          </section>

        )}


        {/* =====================================================
            EXPECTED AMOUNT
        ====================================================== */}

        <section className="workflow-step">

          <span className="field-label">02 / Details</span>
          <div className="mt-2 grid grid-cols-[minmax(92px,0.7fr)_minmax(0,1.6fr)] gap-2">
            <label className="min-w-0">
              <span className="block truncate text-xs text-ink/50 dark:text-white/50">Amount (optional)</span>
              <input
                id="expected-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="field-control mt-1 px-3 py-2.5 font-display font-semibold tabular-nums"
              />
            </label>

            <label className="min-w-0">
              <span className="block truncate text-xs text-ink/50 dark:text-white/50">
                {bank === "CBE" && cbeQrDetected ? "CBE receipt link" : "Transaction reference"}
              </span>
              <input
                type="text"
                value={transactionRef}
                onChange={(e) => {
                  setTransactionRef(e.target.value);
                  setCbeQrDetected(false);
                  setCbeQrValue("");
                  setResult(null);
                  setError("");
                }}
                placeholder={bank === "CBE" ? "Full receipt link" : "Reference number"}
                autoComplete="off"
                spellCheck="false"
                className="field-control mt-1 px-3 py-2.5 font-mono text-sm tracking-wide"
              />
            </label>
          </div>

        </section>


        {/* =====================================================
            RECEIPT / CAMERA
        ====================================================== */}

        <section className="workflow-step">

          <span className="field-label">03 / Receipt</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="group flex min-h-[46px] items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-black/20 bg-[#f7f8f4] px-3 py-2 text-sm font-semibold text-ink transition hover:border-seal hover:bg-seal/[0.04] dark:border-white/15 dark:bg-black/20 dark:text-white"
            >
              {preview ? (
                <>
                  <img src={preview} alt="Receipt preview" className="h-8 w-8 rounded-lg object-cover" />
                  <span>Change receipt</span>
                </>
              ) : (
                <>
                  <UploadCloud className="text-seal" size={17} aria-hidden="true" />
                  <span>Add from device</span>
                </>
              )}
            </button>


          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={onPickFile}
            className="hidden"
            aria-label="Add a receipt image from this device"
          />


            <CameraCapture
              onCapture={handleFile}
            />
          </div>

        </section>


        {/* =====================================================
            VERIFY BUTTON
        ====================================================== */}

        <div className="px-4 py-3 sm:px-5 sm:py-4">
          <button
            type="button"
            onClick={handleVerify}
            disabled={!canVerify}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#15221d] px-4 py-3 font-semibold text-white shadow-[0_14px_28px_-18px_rgba(16,34,27,0.9)] transition hover:bg-[#0d1914] disabled:cursor-not-allowed disabled:opacity-35 dark:bg-seal dark:text-[#10201a] dark:hover:bg-seal/90"
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

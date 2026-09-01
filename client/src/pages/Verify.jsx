import {
  useEffect,
  useRef,
  useState,
} from "react";

import jsQR from "jsqr";

import api from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import TopBar from "../components/TopBar.jsx";
import Footer from "../components/Footer.jsx";
import Seal from "../components/Seal.jsx";
import CameraCapture from "../components/CameraCapture.jsx";


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
  OCR_FAILED: "error",
  PROVIDER_ERROR: "error",
  INVALID_FORMAT: "error",
};


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
    "Unable to verify this payment. Please contact the administrator.",

  OCR_FAILED:
    "Could not read this receipt.",

  PROVIDER_ERROR:
    "The provider couldn't confirm this transaction.",

  INVALID_FORMAT:
    "This doesn't look like a valid receipt for the selected bank.",
};


const OCR_FAILURE_COPY = {
  NOT_TRANSACTION:
    "This does not look like a payment receipt or USSD confirmation.",

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
      const detail =
        err.response?.data
          ?.detail;

      const message =
        err.response?.data
          ?.error ||
        err.message ||
        "Verification failed";


      console.error(
        "[verify] client error:",
        message,
        detail || ""
      );


      setError(
        detail
          ? `${message}: ${detail}`
          : message
      );

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
    <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">

      <TopBar
        duptBalance={
          user?.duptBalance
        }
      />


      <main className="flex-1 w-full max-w-md mx-auto p-4 sm:p-6 space-y-4">


        {/* =====================================================
            LOW WALLET BALANCE
        ====================================================== */}

        {user?.lowBalanceThreshold !==
          undefined &&
          user.duptBalance <
          user.lowBalanceThreshold && (

            <div className="bg-alarm/10 border border-alarm/30 text-alarm rounded-2xl px-4 py-2.5 text-sm font-medium">

              ⚠️ This business's DU PT
              balance is low (
              {user.duptBalance}{" "}
              DU PT). Let the owner know
              it needs a top-up soon.

            </div>
          )}


        {/* =====================================================
            REGISTERED PAYMENT PROVIDERS
         
            ONE BOX:
            - provider selector
            - payment account information
        ====================================================== */}

        <section className="bg-white rounded-2xl shadow-sm border border-black/5 dark:border-line p-4">

          <label className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">
            Payment provider
          </label>


          <p className="text-xs text-ink/40 dark:text-mist mt-1">
            Select a provider to verify. Hover
            or long-press to show the customer
            where to pay.
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

              <div className="flex flex-wrap gap-2 mt-3">

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
                          onClick={() =>
                            selectProvider(
                              account.provider
                            )
                          }
                          className={`px-3 py-1.5 rounded-full border text-sm font-medium transition ${isSelected
                            ? "bg-ink text-paper border-ink"
                            : "bg-white text-ink/70 border-black/10 dark:border-line hover:border-ink/30"
                            }`}
                        >

                          {providerLabel(
                            account.provider
                          )}

                        </button>


                        {/* =================================
                            PAYMENT ACCOUNT POPUP
                        ================================== */}

                        {isActive && (

                          <div
                            className="absolute z-30 top-full left-0 mt-2 bg-ink text-paper rounded-xl p-3 shadow-xl w-56"
                            onMouseEnter={() =>
                              setActiveAccountId(
                                account._id
                              )
                            }
                          >

                            <p className="text-xs text-mist uppercase tracking-wide">

                              {providerLabel(
                                account.provider
                              )}

                            </p>


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

          {selectedAccount && (

            <p className="text-xs text-seal mt-3 font-medium">

              ✓ Verifying with{" "}
              {providerLabel(
                selectedAccount.provider
              )}

            </p>

          )}

        </section>


        {/* =====================================================
            CBE QR INFO
        ====================================================== */}

        {bank === "CBE" && (

          <section className="bg-seal/10 border border-seal/30 rounded-2xl p-4">

            {cbeQrDetected ? (

              <div className="rounded-xl bg-white border border-seal/30 p-3">

                <p className="text-xs font-semibold text-seal uppercase tracking-wide">

                  CBE receipt QR detected

                </p>


                <p className="text-xs text-ink/60 dark:text-mist mt-1 break-all font-mono">

                  {cbeQrValue}

                </p>

              </div>

            ) : (

              <p className="text-xs text-ink/60 dark:text-mist">

                CBE receipt QR codes are detected
                automatically when you upload a
                receipt image.

              </p>

            )}

          </section>

        )}


        {/* =====================================================
            CBE BIRR PHONE
        ====================================================== */}

        {bank === "CBEBirr" && (

          <section className="bg-white rounded-2xl shadow-sm border border-black/5 dark:border-line p-4">

            <label className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">

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
              className="w-full mt-2 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm"
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

        <section className="bg-white rounded-2xl shadow-sm border border-black/5 dark:border-line p-4">

          <label className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">

            Expected amount (ETB)

          </label>


          <input
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
            className="w-full mt-2 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-lg font-display"
          />

        </section>


        {/* =====================================================
            RECEIPT / CAMERA
        ====================================================== */}

        <section className="bg-white rounded-2xl shadow-sm border border-black/5 dark:border-line p-4">

          <label className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">

            Receipt / USSD screenshot

          </label>


          <button
            type="button"
            onClick={() =>
              fileInput.current?.click()
            }
            className="mt-2 w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-black/15 rounded-xl py-8 text-ink/60 dark:text-mist hover:border-seal hover:text-seal transition overflow-hidden"
          >

            {preview ? (

              <img
                src={preview}
                alt="Receipt preview"
                className="max-h-40 rounded-lg"
              />

            ) : (

              <>
                <span className="text-2xl">
                  📷
                </span>

                <span className="text-sm">
                  Tap to snap or upload
                </span>
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

        <section className="bg-white rounded-2xl shadow-sm border border-black/5 dark:border-line p-4">

          <label className="text-xs font-semibold tracking-wide text-ink/50 dark:text-mist uppercase">

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
            className="w-full mt-2 border border-black/10 dark:border-line rounded-lg px-3 py-2 text-sm font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-seal/40"
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

        <button
          type="button"
          onClick={handleVerify}
          disabled={!canVerify}
          className="w-full bg-seal text-ink dark:text-paper font-semibold rounded-xl py-3.5 disabled:opacity-40 transition"
        >

          {loading
            ? "Checking with the provider…"
            : "Verify transaction · 1 DU PT"}

        </button>


        {/* =====================================================
            ERROR
        ====================================================== */}

        {error && (

          <div className="bg-white rounded-2xl border border-alarm/30 p-4 text-alarm text-sm">

            {error}

          </div>

        )}


        {/* =====================================================
            RESULT
        ====================================================== */}

        {result && (

          <section className="bg-white rounded-2xl shadow-sm border border-black/5 dark:border-line p-5 flex gap-4 items-start">

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

                {result.userMessage ||

                  (result.status ===
                    "OCR_FAILED"

                    ? OCR_FAILURE_COPY[
                    result.failureReason
                    ] ||
                    RESULT_COPY.OCR_FAILED

                    : RESULT_COPY[
                    result.status
                    ])}

              </p>


              {/* CBE QR CONFIRMATION */}

              {bank === "CBE" &&
                cbeQrDetected &&
                result.status ===
                "VALID" && (

                  <p className="text-xs text-seal mt-2 font-medium">

                    ✓ Verified using the CBE
                    receipt QR link.

                  </p>

                )}


              {/* OCR CONFIDENCE */}

              {result.confidence &&
                result.status !==
                "OCR_FAILED" && (

                  <p className="text-xs text-ink/40 dark:text-mist mt-1 capitalize">

                    OCR confidence:{" "}
                    {result.confidence.replace(
                      "_",
                      " "
                    )}

                    {result.imageQuality
                      ? ` · ${result.imageQuality.replace(
                        /_/g,
                        " "
                      )}`
                      : ""}

                  </p>

                )}


              {/* PROVIDER ERROR */}

              {result.status ===
                "PROVIDER_ERROR" &&
                result.providerErrorDetail && (

                  <p className="text-xs text-alarm/70 mt-1">

                    Provider detail:{" "}
                    {
                      result.providerErrorDetail
                    }

                  </p>

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

      </main>


      <Footer />

    </div>
  );
}
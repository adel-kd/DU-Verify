const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");

const User = require("../models/User");
const Verification = require("../models/Verification");
const Topup = require("../models/Topup");
const Package = require("../models/Package");
const BillingLedger = require("../models/BillingLedger");
const PlatformSettings = require("../models/PlatformSettings");

const { requireAuth } = require("../middleware/auth");
const { requireOwner } = require("../middleware/roleCheck");

const router = express.Router();

const CHAPA_BASE = "https://api.chapa.co/v1";

const DEFAULT_ETB_PER_CUSTOM_DUPT = 2;

/* ================================================================
   HELPERS
================================================================ */

function sanitizeChapaDescription(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

function stringifyChapaError(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message || String(value);
  }

  if (typeof value === "object") {
    try {
      return Object.entries(value)
        .flatMap(([field, messages]) => {
          const list = Array.isArray(messages)
            ? messages
            : [messages];

          return list.map((message) => {
            if (typeof message === "string") {
              return `${field}: ${message}`;
            }

            try {
              return `${field}: ${JSON.stringify(message)}`;
            } catch {
              return `${field}: ${String(message)}`;
            }
          });
        })
        .join(" | ");
    } catch {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
  }

  return String(value);
}

function safeFailureReason(
  value,
  fallback = "Unknown error"
) {
  const message = stringifyChapaError(value);

  return (message || fallback).slice(0, 1000);
}

function safeSignatureEquals(received, expected) {
  if (!received || !expected) {
    return false;
  }

  try {
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");

    return (
      a.length === b.length &&
      crypto.timingSafeEqual(a, b)
    );
  } catch {
    return false;
  }
}

/* ================================================================
   BALANCE
================================================================ */

// GET /api/billing/balance
router.get(
  "/balance",
  requireAuth,
  requireOwner,
  async (req, res) => {
    try {
      const [totalChecks, validChecks] =
        await Promise.all([
          Verification.countDocuments({
            businessId: req.user._id,
          }),

          Verification.countDocuments({
            businessId: req.user._id,
            status: "VALID",
          }),
        ]);

      const freshUser = await User.findById(
        req.user._id
      ).select(
        "duptBalance lowBalanceThreshold"
      );

      if (!freshUser) {
        return res.status(404).json({
          error: "Business user not found",
        });
      }

      res.json({
        duptBalance:
          freshUser.duptBalance,

        walletBalance:
          freshUser.duptBalance,

        totalChecks,

        validChecks,

        lowBalance:
          freshUser.duptBalance <
          freshUser.lowBalanceThreshold,

        lowBalanceThreshold:
          freshUser.lowBalanceThreshold,
      });
    } catch (err) {
      console.error(
        "[billing] /balance error:",
        err
      );

      res.status(500).json({
        error:
          "Could not load billing balance",
      });
    }
  }
);

/* ================================================================
   RATE
================================================================ */

// GET /api/billing/rate
router.get(
  "/rate",
  requireAuth,
  requireOwner,
  async (req, res) => {
    try {
      const settings =
        await PlatformSettings.getOrCreate();

      res.json({
        etbPerDupt:
          settings.customDuptRateEtb,

        customTopupEnabled:
          settings.featureFlags
            .customTopupEnabled,
      });
    } catch (err) {
      console.error(
        "[billing] /rate error:",
        err
      );

      res.status(500).json({
        error:
          "Could not load billing rate",
      });
    }
  }
);

/* ================================================================
   PACKAGES
================================================================ */

// GET /api/billing/packages
router.get(
  "/packages",
  requireAuth,
  requireOwner,
  async (req, res) => {
    try {
      const settings =
        await PlatformSettings.getOrCreate();

      if (
        !settings.featureFlags
          .packagePurchaseEnabled
      ) {
        return res.json({
          packages: [],
        });
      }

      const packages =
        await Package.find({
          active: true,
        }).sort({
          sortOrder: 1,
        });

      res.json({
        packages,
      });
    } catch (err) {
      console.error(
        "[billing] /packages error:",
        err
      );

      res.status(500).json({
        error:
          "Could not load packages",
      });
    }
  }
);

/* ================================================================
   INITIALIZE CHAPA TOPUP
================================================================ */

// POST /api/billing/topup
router.post(
  "/topup",
  requireAuth,
  requireOwner,
  async (req, res) => {
    try {
      const {
        mode,
        amount,
        packageId,
        email,
        first_name,
        last_name,
        phone_number,
      } = req.body;

      const settings =
        await PlatformSettings.getOrCreate();

      let purchaseType;
      let etbAmount;
      let duptAmount;
      let resolvedPackageId = null;
      let description;

      /* ------------------------------------------------------------
         PACKAGE PURCHASE
      ------------------------------------------------------------- */

      if (mode === "package") {
        if (
          !settings.featureFlags
            .packagePurchaseEnabled
        ) {
          return res.status(403).json({
            error:
              "Package purchases are currently disabled",
          });
        }

        if (!packageId) {
          return res.status(400).json({
            error:
              "packageId is required",
          });
        }

        const pkg =
          await Package.findOne({
            _id: packageId,
            active: true,
          });

        if (!pkg) {
          return res.status(400).json({
            error:
              "Package not found or unavailable",
          });
        }

        /*
         * This value belongs to the Topup model.
         *
         * Topup enum:
         * PACKAGE_PURCHASE
         */
        purchaseType =
          "PACKAGE_PURCHASE";

        etbAmount =
          Number(pkg.priceETB);

        duptAmount =
          Number(pkg.duptAmount);

        resolvedPackageId =
          pkg._id;

        if (
          !Number.isFinite(etbAmount) ||
          etbAmount <= 0
        ) {
          return res.status(400).json({
            error:
              "Invalid package ETB price",
          });
        }

        if (
          !Number.isFinite(duptAmount) ||
          duptAmount <= 0
        ) {
          return res.status(400).json({
            error:
              "Invalid package DU PT amount",
          });
        }

        description =
          sanitizeChapaDescription(
            `${pkg.name} package ${pkg.duptAmount} DU PT`
          );
      }

      /* ------------------------------------------------------------
         CUSTOM TOPUP
      ------------------------------------------------------------- */

      else if (mode === "custom") {
        if (
          !settings.featureFlags
            .customTopupEnabled
        ) {
          return res.status(403).json({
            error:
              "Custom top-up is currently disabled",
          });
        }

        const numericAmount =
          Number(amount);

        if (
          !Number.isFinite(
            numericAmount
          ) ||
          numericAmount <= 0
        ) {
          return res.status(400).json({
            error:
              "amount must be a positive number",
          });
        }

        const etbPerDupt =
          Number(
            settings.customDuptRateEtb
          ) ||
          DEFAULT_ETB_PER_CUSTOM_DUPT;

        /*
         * IMPORTANT:
         *
         * Topup model uses CUSTOM_TOPUP.
         *
         * BillingLedger uses TOPUP.
         *
         * We convert CUSTOM_TOPUP -> TOPUP
         * when creating the ledger later.
         */
        purchaseType =
          "CUSTOM_TOPUP";

        etbAmount =
          numericAmount;

        duptAmount =
          Math.floor(
            numericAmount /
            etbPerDupt
          );

        if (duptAmount < 1) {
          return res.status(400).json({
            error:
              `Minimum top-up is ETB ${etbPerDupt}`,
          });
        }

        description =
          sanitizeChapaDescription(
            `Custom top-up ${duptAmount} DU PT`
          );
      }

      /* ------------------------------------------------------------
         INVALID MODE
      ------------------------------------------------------------- */

      else {
        return res.status(400).json({
          error:
            "mode must be 'custom' or 'package'",
        });
      }

      /* ------------------------------------------------------------
         TX REF
      ------------------------------------------------------------- */

      const txRef =
        `du-${req.user._id}-${Date.now()}`;

      console.log(
        `[chapa] initializing tx_ref=${txRef} amount=${etbAmount} dupt=${duptAmount} purchaseType=${purchaseType}`
      );

      console.log(
        `[chapa] callback_url=${process.env.BASE_URL}/api/billing/verify-chapa/${txRef}`
      );

      /* ------------------------------------------------------------
         CREATE PENDING TOPUP
      ------------------------------------------------------------- */

      await Topup.create({
        businessId:
          req.user._id,

        txRef,

        purchaseType,

        packageId:
          resolvedPackageId,

        amount:
          etbAmount,

        duptAmount,

        status:
          "pending",
      });

      /* ------------------------------------------------------------
         CHAPA INITIALIZE
      ------------------------------------------------------------- */

      const chapaPayload = {
        amount:
          etbAmount,

        currency:
          "ETB",

        email:
          email ||
          req.user.email,

        first_name:
          first_name ||
          req.user.ownerName ||
          "Business",

        last_name:
          last_name ||
          "Business",

        ...(phone_number
          ? {
            phone_number,
          }
          : {}),

        tx_ref:
          txRef,

        callback_url:
          `${process.env.BASE_URL}/api/billing/verify-chapa/${txRef}`,

        return_url:
          `${process.env.FRONTEND_URL}/dashboard?topup=pending&tx_ref=${encodeURIComponent(
            txRef
          )}`,

        customization: {
          title:
            "DU Verifay",

          description,
        },
      };

      const chapaRes =
        await fetch(
          `${CHAPA_BASE}/transaction/initialize`,
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${process.env.CHAPA_SECRET_KEY}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                chapaPayload
              ),
          }
        );

      let data;

      try {
        data =
          await chapaRes.json();
      } catch {
        data = null;
      }

      const chapaMessage =
        stringifyChapaError(
          data?.message ||
          data?.error
        );

      console.log(
        `[chapa] initialize tx_ref=${txRef} http=${chapaRes.status} status=${data?.status} message=${chapaMessage}`
      );

      /* ------------------------------------------------------------
         INITIALIZE FAILED
      ------------------------------------------------------------- */

      if (
        !data ||
        data.status !== "success" ||
        !data.data?.checkout_url
      ) {
        const failureReason =
          safeFailureReason(
            data?.message ||
            data?.error ||
            "Chapa initialization failed"
          );

        await Topup.updateOne(
          { txRef },
          {
            status:
              "failed",

            failureReason,
          }
        );

        return res.status(502).json({
          error:
            failureReason,
        });
      }

      /* ------------------------------------------------------------
         SUCCESS
      ------------------------------------------------------------- */

      return res.json({
        checkout_url:
          data.data.checkout_url,

        tx_ref:
          txRef,

        duptAmount,

        etbAmount,
      });
    } catch (err) {
      console.error(
        "[billing] /topup error:",
        err
      );

      return res.status(500).json({
        error:
          "Top-up failed",

        detail:
          err.message,
      });
    }
  }
);

/* ================================================================
   VERIFY + CREDIT
================================================================ */

/**
 * Verify a successful Chapa payment and credit the business wallet.
 *
 * Topup purchase types:
 *
 *   CUSTOM_TOPUP
 *   PACKAGE_PURCHASE
 *
 * BillingLedger types:
 *
 *   TOPUP
 *   PACKAGE_PURCHASE
 *
 * Therefore CUSTOM_TOPUP is converted to TOPUP
 * when the ledger entry is created.
 */
async function confirmAndCredit(txRef) {
  console.log(
    `[chapa] confirmAndCredit START tx_ref=${txRef}`
  );

  /* --------------------------------------------------------------
     FIND TOPUP
  --------------------------------------------------------------- */

  const topup =
    await Topup.findOne({
      txRef,
    });

  if (!topup) {
    console.error(
      `[chapa] confirmAndCredit: TOPUP NOT FOUND tx_ref=${txRef}`
    );

    return {
      ok: false,
      reason:
        "unknown tx_ref",
    };
  }

  console.log(
    `[chapa] topup found tx_ref=${txRef} status=${topup.status} business=${topup.businessId} amount=${topup.amount} dupt=${topup.duptAmount} purchaseType=${topup.purchaseType}`
  );

  /* --------------------------------------------------------------
     ALREADY CREDITED
  --------------------------------------------------------------- */

  if (
    topup.status ===
    "success"
  ) {
    console.log(
      `[chapa] tx_ref=${txRef} already credited - skipping`
    );

    return {
      ok: true,

      alreadyProcessed:
        true,

      topup,
    };
  }

  /* --------------------------------------------------------------
     VERIFY DIRECTLY WITH CHAPA
  --------------------------------------------------------------- */

  console.log(
    `[chapa] verifying transaction tx_ref=${txRef}`
  );

  const verifyRes =
    await fetch(
      `${CHAPA_BASE}/transaction/verify/${encodeURIComponent(
        txRef
      )}`,
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${process.env.CHAPA_SECRET_KEY}`,

          "Content-Type":
            "application/json",
        },
      }
    );

  let verifyData;

  try {
    verifyData =
      await verifyRes.json();
  } catch {
    verifyData = null;
  }

  console.log(
    `[chapa] verify response tx_ref=${txRef} http=${verifyRes.status} status=${verifyData?.status} paymentStatus=${verifyData?.data?.status}`
  );

  if (!verifyData) {
    await Topup.updateOne(
      { txRef },
      {
        status:
          "failed",

        failureReason:
          "Invalid response from Chapa verification",
      }
    );

    return {
      ok: false,

      reason:
        "invalid verification response",
    };
  }

  /* --------------------------------------------------------------
     PAYMENT SUCCESS
  --------------------------------------------------------------- */

  const paymentStatus =
    verifyData?.data?.status;

  const apiStatus =
    verifyData?.status;

  const succeeded =
    apiStatus === "success" &&
    paymentStatus === "success";

  if (!succeeded) {
    const reason =
      safeFailureReason(
        verifyData?.message ||
        paymentStatus ||
        "Payment not successful"
      );

    console.error(
      `[chapa] VERIFY FAILED tx_ref=${txRef}: ${reason}`
    );

    if (
      paymentStatus ===
      "failed" ||
      paymentStatus ===
      "cancelled" ||
      paymentStatus ===
      "reversed"
    ) {
      await Topup.updateOne(
        { txRef },
        {
          status:
            "failed",

          failureReason:
            reason,
        }
      );
    }

    return {
      ok: false,

      reason:
        "payment not successful",
    };
  }

  /* --------------------------------------------------------------
     TX REF CHECK
  --------------------------------------------------------------- */

  const verifiedTxRef =
    verifyData?.data?.tx_ref;

  if (
    verifiedTxRef &&
    verifiedTxRef !== txRef
  ) {
    console.error(
      `[chapa] SECURITY: tx_ref mismatch expected=${txRef} received=${verifiedTxRef}`
    );

    await Topup.updateOne(
      { txRef },
      {
        status:
          "failed",

        failureReason:
          "tx_ref mismatch in verify response",
      }
    );

    return {
      ok: false,

      reason:
        "tx_ref mismatch",
    };
  }

  /* --------------------------------------------------------------
     MODE CHECK
  --------------------------------------------------------------- */

  const expectedMode =
    process.env.CHAPA_MODE ===
      "test"
      ? "test"
      : "live";

  const verifiedMode =
    verifyData?.data?.mode;

  if (
    verifiedMode &&
    verifiedMode !==
    expectedMode
  ) {
    const reason =
      `mode mismatch: expected ${expectedMode}, got ${verifiedMode}`;

    console.error(
      `[chapa] ${reason}`
    );

    await Topup.updateOne(
      { txRef },
      {
        status:
          "failed",

        failureReason:
          reason,
      }
    );

    return {
      ok: false,

      reason:
        "mode mismatch",
    };
  }

  /* --------------------------------------------------------------
     CURRENCY CHECK
  --------------------------------------------------------------- */

  const verifiedCurrency =
    verifyData?.data?.currency;

  if (
    verifiedCurrency &&
    verifiedCurrency !==
    "ETB"
  ) {
    console.error(
      `[chapa] currency mismatch tx_ref=${txRef} expected=ETB received=${verifiedCurrency}`
    );

    await Topup.updateOne(
      { txRef },
      {
        status:
          "failed",

        failureReason:
          "currency mismatch",
      }
    );

    return {
      ok: false,

      reason:
        "currency mismatch",
    };
  }

  /* --------------------------------------------------------------
     AMOUNT CHECK
  --------------------------------------------------------------- */

  const verifiedAmount =
    Number(
      verifyData?.data?.amount
    );

  const expectedAmount =
    Number(
      topup.amount
    );

  if (
    !Number.isFinite(
      verifiedAmount
    ) ||
    verifiedAmount !==
    expectedAmount
  ) {
    console.error(
      `[chapa] amount mismatch tx_ref=${txRef} expected=${expectedAmount} received=${verifiedAmount}`
    );

    await Topup.updateOne(
      { txRef },
      {
        status:
          "failed",

        failureReason:
          "amount mismatch",
      }
    );

    return {
      ok: false,

      reason:
        "amount mismatch",
    };
  }

  /* --------------------------------------------------------------
     PAYMENT VERIFIED
  --------------------------------------------------------------- */

  console.log(
    `[chapa] PAYMENT VERIFIED tx_ref=${txRef} amount=${verifiedAmount} currency=${verifiedCurrency || "ETB"}`
  );

  /* --------------------------------------------------------------
     RELOAD TOPUP
  --------------------------------------------------------------- */

  const freshTopup =
    await Topup.findOne({
      txRef,
    });

  if (!freshTopup) {
    console.error(
      `[chapa] topup disappeared after verification tx_ref=${txRef}`
    );

    return {
      ok: false,

      reason:
        "topup not found after verification",
    };
  }

  /* --------------------------------------------------------------
     SECOND IDEMPOTENCY CHECK
  --------------------------------------------------------------- */

  if (
    freshTopup.status ===
    "success"
  ) {
    console.log(
      `[chapa] tx_ref=${txRef} already processed after verification`
    );

    return {
      ok: true,

      alreadyProcessed:
        true,

      topup:
        freshTopup,
    };
  }

  /* --------------------------------------------------------------
     VALIDATE TOPUP TYPE
  --------------------------------------------------------------- */

  const validTopupTypes = [
    "CUSTOM_TOPUP",
    "PACKAGE_PURCHASE",
  ];

  if (
    !validTopupTypes.includes(
      freshTopup.purchaseType
    )
  ) {
    console.error(
      `[billing] INVALID TOPUP PURCHASE TYPE tx_ref=${txRef} type=${freshTopup.purchaseType}`
    );

    await Topup.updateOne(
      { txRef },
      {
        status:
          "failed",

        failureReason:
          `Invalid purchase type: ${freshTopup.purchaseType}`,
      }
    );

    return {
      ok: false,

      reason:
        "invalid topup purchase type",
    };
  }

  /* --------------------------------------------------------------
     FIND BUSINESS
  --------------------------------------------------------------- */

  const business =
    await User.findById(
      freshTopup.businessId
    );

  if (!business) {
    console.error(
      `[billing] BUSINESS NOT FOUND businessId=${freshTopup.businessId} tx_ref=${txRef}`
    );

    await Topup.updateOne(
      { txRef },
      {
        status:
          "failed",

        failureReason:
          "Business account not found",
      }
    );

    return {
      ok: false,

      reason:
        "business not found",
    };
  }

  /* --------------------------------------------------------------
     BALANCE
  --------------------------------------------------------------- */

  const balanceBefore =
    Number(
      business.duptBalance
    ) || 0;

  const duptToCredit =
    Number(
      freshTopup.duptAmount
    ) || 0;

  if (
    !Number.isFinite(
      duptToCredit
    ) ||
    duptToCredit <= 0
  ) {
    console.error(
      `[billing] INVALID DUPT CREDIT tx_ref=${txRef} dupt=${freshTopup.duptAmount}`
    );

    await Topup.updateOne(
      { txRef },
      {
        status:
          "failed",

        failureReason:
          "Invalid DU PT credit amount",
      }
    );

    return {
      ok: false,

      reason:
        "invalid dupt amount",
    };
  }

  const balanceAfter =
    balanceBefore +
    duptToCredit;

  console.log(
    `[billing] CREDITING tx_ref=${txRef} business=${business._id} before=${balanceBefore} credit=${duptToCredit} after=${balanceAfter}`
  );

  /* --------------------------------------------------------------
     UPDATE BALANCE
  --------------------------------------------------------------- */

  business.duptBalance =
    balanceAfter;

  await business.save();

  console.log(
    `[billing] BALANCE UPDATED business=${business._id} balance=${business.duptBalance}`
  );

  /* --------------------------------------------------------------
     PROVIDER REFERENCE
  --------------------------------------------------------------- */

  const providerReference =
    verifyData?.data?.ref_id ||
    verifyData?.data?.reference ||
    null;

  /* --------------------------------------------------------------
     CONVERT TOPUP TYPE -> LEDGER TYPE
  --------------------------------------------------------------- */

  /*
   * Topup model:
   *
   * CUSTOM_TOPUP
   * PACKAGE_PURCHASE
   *
   * BillingLedger model:
   *
   * TOPUP
   * PACKAGE_PURCHASE
   *
   * Therefore:
   *
   * CUSTOM_TOPUP -> TOPUP
   */

  const ledgerType =
    freshTopup.purchaseType ===
      "CUSTOM_TOPUP"
      ? "TOPUP"
      : freshTopup.purchaseType;

  console.log(
    `[billing] LEDGER TYPE tx_ref=${txRef} topupType=${freshTopup.purchaseType} ledgerType=${ledgerType}`
  );

  /* --------------------------------------------------------------
     MARK TOPUP SUCCESS
  --------------------------------------------------------------- */

  await Topup.updateOne(
    {
      txRef,

      status: {
        $ne:
          "success",
      },
    },
    {
      $set: {
        status:
          "success",

        chapaRefId:
          providerReference,

        completedAt:
          new Date(),
      },
    }
  );

  console.log(
    `[billing] TOPUP MARKED SUCCESS tx_ref=${txRef}`
  );

  /* --------------------------------------------------------------
     CREATE BILLING LEDGER
  --------------------------------------------------------------- */

  try {
    await BillingLedger.create({
      businessId:
        business._id,

      userId:
        business._id,

      type:
        ledgerType,

      duptAmount:
        duptToCredit,

      etbAmount:
        freshTopup.amount,

      balanceBefore,

      balanceAfter,

      provider:
        "chapa",

      paymentMethod:
        "chapa_checkout",

      internalTxRef:
        txRef,

      providerReference,

      packageId:
        freshTopup.packageId ||
        null,

      topupId:
        freshTopup._id,

      status:
        "success",
    });

    console.log(
      `[billing] LEDGER CREATED tx_ref=${txRef} business=${business._id} type=${ledgerType}`
    );
  } catch (ledgerError) {
    /*
     * The payment and wallet credit already succeeded.
     *
     * Do NOT reverse the balance here.
     *
     * The ledger can be repaired separately.
     */
    console.error(
      `[billing] LEDGER CREATE FAILED tx_ref=${txRef}:`,
      ledgerError
    );
  }

  /* --------------------------------------------------------------
     FINAL
  --------------------------------------------------------------- */

  console.log(
    `[billing] TOPUP COMPLETE tx_ref=${txRef} business=${business._id} ${balanceBefore} -> ${balanceAfter}`
  );

  return {
    ok: true,

    topup:
      await Topup.findOne({
        txRef,
      }),

    balanceBefore,

    balanceAfter,

    duptCredited:
      duptToCredit,
  };
}

/* ================================================================
   CHAPA CALLBACK
================================================================ */

router.get(
  "/verify-chapa/:tx_ref",
  async (req, res) => {
    const txRef =
      req.params.tx_ref;

    console.log(
      `[chapa] CALLBACK RECEIVED tx_ref=${txRef}`
    );

    try {
      const result =
        await confirmAndCredit(
          txRef
        );

      const status =
        result.ok
          ? "success"
          : "failed";

      console.log(
        `[chapa] CALLBACK COMPLETE tx_ref=${txRef} result=${status}`
      );

      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard?topup=${status}&tx_ref=${encodeURIComponent(
          txRef
        )}`
      );
    } catch (err) {
      console.error(
        `[billing] /verify-chapa ERROR tx_ref=${txRef}:`,
        err
      );

      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard?topup=failed&tx_ref=${encodeURIComponent(
          txRef
        )}`
      );
    }
  }
);

/* ================================================================
   CHAPA WEBHOOK
================================================================ */

router.post(
  "/webhook",
  async (req, res) => {
    try {
      console.log(
        "[chapa] WEBHOOK RECEIVED:",
        JSON.stringify(
          req.body,
          null,
          2
        )
      );

      const secret =
        process.env.CHAPA_WEBHOOK_SECRET;

      /* ------------------------------------------------------------
         VERIFY WEBHOOK SIGNATURE
      ------------------------------------------------------------- */

      if (secret) {
        const bodySignature =
          req.headers[
          "x-chapa-signature"
          ];

        const keySignature =
          req.headers[
          "chapa-signature"
          ];

        const expectedBodySig =
          req.rawBody
            ? crypto
              .createHmac(
                "sha256",
                secret
              )
              .update(
                req.rawBody
              )
              .digest("hex")
            : null;

        const expectedKeySig =
          crypto
            .createHmac(
              "sha256",
              secret
            )
            .update(secret)
            .digest("hex");

        const bodyOk =
          expectedBodySig &&
          safeSignatureEquals(
            bodySignature,
            expectedBodySig
          );

        const keyOk =
          safeSignatureEquals(
            keySignature,
            expectedKeySig
          );

        if (
          !bodyOk &&
          !keyOk
        ) {
          console.error(
            "[chapa] WEBHOOK INVALID SIGNATURE"
          );

          return res
            .status(401)
            .send(
              "Invalid signature"
            );
        }

        console.log(
          "[chapa] WEBHOOK SIGNATURE VERIFIED"
        );
      } else {
        console.warn(
          "[chapa] CHAPA_WEBHOOK_SECRET not configured - signature verification skipped"
        );
      }

      /* ------------------------------------------------------------
         EXTRACT TX REF
      ------------------------------------------------------------- */

      const body =
        req.body || {};

      const txRef =
        body.tx_ref ||
        body.trx_ref ||
        body.transaction_reference;

      const status =
        body.status;

      const event =
        body.event;

      console.log(
        `[chapa] WEBHOOK EVENT event=${event} tx_ref=${txRef} status=${status}`
      );

      if (!txRef) {
        console.error(
          "[chapa] WEBHOOK has no tx_ref"
        );

        return res.sendStatus(
          200
        );
      }

      /* ------------------------------------------------------------
         SUCCESS EVENT
      ------------------------------------------------------------- */

      if (
        status ===
        "success" ||
        event ===
        "charge.success"
      ) {
        try {
          const result =
            await confirmAndCredit(
              txRef
            );

          console.log(
            `[chapa] WEBHOOK CREDIT RESULT tx_ref=${txRef}:`,
            JSON.stringify({
              ok:
                result.ok,

              reason:
                result.reason,

              alreadyProcessed:
                result.alreadyProcessed,

              balanceBefore:
                result.balanceBefore,

              balanceAfter:
                result.balanceAfter,

              duptCredited:
                result.duptCredited,
            })
          );
        } catch (
        creditError
        ) {
          console.error(
            `[chapa] WEBHOOK CREDIT ERROR tx_ref=${txRef}:`,
            creditError
          );
        }
      } else {
        console.log(
          `[chapa] WEBHOOK ignored tx_ref=${txRef} status=${status} event=${event}`
        );
      }

      return res.sendStatus(
        200
      );
    } catch (err) {
      console.error(
        "[billing] /webhook ERROR:",
        err
      );

      return res.sendStatus(
        200
      );
    }
  }
);

/* ================================================================
   BILLING LEDGER
================================================================ */

// GET /api/billing/ledger
router.get(
  "/ledger",
  requireAuth,
  requireOwner,
  async (req, res) => {
    try {
      const page =
        Math.max(
          1,
          Number(
            req.query.page
          ) || 1
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number(
              req.query.limit
            ) || 30
          )
        );

      const skip =
        (page - 1) *
        limit;

      const [
        items,
        total,
      ] = await Promise.all([
        BillingLedger.find({
          businessId:
            req.user._id,
        })
          .sort({
            createdAt:
              -1,
          })
          .skip(skip)
          .limit(limit),

        BillingLedger.countDocuments({
          businessId:
            req.user._id,
        }),
      ]);

      return res.json({
        items,

        total,

        page,

        limit,
      });
    } catch (err) {
      console.error(
        "[billing] /ledger error:",
        err
      );

      return res.status(500).json({
        error:
          "Could not load billing ledger",
      });
    }
  }
);

/* ================================================================
   EXPORT
================================================================ */

module.exports = router;
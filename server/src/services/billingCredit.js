const BillingLedger = require("../models/BillingLedger");
const Package = require("../models/Package");
const Topup = require("../models/Topup");
const User = require("../models/User");
const { sendPurchaseReceiptEmail } = require("./email");

function creditedReferenceFor(topup) {
  if (!topup.extractedReference) return undefined;
  return `${topup.bankProvider || "unknown"}:${String(topup.extractedReference)
    .replace(/\s+/g, "")
    .toUpperCase()}`;
}

async function updateBalanceWithRetry(businessId, duptAmount) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await User.findById(businessId).select("duptBalance");
    if (!current) throw new Error("Business account not found");

    const balanceBefore = Number(current.duptBalance) || 0;
    const updated = await User.findOneAndUpdate(
      { _id: businessId, duptBalance: current.duptBalance },
      { $inc: { duptBalance: duptAmount } },
      { new: true }
    ).select("duptBalance businessName ownerName email notificationPreferences");

    if (updated) {
      return {
        business: updated,
        balanceBefore,
        balanceAfter: Number(updated.duptBalance) || 0,
      };
    }
  }

  throw new Error("The balance changed repeatedly; please try the approval again");
}

async function creditBankTransferTopup(topupId, { reviewedBy = null, reason = "" } = {}) {
  const existing = await Topup.findById(topupId);
  if (!existing) throw Object.assign(new Error("Bank transfer not found"), { statusCode: 404 });
  if (existing.paymentMethod !== "bank_transfer") {
    throw Object.assign(new Error("This payment is not a bank transfer"), { statusCode: 400 });
  }
  if (existing.status === "success") {
    const business = await User.findById(existing.businessId).select("duptBalance");
    return { topup: existing, duptBalance: business?.duptBalance ?? 0, alreadyProcessed: true };
  }

  const creditedReference = creditedReferenceFor(existing);
  let claimed;
  try {
    const set = {
      status: "crediting",
      reviewReason: reason,
      reviewedAt: new Date(),
    };
    if (reviewedBy) set.reviewedBy = reviewedBy;
    if (creditedReference) set.creditedReference = creditedReference;

    claimed = await Topup.findOneAndUpdate(
      {
        _id: topupId,
        status: { $in: ["processing", "pending_review"] },
      },
      { $set: set },
      { new: true, runValidators: true }
    );
  } catch (error) {
    if (error?.code === 11000) {
      throw Object.assign(
        new Error("This bank transaction reference has already been credited"),
        { statusCode: 409 }
      );
    }
    throw error;
  }

  if (!claimed) {
    throw Object.assign(
      new Error("This transfer is no longer waiting for approval"),
      { statusCode: 409 }
    );
  }

  let balance;
  try {
    balance = await updateBalanceWithRetry(claimed.businessId, Number(claimed.duptAmount));
  } catch (error) {
    await Topup.updateOne(
      { _id: claimed._id, status: "crediting" },
      {
        $set: { status: "pending_review" },
        $unset: { creditedReference: 1 },
      }
    );
    throw error;
  }

  const topup = await Topup.findByIdAndUpdate(
    claimed._id,
    {
      $set: {
        status: "success",
        completedAt: new Date(),
        failureReason: null,
      },
    },
    { new: true }
  );

  const ledgerType = topup.purchaseType === "CUSTOM_TOPUP" ? "TOPUP" : "PACKAGE_PURCHASE";
  const existingLedger = await BillingLedger.findOne({
    internalTxRef: topup.txRef,
    type: ledgerType,
  });

  if (!existingLedger) {
    try {
      await BillingLedger.create({
        businessId: topup.businessId,
        userId: reviewedBy || topup.businessId,
        type: ledgerType,
        duptAmount: topup.duptAmount,
        etbAmount: topup.amount,
        balanceBefore: balance.balanceBefore,
        balanceAfter: balance.balanceAfter,
        provider: topup.bankProvider,
        paymentMethod: "bank_transfer_receipt",
        internalTxRef: topup.txRef,
        providerReference: topup.extractedReference,
        packageId: topup.packageId || null,
        topupId: topup._id,
        status: "success",
        reason: reason || "Direct bank transfer verified",
      });
    } catch (error) {
      // The wallet has already been credited and the Topup is the durable
      // idempotency record. A ledger write failure must not report payment
      // failure or trigger a second credit attempt.
      console.error("[billing] direct payment ledger write failed:", error.message);
    }
  }

  const business = balance.business;
  try {
    if (business.email && business.notificationPreferences?.emailReceipts !== false) {
      let description =
        topup.purchaseType === "PACKAGE_PURCHASE"
          ? "Direct bank transfer package purchase"
          : "Direct bank transfer top up";
      if (topup.packageId) {
        const pkg = await Package.findById(topup.packageId).select("name");
        if (pkg?.name) description = `Package Purchase: ${pkg.name}`;
      }

      sendPurchaseReceiptEmail(business.email, {
        ownerName: business.ownerName,
        businessName: business.businessName,
        txRef: topup.txRef,
        purchaseType: description,
        etbAmount: topup.amount,
        duptCredited: topup.duptAmount,
        newBalance: balance.balanceAfter,
        date: new Date(),
      }).catch((error) =>
        console.error("[billing] direct payment receipt email failed:", error.message)
      );
    }
  } catch (error) {
    console.error("[billing] preparing direct payment email failed:", error.message);
  }

  return { topup, duptBalance: balance.balanceAfter, alreadyProcessed: false };
}

module.exports = {
  creditBankTransferTopup,
};

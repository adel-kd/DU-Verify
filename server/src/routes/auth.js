const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const BillingLedger = require("../models/BillingLedger");
const {
  BUSINESS_TYPES,
  BUSINESS_TYPE_KEYS,
  signupBonusFor,
} = require("../constants/businessTypes");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/* ============================================================
   JWT
============================================================ */

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}


/* ============================================================
   PUBLIC USER
============================================================ */

/**
 * Return the user object that is safe to send to the frontend.
 *
 * IMPORTANT:
 *
 * The DU PT wallet belongs to the BUSINESS.
 *
 * Owner:
 *   user = business owner
 *   user.duptBalance is the business balance.
 *
 * Staff:
 *   user = staff account
 *   user.businessId = business owner/business document
 *   business.duptBalance is the balance staff must see.
 *
 * This prevents staff from seeing a stale/incorrect personal
 * duptBalance after login.
 */
async function publicUser(user) {
  /*
   * Resolve the business only when necessary.
   *
   * Owner:
   *   The user itself is the business.
   *
   * Staff:
   *   businessId points to the owner/business account.
   *
   * Admin:
   *   Admin has no businessId and therefore has no business.
   */
  let business = user;

  if (user.role === "staff") {
    business = await User.findById(user.businessId);
  }

  /*
   * Business wallet.
   *
   * Owner:
   *   user.duptBalance
   *
   * Staff:
   *   business.duptBalance
   *
   * Admin:
   *   no business wallet
   */
  const businessBalance =
    user.role === "owner"
      ? user.duptBalance ?? 0
      : user.role === "staff"
        ? business?.duptBalance ?? 0
        : 0;

  return {
    /*
     * ========================================================
     * LOGGED-IN ACCOUNT IDENTITY
     * ========================================================
     *
     * IMPORTANT:
     * Always use the currently authenticated user's values.
     *
     * Owner  -> owner's name
     * Staff  -> staff member's name
     * Admin  -> admin's name
     */
    id: user._id,

    ownerName: user.ownerName,
    phone: user.phone,
    email: user.email,
    role: user.role,

    /*
     * ========================================================
     * BUSINESS INFORMATION
     * ========================================================
     *
     * Staff gets business information from their business.
     * Owner gets it from themselves.
     * Admin has no business.
     */
    businessName:
      business?.businessName ??
      user.businessName,

    businessType:
      business?.businessType ??
      user.businessType,

    /*
     * ========================================================
     * BUSINESS DU PT BALANCE
     * ========================================================
     */
    duptBalance: businessBalance,

    /*
     * Backwards compatibility.
     */
    walletBalance: businessBalance,

    /*
     * Business configuration.
     *
     * Staff should see the business owner's configuration.
     */
    lowBalanceThreshold:
      business?.lowBalanceThreshold ??
      user.lowBalanceThreshold,

    cbeAccountSuffix:
      business?.cbeAccountSuffix ??
      user.cbeAccountSuffix,

    abyssiniaAccountSuffix:
      business?.abyssiniaAccountSuffix ??
      user.abyssiniaAccountSuffix,

    /*
     * Personal preferences belong to the
     * currently logged-in account.
     */
    themePreference:
      user.themePreference,

    notificationPreferences:
      user.notificationPreferences,
  };
}

/* ============================================================
   BUSINESS TYPES
============================================================ */

// GET /api/auth/business-types
router.get(
  "/business-types",
  (req, res) => {
    res.json({
      businessTypes:
        BUSINESS_TYPES,
    });
  }
);


/* ============================================================
   REGISTER
============================================================ */

// POST /api/auth/register
router.post(
  "/register",
  async (req, res) => {
    try {
      const {
        businessName,
        ownerName,
        phone,
        email,
        password,
        businessType,
      } = req.body;

      /*
       * Basic validation
       */
      if (
        !businessName ||
        !ownerName ||
        !phone ||
        !email ||
        !password ||
        !businessType
      ) {
        return res.status(400).json({
          error:
            "All fields are required, including business type",
        });
      }

      /*
       * Validate business type
       */
      if (
        !BUSINESS_TYPE_KEYS.includes(
          businessType
        )
      ) {
        return res.status(400).json({
          error:
            "Invalid business type",
        });
      }

      /*
       * Prevent duplicate accounts.
       */
      const existing =
        await User.findOne({
          $or: [
            { email },
            { phone },
          ],
        });

      if (existing) {
        return res.status(409).json({
          error:
            "An account with that email or phone already exists",
        });
      }

      /*
       * Signup bonus is determined
       * server-side.
       */
      const signupBonus =
        signupBonusFor(
          businessType
        );

      /*
       * Hash password.
       */
      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );

      /*
       * Create business owner.
       */
      const user =
        await User.create({
          businessName,
          ownerName,
          phone,
          email,
          businessType,
          password:
            passwordHash,
          role: "owner",

          /*
           * New businesses start
           * with their signup DU PT.
           */
          duptBalance:
            signupBonus,

          /*
           * Mark as already migrated
           * so old wallet migration does
           * not credit the account again.
           */
          walletMigratedAt:
            new Date(),
        });

      /*
       * Record signup bonus in ledger.
       */
      if (
        signupBonus > 0
      ) {
        await BillingLedger.create({
          businessId:
            user._id,

          userId:
            null,

          type:
            "ADMIN_CREDIT",

          duptAmount:
            signupBonus,

          balanceBefore:
            0,

          balanceAfter:
            signupBonus,

          provider:
            "signup_bonus",

          reason:
            `Signup bonus for business type "${businessType}"`,

          status:
            "success",
        });
      }

      /*
       * Create JWT.
       */
      const token =
        signToken(user);

      /*
       * Return normalized user.
       *
       * publicUser is async because staff
       * may need a business lookup.
       */
      const safeUser =
        await publicUser(user);

      return res.status(201).json({
        token,
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/register]",
        err
      );

      return res.status(500).json({
        error:
          "Registration failed",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   LOGIN
============================================================ */

// POST /api/auth/login
//
// Owner or staff login.
router.post(
  "/login",
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      /*
       * Find account.
       */
      const user =
        await User.findOne({
          email,
        });

      if (
        !user ||
        !user.isActive
      ) {
        return res.status(401).json({
          error:
            "Invalid credentials",
        });
      }

      /*
       * Validate password.
       */
      const valid =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "Invalid credentials",
        });
      }

      /*
       * Create token.
       */
      const token =
        signToken(user);

      /*
       * IMPORTANT:
       *
       * publicUser() resolves the business
       * wallet for staff.
       *
       * Therefore:
       *
       * Owner:
       *   user.duptBalance
       *
       * Staff:
       *   business.duptBalance
       */
      const safeUser =
        await publicUser(user);

      return res.json({
        token,
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/login]",
        err
      );

      return res.status(500).json({
        error:
          "Login failed",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   CURRENT SESSION
============================================================ */

// GET /api/auth/me
router.get(
  "/me",
  requireAuth,
  async (req, res) => {
    try {
      /*
       * Re-read the current business
       * balance from MongoDB.
       *
       * This prevents a stale staff
       * wallet value from being returned.
       */
      const safeUser =
        await publicUser(
          req.user
        );

      return res.json({
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/me]",
        err
      );

      return res.status(500).json({
        error:
          "Could not load current session",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   UPDATE PERSONAL INFORMATION
============================================================ */

// PATCH /api/auth/me
router.patch(
  "/me",
  requireAuth,
  async (req, res) => {
    try {
      const {
        businessName,
        ownerName,
        phone,
        email,
        cbeAccountSuffix,
        abyssiniaAccountSuffix,
      } = req.body;

      /*
       * Required personal fields.
       */
      if (
        !ownerName ||
        !phone ||
        !email
      ) {
        return res.status(400).json({
          error:
            "Name, phone, and email are required",
        });
      }

      /*
       * Only owners can modify
       * business-level configuration.
       */
      if (
        req.user.role === "owner"
      ) {
        /*
         * Business name.
         */
        if (businessName) {
          req.user.businessName =
            businessName;
        }

        /*
         * CBE account suffix.
         */
        if (
          cbeAccountSuffix !==
          undefined
        ) {
          if (
            cbeAccountSuffix &&
            !/^\d{8}$/.test(
              cbeAccountSuffix
            )
          ) {
            return res.status(400).json({
              error:
                "CBE account suffix must be exactly 8 digits",
            });
          }

          req.user.cbeAccountSuffix =
            cbeAccountSuffix;
        }

        /*
         * Abyssinia account suffix.
         */
        if (
          abyssiniaAccountSuffix !==
          undefined
        ) {
          if (
            abyssiniaAccountSuffix &&
            !/^\d{5}$/.test(
              abyssiniaAccountSuffix
            )
          ) {
            return res.status(400).json({
              error:
                "Abyssinia account suffix must be exactly 5 digits",
            });
          }

          req.user.abyssiniaAccountSuffix =
            abyssiniaAccountSuffix;
        }
      }

      /*
       * Prevent email/phone collisions.
       */
      const conflict =
        await User.findOne({
          _id: {
            $ne: req.user._id,
          },

          $or: [
            { email },
            { phone },
          ],
        });

      if (conflict) {
        return res.status(409).json({
          error:
            "That email or phone is already in use by another account",
        });
      }

      /*
       * Update personal information.
       */
      req.user.ownerName =
        ownerName;

      req.user.phone =
        phone;

      req.user.email =
        email;

      await req.user.save();

      /*
       * Return normalized user.
       *
       * For staff this also includes
       * the current business DU PT balance.
       */
      const safeUser =
        await publicUser(
          req.user
        );

      return res.json({
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/me PATCH]",
        err
      );

      return res.status(500).json({
        error:
          "Could not update profile",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   CHANGE PASSWORD
============================================================ */

// PATCH /api/auth/me/password
router.patch(
  "/me/password",
  requireAuth,
  async (req, res) => {
    try {
      const {
        currentPassword,
        newPassword,
      } = req.body;

      /*
       * Validate input.
       */
      if (
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          error:
            "Current and new password are required",
        });
      }

      /*
       * Minimum password length.
       */
      if (
        newPassword.length < 8
      ) {
        return res.status(400).json({
          error:
            "New password must be at least 8 characters",
        });
      }

      /*
       * Validate current password.
       */
      const valid =
        await bcrypt.compare(
          currentPassword,
          req.user.password
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "Current password is incorrect",
        });
      }

      /*
       * Hash and save new password.
       */
      req.user.password =
        await bcrypt.hash(
          newPassword,
          10
        );

      await req.user.save();

      return res.json({
        ok: true,
      });
    } catch (err) {
      console.error(
        "[auth/me/password]",
        err
      );

      return res.status(500).json({
        error:
          "Could not update password",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   PREFERENCES
============================================================ */

// PATCH /api/auth/me/preferences
router.patch(
  "/me/preferences",
  requireAuth,
  async (req, res) => {
    try {
      const {
        themePreference,
        notificationPreferences,
      } = req.body;

      /*
       * Theme.
       */
      if (
        themePreference !==
        undefined
      ) {
        if (
          ![
            "light",
            "dark",
            "system",
          ].includes(
            themePreference
          )
        ) {
          return res.status(400).json({
            error:
              "themePreference must be light, dark, or system",
          });
        }

        req.user.themePreference =
          themePreference;
      }

      /*
       * Notification preferences.
       */
      if (
        notificationPreferences !==
        undefined
      ) {
        req.user.notificationPreferences =
        {
          ...req.user
            .notificationPreferences,

          ...notificationPreferences,
        };
      }

      await req.user.save();

      /*
       * Return normalized user
       * with current business balance.
       */
      const safeUser =
        await publicUser(
          req.user
        );

      return res.json({
        user: safeUser,
      });
    } catch (err) {
      console.error(
        "[auth/me/preferences]",
        err
      );

      return res.status(500).json({
        error:
          "Could not update preferences",

        detail:
          err.message,
      });
    }
  }
);


/* ============================================================
   EXPORT
============================================================ */

module.exports = router;
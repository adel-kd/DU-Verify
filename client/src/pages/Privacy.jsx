import { Link } from "react-router-dom";
import logoSmall from "../assets/verified-logo.png";
import usePlatformContent from "../hooks/usePlatformContent.js";
import Footer from "../components/Footer.jsx";

export default function Privacy() {
  const content = usePlatformContent();
  const updated = content.legalUpdatedAt
    ? new Date(content.legalUpdatedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "August 2026";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-10 bg-ink text-paper px-5 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={logoSmall} alt="DU Verify" className="h-8 w-8" />
          <span className="font-display font-bold tracking-tight">DU Verify</span>
        </Link>
        <Link to="/login" className="text-sm text-mist hover:text-paper underline underline-offset-2">
          Back to sign in
        </Link>
      </header>

      <main className="max-w-2xl mx-auto p-6 sm:p-10">
        <h1 className="font-display text-3xl sm:text-4xl font-bold mb-1">Privacy Policy</h1>
        <p className="text-sm text-ink/40 mb-8">Last updated: {updated}</p>

        {content.privacyBody && (
          <div className="whitespace-pre-wrap text-sm sm:text-[15px] leading-relaxed text-ink/80">
            {content.privacyBody}
          </div>
        )}

        <div className={`${content.privacyBody ? "hidden" : ""} space-y-6 text-sm sm:text-[15px] leading-relaxed text-ink/80`}>
          <Section title="1. What we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account information:</strong> business name, owner name, phone number,
                email address, and a securely hashed password.
              </li>
              <li>
                <strong>Staff information:</strong> the name, phone, and email an Owner enters
                when creating a staff login, and a securely hashed password for that login.
              </li>
              <li>
                <strong>Verification data:</strong> transaction references, amounts, sender and
                receiver names, timestamps, and the bank or provider selected, extracted from the
                receipts you submit.
              </li>
              <li>
                <strong>Direct-payment evidence:</strong> screenshots or PDF receipts uploaded to
                confirm a bank-transfer top-up or package purchase, including the administrator's
                review decision.
              </li>
              <li>
                <strong>Usage data:</strong> wallet balance, verification history, and basic
                request logs used for billing and troubleshooting.
              </li>
            </ul>
          </Section>

          <Section title="2. How receipt images are handled">
            Receipt screenshots you upload are sent to our OCR provider to extract transaction
            details. Images submitted for an ordinary customer-payment verification are processed
            in memory and are not retained after that request. A receipt submitted as evidence of
            your own direct bank-transfer purchase is retained so a platform administrator can
            review unconfirmed payments and so duplicate wallet credits can be prevented.
          </Section>

          <Section title="3. How we use your information">
            <ul className="list-disc pl-5 space-y-1">
              <li>To operate the verification service and confirm transactions with payment providers.</li>
              <li>To maintain your account, wallet balance, and staff permissions.</li>
              <li>To detect duplicate or fraudulent receipt submissions.</li>
              <li>To provide customer support and respond to account issues.</li>
              <li>To meet legal, tax, and accounting obligations.</li>
            </ul>
          </Section>

          <Section title="4. Who we share it with">
            We share only what is necessary with the third-party services that make verification
            possible: an OCR provider to read receipt images, and payment-provider APIs to confirm
            whether a transaction reference is genuine. We do not sell personal information to
            advertisers or data brokers.
          </Section>

          <Section title="5. Staff visibility">
            Business Owners can see the verification activity performed by their staff accounts,
            including which staff member checked a given receipt. Staff accounts do not have
            access to other staff members' individual login credentials.
          </Section>

          <Section title="6. Data retention">
            Account and verification records are kept for as long as your account is active, and
            for a reasonable period afterward to meet accounting, dispute-resolution, and legal
            obligations. You may request deletion of your account by contacting your account
            administrator or support; some transaction records may be retained where required by
            law.
          </Section>

          <Section title="7. Security">
            Passwords are stored using one-way hashing (bcrypt) and are never stored or logged in
            plain text. Access to the Service requires a signed authentication token. We
            restrict staff accounts to the business that created them and scope every query to
            that business.
          </Section>

          <Section title="8. Your choices">
            You can update your personal information and change your password at any time from
            the Settings page. Business Owners can disable a staff account at any time to revoke
            that staff member's access immediately.
          </Section>

          <Section title="9. Changes to this policy">
            We may update this Privacy Policy from time to time. Material changes will be
            reflected by updating the "Last updated" date above.
          </Section>

          <Section title="10. Contact">
            Questions about this Privacy Policy can be directed to your account administrator or
            to the support channel provided within the app.
          </Section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display font-semibold text-ink text-base mb-1.5">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

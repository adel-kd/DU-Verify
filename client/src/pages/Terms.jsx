import { Link } from "react-router-dom";
import logoSmall from "../assets/verified-logo.png";

export default function Terms() {
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
        <h1 className="font-display text-3xl sm:text-4xl font-bold mb-1">Terms of Service</h1>
        <p className="text-sm text-ink/40 mb-8">Last updated: August 2026</p>

        <div className="space-y-6 text-sm sm:text-[15px] leading-relaxed text-ink/80">
          <Section title="1. Agreement to these terms">
            These Terms of Service ("Terms") govern access to and use of DU Verify (the
            "Service"), a payment receipt verification platform for merchants. By creating an
            account, adding staff logins, or using the Service in any way, you agree to be bound
            by these Terms on behalf of yourself and, where applicable, the business you
            represent.
          </Section>

          <Section title="2. Accounts and staff access">
            The person who registers a business ("Owner") is responsible for the accuracy of the
            information provided and for any staff accounts created under that business. Owners
            must keep login credentials confidential and are responsible for activity that occurs
            under their business, including actions taken by staff accounts they create or fail
            to disable when access should end.
          </Section>

          <Section title="3. How verification works">
            The Service uses optical character recognition and third-party payment-provider APIs
            to help confirm whether a submitted receipt or screenshot corresponds to a genuine
            transaction. Verification results are provided to assist your own judgment and are
            not a guarantee. You remain responsible for the final decision to accept or decline
            any payment, and DU Verify is not liable for losses arising from a transaction you
            chose to accept or decline based on a verification result.
          </Section>

          <Section title="4. Wallet balance and billing">
            Verification checks are billed against a prepaid wallet balance. New accounts receive
            a starting credit as described at registration. You may top up your wallet through
            the payment methods offered in the app. Wallet credits are non-transferable between
            businesses and, unless required by law, are non-refundable once consumed by a
            verification check.
          </Section>

          <Section title="5. Acceptable use">
            You agree not to misuse the Service, including by attempting to circumvent usage
            limits, submitting fraudulent or tampered receipts for testing fraud detection,
            reverse-engineering the verification logic, or using the Service to facilitate money
            laundering or other unlawful activity. We may suspend or terminate accounts that
            violate this section.
          </Section>

          <Section title="6. Data submitted for verification">
            Receipt images you upload are processed to extract transaction details and are not
            retained as image files after processing unless a future feature explicitly enables
            storage for dispute resolution. Extracted transaction data (reference numbers,
            amounts, timestamps, and counterpart names) is stored as part of your verification
            history. See our Privacy Policy for more detail.
          </Section>

          <Section title="7. Service availability">
            The Service depends on third-party OCR and payment-provider APIs that are outside our
            control. We aim for high availability but do not guarantee uninterrupted access, and
            we are not responsible for downtime, delays, or inaccuracies caused by those
            third-party providers.
          </Section>

          <Section title="8. Limitation of liability">
            To the fullest extent permitted by law, DU Verify and its operators are not liable
            for indirect, incidental, or consequential damages arising from use of the Service,
            including losses from accepted fraudulent payments, service interruptions, or data
            unavailability. Our total liability for any claim is limited to the amount you paid
            for wallet top-ups in the three months preceding the claim.
          </Section>

          <Section title="9. Changes to these terms">
            We may update these Terms from time to time. Material changes will be reflected by
            updating the "Last updated" date above. Continued use of the Service after changes
            take effect constitutes acceptance of the revised Terms.
          </Section>

          <Section title="10. Contact">
            Questions about these Terms can be directed to your account administrator or to the
            support channel provided within the app.
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display font-semibold text-ink text-base mb-1.5">{title}</h2>
      <p>{children}</p>
    </section>
  );
}

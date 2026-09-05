import { Link } from "react-router-dom";
import { ArrowRight, Camera, CircleHelp, CreditCard, Mail, ShieldCheck } from "lucide-react";
import logoSmall from "../assets/verified-logo.png";
import Footer from "../components/Footer.jsx";

const faqs = [
  {
    question: "How do I verify a payment?",
    answer:
      "Open Verify, choose the bank or payment provider shown on the receipt, then upload a clear screenshot or photo of the complete receipt. Review the extracted details and start the check. A receipt should show the transaction reference, amount, and payment time when possible.",
  },
  {
    question: "Which providers can I use?",
    answer:
      "DU Verify supports receipts from CBE, CBE Birr, Telebirr, Dashen, Bank of Abyssinia, M-Pesa, and Awash where provider verification is available. The available providers in your account are the source of truth because an administrator can temporarily disable a provider.",
  },
  {
    question: "Why did my receipt fail?",
    answer:
      "The most common causes are a blurry or cropped image, a missing transaction reference, an incorrect provider selection, an already-used reference, or a provider service being temporarily unavailable. Try the original receipt with all four corners visible and confirm the selected provider before retrying.",
  },
  {
    question: "What is a DU PT and why did my balance change?",
    answer:
      "DU PT is the wallet credit used for verification checks. Each successful check consumes the displayed verification cost. Owners can view wallet activity and top up from the dashboard; staff share the business wallet and cannot transfer credits between businesses.",
  },
  {
    question: "Can I use a receipt that was already checked?",
    answer:
      "No. A transaction reference that has already been accepted is marked as already used to help prevent the same payment screenshot from being accepted twice. Check the original transaction or contact the business owner if the result looks incorrect.",
  },
  {
    question: "Are uploaded receipt images saved?",
    answer:
      "Receipt images are processed to extract transaction details and are not retained as image files after processing. Extracted details such as the reference, amount, names, and timestamp may remain in verification history.",
  },
];

const steps = [
  { icon: Camera, title: "Prepare the receipt", text: "Use the clearest original screenshot or photo you have." },
  { icon: ShieldCheck, title: "Run the check", text: "Select the matching provider and submit the receipt." },
  { icon: CreditCard, title: "Read the result", text: "Confirm the amount, reference, and status before accepting payment." },
];

export default function Help() {
  return (
    <div className="min-h-screen bg-paper text-ink dark:bg-[#222222] dark:text-paper">
      <header className="sticky top-0 z-10 border-b border-black/10 bg-ink px-4 py-3 text-paper dark:border-line sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link to="/login" className="flex min-w-0 items-center gap-2">
            <img src={logoSmall} alt="DU Verify" className="h-8 w-8 shrink-0" />
            <span className="truncate font-display font-bold tracking-tight">DU Verify</span>
          </Link>
          <Link
            to="/login"
            className="shrink-0 text-xs text-mist underline-offset-2 hover:text-paper hover:underline sm:text-sm"
          >
            Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="border-b border-black/10 pb-8 dark:border-line sm:pb-12">
          <div className="mb-4 inline-flex items-center gap-2 border border-seal/40 bg-seal/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-seal">
            <CircleHelp size={15} aria-hidden="true" />
            Help center
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <h1 className="max-w-2xl font-display text-3xl font-bold leading-tight sm:text-5xl">
                Verify with confidence.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-ink/65 dark:text-mist sm:text-base">
                Find the essentials for checking payment receipts, managing your wallet, and solving the most common verification issues.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex w-full items-center justify-center gap-2 bg-seal px-4 py-3 text-sm font-semibold text-black transition hover:bg-seal/85 sm:w-fit lg:justify-self-end"
            >
              Open DU Verify <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="grid gap-3 py-8 sm:grid-cols-3 sm:gap-4 sm:py-10" aria-label="Verification steps">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="border border-black/10 bg-white p-5 dark:border-line dark:bg-[#1a1a1a] sm:p-6">
              <div className="mb-6 flex items-center justify-between text-seal">
                <Icon size={21} aria-hidden="true" />
                <span className="font-display text-2xl font-bold text-ink/20 dark:text-paper/20">0{index + 1}</span>
              </div>
              <h2 className="font-display text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink/60 dark:text-mist">{text}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-seal">Common questions</p>
            <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Answers for the moments that matter.</h2>
            <p className="mt-3 text-sm leading-6 text-ink/60 dark:text-mist">
              Still stuck? Start with a fresh, uncropped receipt and make sure its provider matches the one selected in the app.
            </p>
          </div>
          <div className="space-y-2">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group border border-black/10 bg-white dark:border-line dark:bg-[#1a1a1a]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm font-semibold marker:hidden sm:px-5">
                  <span>{question}</span>
                  <span className="shrink-0 text-xl font-normal text-seal transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="border-t border-black/10 px-4 pb-4 pt-3 text-sm leading-6 text-ink/65 dark:border-line dark:text-mist sm:px-5">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10 flex flex-col gap-4 border border-seal/30 bg-seal/10 p-5 dark:bg-seal/5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex gap-3">
            <Mail className="mt-0.5 shrink-0 text-seal" size={20} aria-hidden="true" />
            <div>
              <h2 className="font-display font-semibold">Need account-specific help?</h2>
              <p className="mt-1 text-sm leading-6 text-ink/65 dark:text-mist">Contact your business administrator for staff access, wallet, or account changes.</p>
            </div>
          </div>
          <Link to="/login" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-ink underline underline-offset-4 hover:text-seal dark:text-paper">
            Sign in to continue <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}

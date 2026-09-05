import { Link } from "react-router-dom";
import usePlatformContent from "../hooks/usePlatformContent.js";

export default function Footer({ dark = false }) {
  const year = new Date().getFullYear();
  const content = usePlatformContent();
  const contacts = [
    content.contactEmail && { label: content.contactEmail, href: `mailto:${content.contactEmail}` },
    content.contactPhone && { label: content.contactPhone, href: `tel:${content.contactPhone}` },
  ].filter(Boolean);

  return (
    <footer
      className={`mt-10 border-t px-5 py-6 text-xs ${
        dark ? "border-line text-mist" : "border-black/5 dark:border-line text-ink/40 dark:text-mist"
      }`}
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <p>© {year} DU Verify. All rights reserved.</p>
          {(contacts.length > 0 || content.contactAddress) && (
            <p className="mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1">
              {contacts.map((contact) => (
                <a key={contact.href} href={contact.href} className="hover:underline underline-offset-2">
                  {contact.label}
                </a>
              ))}
              {content.contactAddress && <span>{content.contactAddress}</span>}
            </p>
          )}
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/help" className="hover:underline underline-offset-2">
            Help
          </Link>
          <Link to="/terms" className="hover:underline underline-offset-2">
            Terms of Service
          </Link>
          <Link to="/privacy" className="hover:underline underline-offset-2">
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}

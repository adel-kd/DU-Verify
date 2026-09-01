import { Link } from "react-router-dom";

export default function Footer({ dark = false }) {
  const year = new Date().getFullYear();

  return (
    <footer
      className={`mt-10 border-t px-5 py-6 text-xs ${
        dark ? "border-line text-mist" : "border-black/5 dark:border-line text-ink/40 dark:text-mist"
      }`}
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <p>© {year} DU Verify. All rights reserved.</p>
        <nav className="flex items-center gap-4">
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

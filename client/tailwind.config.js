/** @type {import('tailwindcss').Config} */
export default {
  // Class-based (not media-query-based) so the Settings > Theme preference
  // (light/dark/system) can override the OS setting explicitly, via the
  // "dark" class ThemeContext applies to <html>.
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F1B2B",       // near-black indigo, primary background
        panel: "#16263B",     // raised surface on dark backgrounds
        paper: "#F7F5EF",     // warm off-white, light surfaces
        seal: "#12A783",      // verification teal - the "stamped, confirmed" color
        sealDark: "#0C7C63",
        flag: "#E2A63B",      // amber for mismatches / attention
        alarm: "#D5573B",     // used sparingly for failure states
        mist: "#8CA0B3",      // muted secondary text on dark
        line: "#26374D",      // hairline dividers on dark surfaces
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        body: ["\"Inter\"", "sans-serif"],
      },
      backgroundImage: {
        "seal-radial": "radial-gradient(circle at 30% 20%, rgba(18,167,131,0.18), transparent 60%)",
      },
    },
  },
  plugins: [],
};

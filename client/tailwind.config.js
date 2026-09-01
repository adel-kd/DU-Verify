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
        // Monochrome system: #222222 black / #FFFFFF white.
        ink: "#222222",       // primary text on light / dark surfaces
        panel: "#222222",     // raised surface on dark
        paper: "#FFFFFF",     // light surfaces — pure white, no cream
        seal: "#12A783",      // verification teal - the ONLY brand accent
        sealDark: "#0C7C63",
        flag: "#D5573B",      // caution — same red family as alarm
        alarm: "#D5573B",     // failure / terminated states ONLY
        mist: "#9A9A9A",      // muted secondary text (readable on #222)
        line: "#3D3D3D",      // hairline dividers on dark
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "sans-serif"],
        body: ["\"Inter\"", "sans-serif"],
      },
      borderRadius: {
        NONE: "0",
      },
    },
  },
  plugins: [],
};

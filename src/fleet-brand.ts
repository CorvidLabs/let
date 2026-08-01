/** CorvidLabs design-system assets, mirrored for Fleet's localhost server. */

export const CORVID_TOKENS_CSS = `:root {
  color-scheme: light;
  --ink: #15181B; --paper: #FAF9F6; --surface: #FFFFFF; --surface-strong: #DCDAD2;
  --sheen: #0E6F66; --sheen-strong: #0B5750; --sheen-bright: #45D0BC; --steel: #1E6FA8;
  --text-muted: #34383D; --text-faint: #50555B; --sheen-hover: #0B5750;
  --ink-70: rgba(21,24,27,.72); --ink-60: rgba(21,24,27,.62); --ink-45: rgba(21,24,27,.45);
  --ink-12: rgba(21,24,27,.12); --ink-06: rgba(21,24,27,.06); --hairline: var(--ink-12);
  --header-bg: rgba(250,249,246,.92); --danger: #84241E; --warning: #8A5A00;
  --success: #2F6B3A; --info: var(--sheen); --iridescence: linear-gradient(90deg,#0E6F66 0%,#1799A3 55%,#1E6FA8 100%);
  --font-display: "Schibsted Grotesk", "Helvetica Neue", sans-serif;
  --font-mono: "Spline Sans Mono", "SF Mono", monospace;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ink: #F4F3EF; --paper: #131619; --surface: #1B1F23; --surface-strong: #272C31;
  --sheen: #45D0BC; --sheen-strong: #45D0BC; --sheen-bright: #45D0BC;
  --text-muted: #C8C6BE; --text-faint: #A3A199; --sheen-hover: #63D9C7;
  --ink-70: rgba(244,243,239,.78); --ink-60: rgba(244,243,239,.68); --ink-45: rgba(244,243,239,.55);
  --ink-12: rgba(244,243,239,.15); --ink-06: rgba(244,243,239,.08); --header-bg: rgba(19,22,25,.92);
  --danger: #F08A7D; --warning: #E0B05A; --success: #6FC98A;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  color-scheme: dark;
  --ink: #F4F3EF; --paper: #131619; --surface: #1B1F23; --surface-strong: #272C31;
  --sheen: #45D0BC; --sheen-strong: #45D0BC; --sheen-bright: #45D0BC;
  --text-muted: #C8C6BE; --text-faint: #A3A199; --sheen-hover: #63D9C7;
  --ink-70: rgba(244,243,239,.78); --ink-60: rgba(244,243,239,.68); --ink-45: rgba(244,243,239,.55);
  --ink-12: rgba(244,243,239,.15); --ink-06: rgba(244,243,239,.08); --header-bg: rgba(19,22,25,.92);
  --danger: #F08A7D; --warning: #E0B05A; --success: #6FC98A;
} }
`;

export const CORVID_THEME_JS = `(() => {
  "use strict";
  const root = document.documentElement;
  const key = "corvid-theme";
  const dark = () => root.dataset.theme === "dark" || (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const saved = new URLSearchParams(location.search).get("theme") || (() => { try { return localStorage.getItem(key); } catch { return null; } })();
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  document.querySelectorAll("[data-corvid-theme-toggle]").forEach((button) => {
    const reflect = () => { button.setAttribute("aria-pressed", String(dark())); button.setAttribute("aria-label", dark() ? "Switch to light theme" : "Switch to dark theme"); };
    button.addEventListener("click", () => { root.dataset.theme = dark() ? "light" : "dark"; try { localStorage.setItem(key, root.dataset.theme); } catch {} reflect(); });
    reflect();
  });
})();`;

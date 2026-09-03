// Tailwind CSS v4 moved its PostCSS plugin into a separate package. There is
// deliberately no tailwind.config.js: v4 is configured from CSS itself, via the
// `@theme` block in src/index.css.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
}

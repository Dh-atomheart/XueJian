const colorVar = (name) => `rgb(var(${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Default theme tokens - 极简学术感 + 中度手绘漫画风格
        paper: {
          base: colorVar('--paper-base'),
          muted: colorVar('--paper-muted'),
          soft: colorVar('--paper-soft'),
          card: colorVar('--paper-card'),
        },
        ink: {
          DEFAULT: colorVar('--ink'),
          muted: colorVar('--ink-muted'),
          soft: colorVar('--ink-soft'),
        },
        line: {
          soft: colorVar('--line-soft'),
        },
        highlight: {
          yellow: colorVar('--highlight-yellow'),
          green: colorVar('--highlight-green'),
          blue: colorVar('--highlight-blue'),
          pink: colorVar('--highlight-pink'),
        },
      },
      fontFamily: {
        display: ['Kose', 'Xiaolai', 'serif'],
        ui: ['Yozai', 'sans-serif'],
        body: ['LXGW WenKai', 'serif'],
        latin: ['Inter', 'sans-serif'],
      },
      borderWidth: {
        'hairline': '0.5px',
        'thin': '1px',
      },
      boxShadow: {
        'paper': 'var(--shadow-paper)',
        'sticky': 'var(--shadow-sticky)',
        'card': 'var(--shadow-card)',
      },
      borderRadius: {
        'sketch': '2px',
      },
    },
  },
  plugins: [],
}

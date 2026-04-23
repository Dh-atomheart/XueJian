const colorVar = (name) => `rgb(var(${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
        // shadcn-compatible tokens
        background: colorVar('--background'),
        foreground: colorVar('--foreground'),
        card: {
          DEFAULT: colorVar('--card'),
          foreground: colorVar('--card-foreground'),
        },
        popover: {
          DEFAULT: colorVar('--popover'),
          foreground: colorVar('--popover-foreground'),
        },
        primary: {
          DEFAULT: colorVar('--primary'),
          foreground: colorVar('--primary-foreground'),
        },
        secondary: {
          DEFAULT: colorVar('--secondary'),
          foreground: colorVar('--secondary-foreground'),
        },
        muted: {
          DEFAULT: colorVar('--muted'),
          foreground: colorVar('--muted-foreground'),
        },
        accent: {
          DEFAULT: colorVar('--accent'),
          foreground: colorVar('--accent-foreground'),
        },
        destructive: {
          DEFAULT: colorVar('--destructive'),
          foreground: colorVar('--destructive-foreground'),
        },
        border: colorVar('--border'),
        input: colorVar('--input'),
        ring: colorVar('--ring'),
        sidebar: {
          DEFAULT: colorVar('--sidebar-bg'),
          foreground: colorVar('--sidebar-fg'),
          primary: colorVar('--sidebar-primary'),
          'primary-foreground': colorVar('--sidebar-primary-foreground'),
          accent: colorVar('--sidebar-accent'),
          'accent-foreground': colorVar('--sidebar-accent-foreground'),
          border: colorVar('--sidebar-border'),
          ring: colorVar('--sidebar-ring'),
        },
      },
      fontFamily: {
        display: ['Geist', 'Geist Fallback', 'Inter', 'system-ui', 'sans-serif'],
        ui: ['Geist', 'Geist Fallback', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Geist', 'Geist Fallback', 'Inter', 'system-ui', 'sans-serif'],
        latin: ['Geist Mono', 'Geist Mono Fallback', 'Consolas', 'monospace'],
        reading: ['LXGW WenKai', 'Songti SC', 'serif'],
      },
      borderWidth: {
        hairline: '0.5px',
        thin: '1px',
      },
      boxShadow: {
        paper: 'var(--shadow-paper)',
        sticky: 'var(--shadow-sticky)',
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        sketch: '2px',
        panel: '20px',
        card: '16px',
        item: '12px',
      },
    },
  },
  plugins: [],
}

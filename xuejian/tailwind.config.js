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
          base: '#fbfbf9',
          muted: '#f5f5f0',
          soft: '#eaeae5',
        },
        ink: {
          DEFAULT: '#1a1a1a',
          muted: '#666666',
          soft: '#a0a0a0',
        },
        line: {
          soft: '#e5e5e0',
        },
        highlight: {
          yellow: '#F8E16C',
          green: '#C8E6C9',
          blue: '#BBDEFB',
          pink: '#F8BBD9',
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
        'paper': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'sticky': '0 2px 8px rgba(0,0,0,0.06)',
        'card': '0 1px 4px rgba(0,0,0,0.05)',
      },
      borderRadius: {
        'sketch': '2px',
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        green: {
          DEFAULT: '#49ab81',
          deep: '#285236',
          tint: '#eef6f1',
        },
        ink: {
          DEFAULT: '#1c1c1c',
          soft: '#3a3a3a',
        },
        label: {
          DEFAULT: '#9a9a9a',
          soft: '#b4b4b4',
        },
        hair: {
          DEFAULT: '#e7e7e7',
          strong: '#d6d6d6',
        },
        paper: '#ffffff',
        page: '#f6f6f4',
        amber: {
          DEFAULT: '#bf8a2c',
          tint: '#f8f1e3',
        },
        red: {
          DEFAULT: '#bb524c',
          tint: '#f7ece9',
        },
      },
      fontFamily: {
        serif: ['Spectral', 'Georgia', 'serif'],
        sans: ['Archivo', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

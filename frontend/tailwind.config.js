/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans Thai', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#1F4E79',
          light:   '#2E75B6',
          pale:    '#D6E4F0',
        },
      },
    },
  },
  plugins: [],
}

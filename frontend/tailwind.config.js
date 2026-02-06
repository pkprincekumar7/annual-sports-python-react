/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-yellow': '#ffe66d',
        'primary-dark': '#050716',
        'primary-blue': '#007bff',
        'primary-magenta': '#ff4dff',
      },
    },
  },
  plugins: [],
}


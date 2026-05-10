/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        platform: {
          xhs: '#FF2442',
          bili: '#FB7299',
          wxch: '#07C160',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

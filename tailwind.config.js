/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FFFAF5',
          100: '#FDF6EC',
          200: '#FAE8D0',
        },
        rose: {
          warm: '#C9736A',
          light: '#E8A09A',
          dark: '#A85A52',
        },
        amber: {
          warm: '#E8A87C',
          light: '#F2C9A8',
          dark: '#C4825A',
        },
        charcoal: {
          warm: '#3D2C2C',
          mid: '#6B4F4F',
          light: '#9B7B7B',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      backgroundImage: {
        'warm-gradient': 'linear-gradient(135deg, #FDF6EC 0%, #FAE8D0 50%, #F2C9A8 100%)',
      },
    },
  },
  plugins: [],
}

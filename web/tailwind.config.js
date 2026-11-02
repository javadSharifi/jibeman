/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#05060D',
        sheet: '#0D1230',
        dock: '#11162F',
        surface: '#131936',
        surface2: '#1C2347',
        line: 'rgba(255, 255, 255, 0.08)',
        lineStrong: 'rgba(255, 255, 255, 0.16)',
        primary: '#3880F2',
        primaryStrong: '#2F6FDC',
        sky: '#6A9EFA',
        lime: '#E8FCB4',
        onLime: '#14265C',
        muted: '#8C94B8',
        t2: 'rgba(255, 255, 255, 0.74)',
        ok: '#7BE3B0',
        warn: '#FFC977',
        bad: '#FF8A9A',
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
      boxShadow: {
        dock: '0 12px 30px rgba(0, 0, 0, 0.55)',
        card: '0 10px 24px rgba(8, 28, 90, 0.35)',
        fab: '0 10px 22px rgba(232, 252, 180, 0.25)',
      }
    },
  },
  plugins: [],
}

import { createRequire } from 'node:module'
import path from 'node:path'
import { heroui } from '@heroui/react'

// Resolve @heroui/theme's compiled styles no matter how the package manager
// hoists it. npm often NESTS it under @heroui/react/node_modules, and the class
// strings Tailwind must scan live in `.mjs` files — both facts break the naive
// `./node_modules/@heroui/theme/...` glob and cause utilities like `inline-flex`
// to be purged (making HeroUI buttons collapse). We derive the real dist path.
// Resolve @heroui/theme starting FROM @heroui/react, so it's found whether the
// package manager hoisted it to the top level or nested it under @heroui/react.
const require = createRequire(import.meta.url)
const requireFromReact = createRequire(require.resolve('@heroui/react/package.json'))
const heroUIThemeDist = path.join(
  path.dirname(requireFromReact.resolve('@heroui/theme/package.json')),
  'dist/**/*.{js,mjs}',
)

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    heroUIThemeDist,
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    heroui({
      // The UI ships dark-first to match the reference design, but both themes
      // are fully wired. Toggle via the ThemeProvider (see src/providers).
      themes: {
        dark: {
          colors: {
            background: '#0a0a0a',
            foreground: '#ededed',
            content1: '#161616',
            content2: '#1f1f1f',
            content3: '#282828',
            focus: '#3b82f6',
            primary: {
              DEFAULT: '#3b82f6',
              foreground: '#ffffff',
            },
          },
        },
        light: {
          colors: {
            background: '#ffffff',
            foreground: '#111111',
            primary: {
              DEFAULT: '#2563eb',
              foreground: '#ffffff',
            },
          },
        },
      },
    }),
  ],
}

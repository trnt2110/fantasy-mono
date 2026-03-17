import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

function prerenderLandingPlugin(): Plugin {
  return {
    name: 'prerender-landing',
    apply: 'build',
    async closeBundle() {
      try {
        const { renderToString } = await import('react-dom/server')
        const { createElement } = await import('react')
        const { HelmetProvider } = await import('react-helmet-async')
        const { StaticRouter } = await import('react-router-dom')
        const { Landing } = await import('./src/pages/Landing.tsx')

        const helmetContext: Record<string, any> = {}

        const html = renderToString(
          createElement(HelmetProvider, { context: helmetContext },
            createElement(StaticRouter, { location: '/' },
              createElement(Landing)
            )
          )
        )

        const indexPath = resolve(__dirname, 'dist/index.html')
        let template = readFileSync(indexPath, 'utf-8')

        // Inject pre-rendered HTML into the root div
        template = template.replace(
          '<div id="root"></div>',
          `<div id="root">${html}</div>`,
        )

        // Inject helmet-collected meta tags into <head>
        const { helmet } = helmetContext as { helmet?: any }
        if (helmet) {
          template = template.replace(
            '</head>',
            `${helmet.title.toString()}${helmet.meta.toString()}${helmet.link.toString()}</head>`,
          )
        }

        writeFileSync(indexPath, template)
        console.log('✓ Landing page pre-rendered into dist/index.html')
      } catch (e) {
        console.warn('Pre-render skipped:', (e as Error).message)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), prerenderLandingPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})

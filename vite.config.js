import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
      {
        name: 'cloudflare-pages-sync-dev',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/sync' || req.url.startsWith('/api/sync?')) {
              if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
                res.statusCode = 204
                return res.end()
              }
              if (req.method === 'POST') {
                let body = ''
                req.on('data', (chunk) => {
                  body += chunk
                })
                req.on('end', async () => {
                  try {
                    const { onRequestPost } = await import('./functions/api/sync.js')
                    const webReq = new Request('http://localhost' + req.url, {
                      method: 'POST',
                      headers: req.headers,
                      body: body,
                    })
                    const context = {
                      request: webReq,
                      env: {
                        DATABASE_URL: env.DATABASE_URL || process.env.DATABASE_URL,
                      },
                    }
                    const webRes = await onRequestPost(context)
                    res.statusCode = webRes.status
                    webRes.headers.forEach((val, key) => {
                      res.setHeader(key, val)
                    })
                    const resText = await webRes.text()
                    res.end(resText)
                  } catch (err) {
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ error: err.message }))
                  }
                })
                return
              }
            }
            next()
          })
        },
      },
    ],
  }
})

import 'dotenv/config'

import { toNodeHandler } from 'better-auth/node'
import express from 'express'

import { auth } from './auth'

/**
 * ResumeMaxxer auth service.
 *
 * A thin Express wrapper whose only job is to mount Better Auth at
 * `/api/auth/*` and get CORS right, because the browser calls it cross-origin
 * from the Vite app on :5173.
 */

const PORT = Number(process.env.PORT ?? 3000)
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

const app = express()

// --- CORS ------------------------------------------------------------------
// Written by hand rather than pulled from the `cors` package: the rules here
// are small and getting them exactly right matters more than brevity.
//
// `Access-Control-Allow-Credentials: true` requires an explicit origin - the
// wildcard is rejected by browsers in that combination - and credentials are
// required because the session lives in a cookie.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin === FRONTEND_URL) {
    res.header('Access-Control-Allow-Origin', origin)
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    // Better Auth returns the freshly minted JWT in this header; without
    // exposing it, browser JS cannot read it cross-origin.
    res.header('Access-Control-Expose-Headers', 'set-auth-jwt, set-auth-token')
    res.header('Access-Control-Max-Age', '600')
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

// --- Better Auth -----------------------------------------------------------
// IMPORTANT: this must be mounted BEFORE express.json(). Better Auth reads the
// raw request body itself, and a body parser that has already consumed the
// stream leaves it hanging.
app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ResumeMaxxer auth', baseURL: auth.options.baseURL })
})

app.listen(PORT, () => {
  console.log(`ResumeMaxxer auth listening on http://localhost:${PORT}`)
  console.log(`  JWKS:  http://localhost:${PORT}/api/auth/jwks`)
  console.log(`  Token: http://localhost:${PORT}/api/auth/token`)
})

/**
 * Next.js Integration Examples
 *
 * Extracted from integration-nextjs.md
 */

// @ts-nocheck
import { createScope, flow, tag, type Flow, type Core } from '@pumped-fn/core-next'

type NextApiRequest = { query: Record<string, string | string[] | undefined>; body: any; method?: string }
type NextApiResponse = { status: (code: number) => NextApiResponse; json: (data: any) => void }
type NextRequest = { url: string; nextUrl: { searchParams: URLSearchParams } }
type NextResponse = { json: (data: any, init?: ResponseInit) => any }
const NextResponse = { json: (data: any, init?: ResponseInit) => ({ data, init }) }
type GetServerSideProps = (context: { params: any; req: any; res: any }) => Promise<{ props: any }>
type GetStaticProps = (context: { params: any }) => Promise<{ props: any }>
type GetStaticPaths = () => Promise<{ paths: any[]; fallback: boolean }>
const revalidatePath = (path: string) => {}

// ============================================================================
// NEXT.JS INTEGRATION
// ============================================================================

/**
 * Next.js Module-level Scope
 *
 * Create scope in shared module, import where needed.
 *
 * Referenced in: integration-nextjs.md
 * Section: Create Module-level Scope
 */
const dbConfigTag = tag('db-config', {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'app',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
})

const apiKeyTag = tag('api-key', process.env.API_KEY || '')

export const nextjsModuleScope = createScope(dbConfigTag, apiKeyTag)

/**
 * Next.js Server Component Flow
 *
 * Use scope directly in Server Components.
 *
 * Referenced in: integration-nextjs.md
 * Section: Server Components with Flow Execution
 */
export const nextjsListUsersFlow = flow(async (ctx: Core.Context, input: {}) => {
  return { success: true, users: [{ id: '1', name: 'Alice', email: 'alice@example.com' }] }
})

/**
 * Next.js Server Action Flow
 *
 * Use "use server" directive with scope for mutations.
 *
 * Referenced in: integration-nextjs.md
 * Section: Server Actions for Mutations
 */
export const nextjsCreateUserFlow = flow(async (ctx: Core.Context, input: { email: string; name: string }) => {
  return { success: true, user: { id: '1', email: input.email, name: input.name } }
})

export const nextjsUpdateUserFlow = flow(async (ctx: Core.Context, input: { id: string; email: string; name: string }) => {
  return { success: true, user: { id: input.id, email: input.email, name: input.name } }
})

export const nextjsDeleteUserFlow = flow(async (ctx: Core.Context, input: { id: string }) => {
  return { success: true }
})

/**
 * Next.js App Router Route Handler GET
 *
 * Route handlers with scope for API routes.
 *
 * Referenced in: integration-nextjs.md
 * Section: Route Handlers with Scope
 */
export const nextjsAppRouterGetHandler = async (request: NextRequest, scope: any) => {
  const result = await scope.exec(nextjsListUsersFlow, {})

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }

  return NextResponse.json(result.users)
}

/**
 * Next.js App Router Route Handler POST
 *
 * POST handler with error status mapping.
 *
 * Referenced in: integration-nextjs.md
 * Section: Route Handlers with Scope
 */
export const nextjsAppRouterPostHandler = async (request: NextRequest, scope: any) => {
  const body = await request.json()

  const result = await scope.exec(nextjsCreateUserFlow, {
    email: body.email,
    name: body.name
  })

  if (!result.success) {
    const statusMap = {
      INVALID_EMAIL: 400,
      EMAIL_EXISTS: 409,
      NAME_TOO_SHORT: 400
    }
    return NextResponse.json(
      { error: result.reason },
      { status: statusMap[result.reason] || 400 }
    )
  }

  return NextResponse.json(result.user, { status: 201 })
}

/**
 * Next.js Dynamic Route Handler Flow
 *
 * Dynamic route params with flow execution.
 *
 * Referenced in: integration-nextjs.md
 * Section: Dynamic Route Handlers
 */
export const nextjsGetUserFlow = flow(async (ctx: Core.Context, input: { id: string }) => {
  return { success: true, user: { id: input.id, name: 'Alice', email: 'alice@example.com' } }
})

export const nextjsDynamicGetHandler = async (
  request: NextRequest,
  params: { id: string },
  scope: any
) => {
  const result = await scope.exec(nextjsGetUserFlow, { id: params.id })

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 404 })
  }

  return NextResponse.json(result.user)
}

export const nextjsDynamicPutHandler = async (
  request: NextRequest,
  params: { id: string },
  scope: any
) => {
  const body = await request.json()

  const result = await scope.exec(nextjsUpdateUserFlow, {
    id: params.id,
    email: body.email,
    name: body.name
  })

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 400 })
  }

  return NextResponse.json(result.user)
}

export const nextjsDynamicDeleteHandler = async (
  request: NextRequest,
  params: { id: string },
  scope: any
) => {
  const result = await scope.exec(nextjsDeleteUserFlow, { id: params.id })

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

/**
 * Next.js Pages Router API Handler
 *
 * API routes with Next.js Pages Router.
 *
 * Referenced in: integration-nextjs.md
 * Section: API Routes Pattern (Pages Router)
 */
export const nextjsPagesApiHandler = async (req: NextApiRequest, res: NextApiResponse, scope: any) => {
  if (req.method === 'GET') {
    const result = await scope.exec(nextjsListUsersFlow, {})

    if (!result.success) {
      return res.status(500).json({ error: result.reason })
    }

    return res.status(200).json(result.users)
  }

  if (req.method === 'POST') {
    const result = await scope.exec(nextjsCreateUserFlow, {
      email: req.body.email,
      name: req.body.name
    })

    if (!result.success) {
      const statusMap = {
        INVALID_EMAIL: 400,
        EMAIL_EXISTS: 409,
        NAME_TOO_SHORT: 400
      }
      return res.status(statusMap[result.reason] || 400).json({
        error: result.reason
      })
    }

    return res.status(201).json(result.user)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * Next.js getServerSideProps Pattern
 *
 * SSR data fetching with flows.
 *
 * Referenced in: integration-nextjs.md
 * Section: Server-side Rendering (getServerSideProps)
 */
export const nextjsGetServerSidePropsExample: GetServerSideProps = async () => {
  const scope = nextjsModuleScope
  const result = await scope.exec(nextjsListUsersFlow, {})

  if (!result.success) {
    return {
      props: { users: [], error: result.reason }
    }
  }

  return {
    props: { users: result.users, error: null }
  }
}

/**
 * Next.js getStaticPaths Pattern
 *
 * Generate static paths from flow data.
 *
 * Referenced in: integration-nextjs.md
 * Section: Static Site Generation (getStaticProps)
 */
export const nextjsGetStaticPathsExample: GetStaticPaths = async () => {
  const scope = nextjsModuleScope
  const result = await scope.exec(nextjsListUsersFlow, {})

  if (!result.success) {
    return { paths: [], fallback: 'blocking' }
  }

  const paths = result.users.map(user => ({
    params: { id: user.id }
  }))

  return { paths, fallback: 'blocking' }
}

/**
 * Next.js getStaticProps Pattern
 *
 * SSG data fetching with flows and revalidation.
 *
 * Referenced in: integration-nextjs.md
 * Section: Static Site Generation (getStaticProps)
 */
export const nextjsGetStaticPropsExample: GetStaticProps = async ({ params }) => {
  const scope = nextjsModuleScope
  const result = await scope.exec(nextjsGetUserFlow, { id: params?.id as string })

  if (!result.success) {
    return { notFound: true }
  }

  return {
    props: { user: result.user },
    revalidate: 60
  }
}

/**
 * Next.js Middleware Flow
 *
 * Edge middleware with flow for session validation.
 *
 * Referenced in: integration-nextjs.md
 * Section: Middleware Pattern
 */
export const nextjsValidateSessionFlow = flow(async (ctx: Core.Context, input: { token: string }) => {
  return { success: true, userId: 'user-123' }
})

export const nextjsMiddlewareHandler = async (request: NextRequest, scope: any) => {
  const sessionToken = request.cookies.get('session')?.value

  if (!sessionToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const result = await scope.exec(nextjsValidateSessionFlow, { token: sessionToken })

  if (!result.success) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const response = NextResponse.next()
  response.headers.set('x-user-id', result.userId)

  return response
}

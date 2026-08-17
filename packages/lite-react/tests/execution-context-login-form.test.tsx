import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { createScope, flow, resource } from '@pumped-fn/lite'
import { ExecutionContextProvider, scopedValue, useScopedValue } from '../src'

type LoginSnapshot = {
  email: string
  password: string
  status: 'editing' | 'submitting' | 'submitted' | 'error'
  error: string | null
}

type LoginResult = { email: string }

function initialLoginSnapshot(): LoginSnapshot {
  return {
    email: '',
    password: '',
    status: 'editing',
    error: null,
  }
}

const auth = resource({
  name: 'auth',
  factory: () => ({
    login(input: { email: string; password: string }): Promise<LoginResult | { error: string }> {
      return Promise.resolve(input.password === 'fail'
        ? { error: 'Invalid credentials' }
        : { email: input.email })
    },
  }),
})

const loginForm = scopedValue({
  name: 'login-form',
  deps: { auth },
  initial: () => initialLoginSnapshot(),
  actions: ({ get, patch }, { auth }) => ({
    setEmail(email: string) {
      patch({ email, status: 'editing', error: null })
    },
    setPassword(password: string) {
      patch({ password, status: 'editing', error: null })
    },
    submit(): Promise<LoginResult | undefined> {
      const snapshot = get()
      if (!snapshot.email.includes('@')) {
        patch({ status: 'error', error: 'Enter a valid email' })
        return Promise.resolve(undefined)
      }
      if (!snapshot.password) {
        patch({ status: 'error', error: 'Password is required' })
        return Promise.resolve(undefined)
      }

      patch({ status: 'submitting', error: null })
      return auth.login({ email: snapshot.email, password: snapshot.password }).then(
        (result) => {
          if ('error' in result) {
            patch({ status: 'error', error: result.error })
            return undefined
          }
          patch({ status: 'submitted', error: null })
          return result
        },
        (error: unknown) => {
          patch({ status: 'error', error: error instanceof Error ? error.message : String(error) })
          return undefined
        },
      )
    },
  }),
})

const readLoginForm = flow({
  name: 'login-form-read',
  deps: { form: loginForm },
  factory: (_ctx, { form }) => form,
})

function LoginForm() {
  const form = useScopedValue(loginForm)

  return (
    <form onSubmit={(event) => { event.preventDefault(); void form.actions.submit() }}>
      <label>
        Email
        <input value={form.snapshot.email} onChange={(event) => form.actions.setEmail(event.currentTarget.value)} />
      </label>
      <label>
        Password
        <input value={form.snapshot.password} onChange={(event) => form.actions.setPassword(event.currentTarget.value)} />
      </label>
      <button type="submit" disabled={form.snapshot.status === 'submitting'}>Sign in</button>
      <div data-testid="draft">{form.snapshot.email}:{form.snapshot.password}</div>
      <div data-testid="status">{form.snapshot.status}</div>
      {form.snapshot.error ? <div role="alert">{form.snapshot.error}</div> : null}
    </form>
  )
}

describe('scopedValue login form', () => {
  it('runs the production login form dependency graph without React', async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    const form = await loginForm.resolve(ctx)

    await form.actions.submit()
    expect(form.getSnapshot()).toMatchObject({ status: 'error', error: 'Enter a valid email' })

    form.actions.setEmail('a@example.com')
    await form.actions.submit()
    expect(form.getSnapshot()).toMatchObject({ status: 'error', error: 'Password is required' })

    form.actions.setPassword('fail')
    await form.actions.submit()
    expect(form.getSnapshot()).toMatchObject({ status: 'error', error: 'Invalid credentials' })

    form.actions.setPassword('secret')
    await expect(form.actions.submit()).resolves.toEqual({ email: 'a@example.com' })
    expect(form.getSnapshot()).toMatchObject({ status: 'submitted', error: null })
    await expect(loginForm.resolve(ctx)).resolves.toBe(form)
    await expect(ctx.exec({ flow: readLoginForm })).resolves.toBe(form)

    await ctx.close()

    expect(form.disposed).toBe(true)
    expect(() => { form.actions.setEmail('later@example.com') }).toThrow('Scoped value is disposed')

    const nextCtx = scope.createContext()
    const nextForm = await loginForm.resolve(nextCtx)

    expect(nextForm).not.toBe(form)
    expect(nextForm.getSnapshot()).toEqual(initialLoginSnapshot())

    await nextCtx.close()
    await scope.dispose()
  })

  it('disposes scoped value access on owner release and resolves a fresh value', async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    const form = await loginForm.resolve(ctx)
    form.actions.setEmail('a@example.com')

    await ctx.release(loginForm)

    expect(form.disposed).toBe(true)
    expect(() => { form.actions.setEmail('later@example.com') }).toThrow('Scoped value is disposed')

    const nextForm = await loginForm.resolve(ctx)
    expect(nextForm).not.toBe(form)
    expect(nextForm.getSnapshot()).toEqual(initialLoginSnapshot())

    await ctx.close()
    await scope.dispose()
  })

  it('renders the scoped login form at the React boundary without manual wiring', async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    const firstRender = render(
      <ExecutionContextProvider ctx={ctx}>
        <Suspense fallback={<div data-testid="status">loading</div>}>
          <LoginForm />
        </Suspense>
      </ExecutionContextProvider>
    )

    await screen.findByLabelText('Email')
    const firstForm = await loginForm.resolve(ctx)

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fail' } })

    expect(screen.getByTestId('draft')).toHaveTextContent('a@example.com:fail')
    expect(firstForm.getSnapshot()).toMatchObject({ email: 'a@example.com', password: 'fail' })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('submitted')).toBeInTheDocument()
    await expect(loginForm.resolve(ctx)).resolves.toBe(firstForm)

    firstRender.unmount()
    await ctx.close()

    expect(firstForm.disposed).toBe(true)
    expect(() => { firstForm.actions.setEmail('later@example.com') }).toThrow('Scoped value is disposed')

    const nextCtx = scope.createContext()

    render(
      <ExecutionContextProvider ctx={nextCtx}>
        <Suspense fallback={<div data-testid="status">loading</div>}>
          <LoginForm />
        </Suspense>
      </ExecutionContextProvider>
    )

    await screen.findByLabelText('Email')
    expect(screen.getByTestId('draft')).toHaveTextContent(':')
    await expect(loginForm.resolve(nextCtx)).resolves.not.toBe(firstForm)

    await nextCtx.close()
    await scope.dispose()
  })

  it('can read scoped values without Suspense and select from snapshots', async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    function StatusView() {
      const status = useScopedValue(loginForm, {
        suspense: false,
        select: (snapshot: LoginSnapshot) => snapshot.status,
      })
      return <div>status:{status.status};data:{status.data ?? 'none'};error:{status.error?.message ?? 'none'}</div>
    }

    render(
      <ExecutionContextProvider ctx={ctx}>
        <StatusView />
      </ExecutionContextProvider>
    )

    expect(screen.getByText('status:loading;data:none;error:none')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('status:ready;data:editing;error:none')).toBeInTheDocument()
    })

    const form = await loginForm.resolve(ctx)
    form.actions.setEmail('a@example.com')
    expect(screen.getByText('status:ready;data:editing;error:none')).toBeInTheDocument()

    await form.actions.submit()
    await waitFor(() => {
      expect(screen.getByText('status:ready;data:error;error:none')).toBeInTheDocument()
    })

    await ctx.close()
    await scope.dispose()
  })
})

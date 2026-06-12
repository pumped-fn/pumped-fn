import { atom, flow, typed } from "@pumped-fn/lite"

export interface Message {
  to: string
  subject: string
  body: string
}

export interface SentMail extends Message {
  readonly id: string
}

export interface Mailer {
  readonly outbox: readonly SentMail[]
  send(message: Message): Promise<SentMail>
}

export interface UserRecord {
  id: string
  email: string
  name: string
}

export interface WelcomeInput {
  userId: string
}

export interface WelcomeResult {
  deliveredTo: string
  greeting: string
  receiptId: string
}

export const mailer = atom<Mailer>({
  factory: () => {
    const outbox: SentMail[] = []
    let nextId = 0

    return {
      outbox,
      async send(message) {
        const mail: SentMail = { ...message, id: `mail-${++nextId}` }
        outbox.push(mail)
        return mail
      },
    }
  },
})

export const userDirectory = atom({
  factory: () => ({
    find: (userId: string): UserRecord => ({
      id: userId,
      email: `user-${userId}@example.test`,
      name: `User ${userId}`,
    }),
  }),
})

export const welcomeTemplate = atom({
  factory: () => ({
    subject: (user: UserRecord) => `Welcome, ${user.name}`,
    body: () => "Your workspace is ready.",
  }),
})

export const sendWelcome = flow({
  name: "send-welcome",
  parse: typed<WelcomeInput>(),
  deps: {
    mailer,
    users: userDirectory,
    template: welcomeTemplate,
  },
  factory: async (ctx, { mailer, users, template }): Promise<WelcomeResult> => {
    const user = users.find(ctx.input.userId)
    const greeting = template.subject(user)
    const mail = await mailer.send({
      to: user.email,
      subject: greeting,
      body: template.body(),
    })

    return {
      deliveredTo: user.email,
      greeting,
      receiptId: mail.id,
    }
  },
})

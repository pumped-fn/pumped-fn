import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import { scopedValue } from "@pumped-fn/lite-react"

export type LaneId = "backlog" | "ready" | "doing" | "review" | "done"
export type Priority = "low" | "medium" | "high" | "urgent"

export interface Project {
  id: string
  name: string
  laneOrder: LaneId[]
  wip: Record<LaneId, number>
}

export interface User {
  id: string
  name: string
  capacity: number
}

export interface Card {
  id: string
  projectId: string
  laneId: LaneId
  title: string
  points: number
  priority: Priority
  assigneeId: string
  reviewerId: string
  dependencyIds: string[]
  labels: string[]
}

export interface KanbanState {
  projects: Map<string, Project>
  users: Map<string, User>
  cards: Map<string, Card>
  laneCardIds: Map<string, Map<LaneId, string[]>>
}

export interface BoardFilters {
  query: string
  assigneeId: string
  showBlocked: boolean
}

export interface BoardSession {
  workspaceId: string
  actorId: string
}

export interface AuditEvent {
  type: "move" | "snapshot" | "draft-save" | "rollback"
  workspaceId: string
  actorId: string
  cardId: string
  detail: string
}

export interface CardDraftState {
  title: string
  points: number
  reviewerId: string
}

export interface CardDraftActions {
  setTitle(title: string): void
  setPoints(points: number): void
  setReviewerId(reviewerId: string): void
}

export interface CardView {
  id: string
  title: string
  points: number
  priority: Priority
  assigneeName: string
  reviewerName: string
  blocked: boolean
  labels: string[]
}

export interface LaneView {
  id: LaneId
  title: string
  limit: number
  count: number
  overLimit: boolean
  cards: CardView[]
}

export interface UserWorkload {
  userId: string
  name: string
  points: number
  capacity: number
  overloaded: boolean
}

export interface BoardView {
  workspaceId: string
  project: Project
  lanes: LaneView[]
  workloads: UserWorkload[]
  warnings: string[]
  recentAudit: AuditEvent[]
  summary: {
    cards: number
    points: number
    blocked: number
    overloadedUsers: number
  }
}

export const workspaceId = tag<string>({ label: "kanban.workspace" })
export const activeProjectId = tag<string>({ label: "kanban.project" })
export const actorId = tag<string>({ label: "kanban.actor" })
export const editingCardId = tag<{ cardId: string }>({
  label: "kanban.editingCard",
  eq: (a, b) => a.cardId === b.cardId,
})

const laneTitles: Record<LaneId, string> = {
  backlog: "Backlog",
  ready: "Ready",
  doing: "Doing",
  review: "Review",
  done: "Done",
}

export function demoKanbanState(): KanbanState {
  const laneOrder: LaneId[] = ["backlog", "ready", "doing", "review", "done"]
  return {
    projects: new Map([
      ["p-web", {
        id: "p-web",
        name: "Web Experience",
        laneOrder,
        wip: { backlog: 99, ready: 3, doing: 1, review: 1, done: 99 },
      }],
      ["p-mobile", {
        id: "p-mobile",
        name: "Mobile Shell",
        laneOrder,
        wip: { backlog: 99, ready: 2, doing: 2, review: 1, done: 99 },
      }],
    ]),
    users: new Map([
      ["u1", { id: "u1", name: "Mira", capacity: 5 }],
      ["u2", { id: "u2", name: "Jules", capacity: 5 }],
      ["u3", { id: "u3", name: "Inez", capacity: 3 }],
    ]),
    cards: new Map([
      ["c-foundation", {
        id: "c-foundation",
        projectId: "p-web",
        laneId: "done",
        title: "Foundation route",
        points: 3,
        priority: "high",
        assigneeId: "u1",
        reviewerId: "u3",
        dependencyIds: [],
        labels: ["platform"],
      }],
      ["c-api", {
        id: "c-api",
        projectId: "p-web",
        laneId: "ready",
        title: "API contract",
        points: 5,
        priority: "urgent",
        assigneeId: "u2",
        reviewerId: "u1",
        dependencyIds: ["c-foundation"],
        labels: ["backend", "api"],
      }],
      ["c-login", {
        id: "c-login",
        projectId: "p-web",
        laneId: "doing",
        title: "Login shell",
        points: 3,
        priority: "high",
        assigneeId: "u2",
        reviewerId: "u3",
        dependencyIds: ["c-foundation"],
        labels: ["auth"],
      }],
      ["c-perf", {
        id: "c-perf",
        projectId: "p-web",
        laneId: "doing",
        title: "Perf budget",
        points: 4,
        priority: "medium",
        assigneeId: "u2",
        reviewerId: "u1",
        dependencyIds: ["c-api"],
        labels: ["perf"],
      }],
      ["c-copy", {
        id: "c-copy",
        projectId: "p-web",
        laneId: "review",
        title: "Empty state copy",
        points: 2,
        priority: "low",
        assigneeId: "u3",
        reviewerId: "u1",
        dependencyIds: [],
        labels: ["content"],
      }],
      ["m-shell", {
        id: "m-shell",
        projectId: "p-mobile",
        laneId: "ready",
        title: "Native shell",
        points: 8,
        priority: "high",
        assigneeId: "u1",
        reviewerId: "u2",
        dependencyIds: [],
        labels: ["mobile"],
      }],
    ]),
    laneCardIds: new Map([
      ["p-web", new Map<LaneId, string[]>([
        ["backlog", []],
        ["ready", ["c-api"]],
        ["doing", ["c-login", "c-perf"]],
        ["review", ["c-copy"]],
        ["done", ["c-foundation"]],
      ])],
      ["p-mobile", new Map<LaneId, string[]>([
        ["backlog", []],
        ["ready", ["m-shell"]],
        ["doing", []],
        ["review", []],
        ["done", []],
      ])],
    ]),
  }
}

export const boardState = atom({ factory: demoKanbanState })

export const boardFilters = atom({
  factory: (): BoardFilters => ({ query: "", assigneeId: "all", showBlocked: true }),
})

export const boardAudit = atom({ factory: (): AuditEvent[] => [] })

export const boardSession = resource({
  name: "kanban.boardSession",
  deps: { workspace: tags.required(workspaceId), actor: tags.required(actorId) },
  factory: (_ctx, { workspace, actor }): BoardSession => ({ workspaceId: workspace, actorId: actor }),
})

type AuditRecorder = {
  record(event: Pick<AuditEvent, "type" | "cardId" | "detail">): void
}

export const actionAudit = resource({
  name: "kanban.actionAudit",
  ownership: "current",
  deps: {
    audit: controller(boardAudit, { resolve: true }),
    workspace: tags.required(workspaceId),
    actor: tags.required(actorId),
  },
  factory: (ctx, { audit, workspace, actor }): AuditRecorder => {
    const events: AuditEvent[] = []
    ctx.onClose((result) => {
      if (result.ok) {
        audit.update((current) => [...current, ...events])
        return
      }
      const detail = result.error instanceof Error ? result.error.message : "action failed"
      const cardId = ctx.data.seekTag(editingCardId)?.cardId ?? "board"
      audit.update((current) => [...current, { type: "rollback", workspaceId: workspace, actorId: actor, cardId, detail }])
    })
    return {
      record: (event) => {
        events.push({ ...event, workspaceId: workspace, actorId: actor })
      },
    }
  },
})

function projectCards(state: KanbanState, project: Project): Card[] {
  const lanes = state.laneCardIds.get(project.id)!
  return project.laneOrder.flatMap((laneId) => lanes.get(laneId)!.map((cardId) => state.cards.get(cardId)!))
}

function blockedCardIds(cards: Card[], doneIds: Set<string>): Set<string> {
  return new Set(cards.filter((card) => card.dependencyIds.some((id) => !doneIds.has(id))).map((card) => card.id))
}

function visibleCard(card: Card, filters: BoardFilters, blocked: boolean): boolean {
  const query = filters.query.trim().toLowerCase()
  const text = `${card.title} ${card.labels.join(" ")}`.toLowerCase()
  return (
    (query === "" || text.includes(query)) &&
    (filters.assigneeId === "all" || filters.assigneeId === card.assigneeId) &&
    (filters.showBlocked || !blocked)
  )
}

function buildWorkloads(state: KanbanState, cards: Card[]): UserWorkload[] {
  const points = new Map([...state.users.keys()].map((id) => [id, 0]))
  for (const card of cards) {
    if (card.laneId !== "done") points.set(card.assigneeId, points.get(card.assigneeId)! + card.points)
  }
  return [...state.users.values()].map((user) => {
    const userPoints = points.get(user.id)!
    return {
      userId: user.id,
      name: user.name,
      points: userPoints,
      capacity: user.capacity,
      overloaded: userPoints > user.capacity,
    }
  })
}

function buildBoardView(
  state: KanbanState,
  filters: BoardFilters,
  audit: AuditEvent[],
  workspace: string,
  projectId: string,
): BoardView {
  const project = state.projects.get(projectId)!
  const lanes = state.laneCardIds.get(project.id)!
  const cards = projectCards(state, project)
  const doneIds = new Set(lanes.get("done")!)
  const blocked = blockedCardIds(cards, doneIds)
  const workloads = buildWorkloads(state, cards)
  const views = project.laneOrder.map((laneId) => {
    const allLaneCards = lanes.get(laneId)!.map((cardId) => state.cards.get(cardId)!)
    const visible = allLaneCards
      .filter((card) => visibleCard(card, filters, blocked.has(card.id)))
      .map((card) => {
        const assignee = state.users.get(card.assigneeId)!
        const reviewer = state.users.get(card.reviewerId)!
        return {
          id: card.id,
          title: card.title,
          points: card.points,
          priority: card.priority,
          assigneeName: assignee.name,
          reviewerName: reviewer.name,
          blocked: blocked.has(card.id),
          labels: card.labels,
        }
      })
    const limit = project.wip[laneId]
    return {
      id: laneId,
      title: laneTitles[laneId],
      limit,
      count: allLaneCards.length,
      overLimit: allLaneCards.length > limit,
      cards: visible,
    }
  })
  const visibleCards = views.flatMap((lane) => lane.cards)
  const overloaded = workloads.filter((workload) => workload.overloaded)
  const wipWarnings = views
    .filter((lane) => lane.overLimit)
    .map((lane) => `${lane.id} exceeds WIP ${lane.count}/${lane.limit}`)
  const warnings = [
    ...wipWarnings,
    ...overloaded.map((workload) => `${workload.name} exceeds capacity ${workload.points}/${workload.capacity}`),
    ...(blocked.size === 0 ? [] : [`${blocked.size} blocked card`]),
  ]
  return {
    workspaceId: workspace,
    project,
    lanes: views,
    workloads,
    warnings,
    recentAudit: audit.slice(-3),
    summary: {
      cards: visibleCards.length,
      points: visibleCards.reduce((sum, card) => sum + card.points, 0),
      blocked: visibleCards.filter((card) => card.blocked).length,
      overloadedUsers: overloaded.length,
    },
  }
}

export const boardView = atom({
  deps: {
    state: controller(boardState, { resolve: true, watch: true }),
    filters: controller(boardFilters, { resolve: true, watch: true }),
    audit: controller(boardAudit, { resolve: true, watch: true }),
    workspace: tags.required(workspaceId),
    project: tags.required(activeProjectId),
  },
  factory: (_ctx, { state, filters, audit, workspace, project }) =>
    buildBoardView(state.get(), filters.get(), audit.get(), workspace, project),
})

function cloneLaneCardIds(state: KanbanState): Map<string, Map<LaneId, string[]>> {
  return new Map(
    [...state.laneCardIds].map(([projectId, lanes]) => [
      projectId,
      new Map([...lanes].map(([laneId, cardIds]) => [laneId, [...cardIds]])),
    ]),
  )
}

function replaceCard(state: KanbanState, card: Card): KanbanState {
  const cards = new Map(state.cards)
  cards.set(card.id, card)
  return { ...state, cards }
}

function requireActiveProjectCard(state: KanbanState, cardId: string, projectId: string): Card {
  const card = state.cards.get(cardId)!
  if (card.projectId !== projectId) throw new Error(`card ${cardId} is not in active project ${projectId}`)
  return card
}

function moveCardInState(state: KanbanState, cardId: string, projectId: string, toLaneId: LaneId, toIndex: number): KanbanState {
  const card = requireActiveProjectCard(state, cardId, projectId)
  const project = state.projects.get(card.projectId)!
  if (!project.laneOrder.includes(toLaneId)) throw new Error(`lane ${toLaneId} is not in project ${project.id}`)
  const laneCardIds = cloneLaneCardIds(state)
  const lanes = laneCardIds.get(project.id)!
  const fromLane = lanes.get(card.laneId)!
  lanes.set(card.laneId, fromLane.filter((id) => id !== cardId))
  const targetLane = lanes.get(toLaneId)!
  targetLane.splice(toIndex, 0, cardId)
  return { ...replaceCard(state, { ...card, laneId: toLaneId }), laneCardIds }
}

export const summarizeCard = flow({
  name: "kanban.summarizeCard",
  parse: typed<{ cardId: string }>(),
  deps: { state: controller(boardState, { resolve: true }), audit: actionAudit },
  factory: (ctx, { state, audit }) => {
    const card = state.get().cards.get(ctx.input.cardId)
    if (!card) throw new Error(`card ${ctx.input.cardId} not found`)
    audit.record({ type: "snapshot", cardId: card.id, detail: `${card.laneId}:${card.points}` })
    return { cardId: card.id, laneId: card.laneId, points: card.points }
  },
})

export const moveCard = flow({
  name: "kanban.moveCard",
  parse: typed<{ cardId: string; toLaneId: LaneId; toIndex: number }>(),
  deps: {
    state: controller(boardState, { resolve: true }),
    audit: actionAudit,
    actor: tags.required(actorId),
    projectId: tags.required(activeProjectId),
    summarizeCard: controller(summarizeCard),
  },
  factory: async (ctx, { state, audit, actor, projectId, summarizeCard }) => {
    const before = state.get().cards.get(ctx.input.cardId)
    if (!before) throw new Error(`card ${ctx.input.cardId} not found`)
    state.set(moveCardInState(state.get(), ctx.input.cardId, projectId, ctx.input.toLaneId, ctx.input.toIndex))
    audit.record({
      type: "move",
      cardId: ctx.input.cardId,
      detail: `${actor}:${before.laneId}->${ctx.input.toLaneId}`,
    })
    return summarizeCard.exec({ input: { cardId: ctx.input.cardId } })
  },
})

export const cardDraft = scopedValue({
  name: "kanban.cardDraft",
  deps: {
    state: controller(boardState, { resolve: true }),
    editing: tags.required(editingCardId),
    projectId: tags.required(activeProjectId),
  },
  initial: (_ctx, { state, editing, projectId }) => {
    const { cardId } = editing
    const card = state.get().cards.get(cardId)
    if (!card) throw new Error(`card ${cardId} not found`)
    if (card.projectId !== projectId) throw new Error(`card ${cardId} is not in active project ${projectId}`)
    return { title: card.title, points: card.points, reviewerId: card.reviewerId }
  },
  actions: (helpers): CardDraftActions => ({
    setTitle: (title: string) => helpers.patch({ title }),
    setPoints: (points: number) => helpers.patch({ points }),
    setReviewerId: (reviewerId: string) => helpers.patch({ reviewerId }),
  }),
})

export const saveCardDraft = flow({
  name: "kanban.saveCardDraft",
  deps: {
    state: controller(boardState, { resolve: true }),
    audit: actionAudit,
    draft: cardDraft,
    editing: tags.required(editingCardId),
    actor: tags.required(actorId),
    projectId: tags.required(activeProjectId),
  },
  factory: (_ctx, { state, audit, draft, editing, actor, projectId }) => {
    const { cardId } = editing
    const snapshot = draft.get()
    const title = snapshot.title.trim()
    if (title.length === 0) throw new Error("card title is required")
    const current = state.get()
    const card = current.cards.get(cardId)
    if (!card) throw new Error(`card ${cardId} not found`)
    if (card.projectId !== projectId) throw new Error(`card ${cardId} is not in active project ${projectId}`)
    if (!current.users.has(snapshot.reviewerId)) throw new Error(`reviewer ${snapshot.reviewerId} not found`)
    const updated = { ...card, title, points: snapshot.points, reviewerId: snapshot.reviewerId }
    state.set(replaceCard(current, updated))
    audit.record({ type: "draft-save", cardId, detail: `${actor}:${title}` })
    return updated
  },
})

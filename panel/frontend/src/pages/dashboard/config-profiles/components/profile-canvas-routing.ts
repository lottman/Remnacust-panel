export interface CanvasCard {
    id: string
    x: number
    y: number
}

export type RoutePoint = { x: number; y: number }

const width = 232
const height = 72
const clearance = 14
const laneOffset = 24

type Curve = [RoutePoint, RoutePoint, RoutePoint, RoutePoint]

function midpoint(a: RoutePoint, b: RoutePoint): RoutePoint {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// Subdivision tests the whole curve, not just a few sampled pixels.
function curveHitsCard(curve: Curve, card: CanvasCard, depth = 0): boolean {
    const xs = curve.map((p) => p.x)
    const ys = curve.map((p) => p.y)
    if (
        Math.max(...xs) <= card.x - 8 ||
        Math.min(...xs) >= card.x + width + 8 ||
        Math.max(...ys) <= card.y - 8 ||
        Math.min(...ys) >= card.y + height + 8
    )
        return false
    if (depth === 12) return true
    const [a, b, c, d] = curve
    const ab = midpoint(a, b),
        bc = midpoint(b, c),
        cd = midpoint(c, d)
    const abc = midpoint(ab, bc),
        bcd = midpoint(bc, cd),
        center = midpoint(abc, bcd)
    return (
        curveHitsCard([a, ab, abc, center], card, depth + 1) ||
        curveHitsCard([center, bcd, cd, d], card, depth + 1)
    )
}

function curveCommand(curve: Curve): string {
    return `C ${curve[1].x} ${curve[1].y}, ${curve[2].x} ${curve[2].y}, ${curve[3].x} ${curve[3].y}`
}

function smoothLink(from: CanvasCard, to: CanvasCard, cards: CanvasCard[]): string | null {
    const start = { x: from.x + width, y: from.y + height / 2 }
    const end = { x: to.x, y: to.y + height / 2 }
    if (end.x <= start.x) return null
    const obstacles = cards.filter(
        (card) =>
            card.id !== from.id && card.id !== to.id && card.x < end.x && card.x + width > start.x
    )
    const clear = (curve: Curve) => !obstacles.some((card) => curveHitsCard(curve, card))
    const bend = Math.max(20, (end.x - start.x) / 2)
    const original: Curve = [
        start,
        { x: start.x + bend, y: start.y },
        { x: end.x - bend, y: end.y },
        end
    ]
    if (clear(original)) return `M ${start.x} ${start.y} ${curveCommand(original)}`

    // Prefer a local passage immediately above/below the obstructing card.
    // Horizontal tangents at every join retain the original flowing style.
    let bestCurves: Curve[] | undefined
    let bestLength = Infinity
    const consider = (curves: Curve[]) => {
        if (!curves.every(clear)) return
        let length = 0
        for (const curve of curves) {
            let previous = curve[0]
            for (let i = 1; i <= 16; i++) {
                const t = i / 16,
                    u = 1 - t
                const point = {
                    x:
                        u ** 3 * curve[0].x +
                        3 * u ** 2 * t * curve[1].x +
                        3 * u * t ** 2 * curve[2].x +
                        t ** 3 * curve[3].x,
                    y:
                        u ** 3 * curve[0].y +
                        3 * u ** 2 * t * curve[1].y +
                        3 * u * t ** 2 * curve[2].y +
                        t ** 3 * curve[3].y
                }
                length += Math.hypot(point.x - previous.x, point.y - previous.y)
                previous = point
            }
        }
        // Prefer an early local crossing over a long descent beside the whole column.
        length += Math.abs(curves[0][3].y - start.y) * 0.35
        if (length < bestLength) {
            bestLength = length
            bestCurves = curves
        }
    }
    for (const card of obstacles) {
        for (const y of [card.y + height + clearance, card.y - clearance]) {
            const before = { x: card.x - clearance, y }
            const after = { x: card.x + width + clearance, y }
            if (before.x <= start.x || after.x >= end.x) continue
            const approach = Math.min(laneOffset, (before.x - start.x) / 2)
            const departure = Math.max(20, (end.x - after.x) / 2)
            consider([
                [
                    start,
                    { x: start.x + approach, y: start.y },
                    { x: before.x - approach, y },
                    before
                ],
                [before, { x: before.x + width / 3, y }, { x: after.x - width / 3, y }, after],
                [after, { x: after.x + departure, y }, { x: end.x - departure, y: end.y }, end]
            ])
        }
    }

    const exitX = start.x + laneOffset
    const turns = [
        ...new Set([
            start.y,
            end.y,
            ...obstacles.flatMap((card) => [card.y - clearance, card.y + height + clearance])
        ])
    ].sort((a, b) => Math.abs(a - start.y) - Math.abs(b - start.y))
    for (const y of turns) {
        const turn = { x: exitX, y }
        const first: Curve = [start, { x: exitX, y: start.y }, { x: exitX - 12, y }, turn]
        const lastBend = Math.max(20, (end.x - exitX) / 2)
        const last: Curve = [
            turn,
            { x: exitX + lastBend, y },
            { x: end.x - lastBend, y: end.y },
            end
        ]
        consider([first, last])
    }
    return bestCurves ? `M ${start.x} ${start.y} ${bestCurves.map(curveCommand).join(' ')}` : null
}

/** Cards occupy fixed columns. Vertical legs stay in the gutters between them. */
export function routeCanvasLink(
    from: CanvasCard,
    to: CanvasCard,
    cards: CanvasCard[]
): RoutePoint[] {
    const start = { x: from.x + width, y: from.y + height / 2 }
    const end = { x: to.x, y: to.y + height / 2 }
    const exitX = start.x + laneOffset
    const entryX = end.x - laneOffset
    const left = Math.min(exitX, entryX)
    const right = Math.max(exitX, entryX)
    const obstacles = cards.filter(
        (card) => card.x - clearance < right && card.x + width + clearance > left
    )
    // A horizontal crossing may use any open band, including above/below all cards.
    // Checking band boundaries is enough to find the shortest Manhattan detour.
    const candidates = [
        start.y,
        end.y,
        ...obstacles.flatMap((card) => [card.y - clearance, card.y + height + clearance])
    ]
    let crossing = 0
    let best = Infinity
    for (const y of candidates) {
        if (obstacles.some((card) => y > card.y - clearance && y < card.y + height + clearance))
            continue
        const distance = Math.abs(start.y - y) + Math.abs(end.y - y)
        const score = distance + Math.abs(start.y - y) * 0.001
        if (score < best) {
            best = score
            crossing = y
        }
    }
    const points = [
        start,
        { x: exitX, y: start.y },
        { x: exitX, y: crossing },
        { x: entryX, y: crossing },
        { x: entryX, y: end.y },
        end
    ]
    return points.filter(
        (point, index) =>
            index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y
    )
}

export function canvasRoutePath(points: RoutePoint[], cards: CanvasCard[] = []): string {
    if (points.length === 0) return ''
    let path = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length - 1; i++) {
        const previous = points[i - 1]
        const point = points[i]
        const next = points[i + 1]
        const before = Math.hypot(point.x - previous.x, point.y - previous.y)
        const after = Math.hypot(next.x - point.x, next.y - point.y)
        const safeRadius = (radius: number) => {
            const a = {
                x: point.x + ((previous.x - point.x) * radius) / before,
                y: point.y + ((previous.y - point.y) * radius) / before
            }
            const b = {
                x: point.x + ((next.x - point.x) * radius) / after,
                y: point.y + ((next.y - point.y) * radius) / after
            }
            const curve: Curve = [
                a,
                { x: a.x + ((point.x - a.x) * 2) / 3, y: a.y + ((point.y - a.y) * 2) / 3 },
                { x: b.x + ((point.x - b.x) * 2) / 3, y: b.y + ((point.y - b.y) * 2) / 3 },
                b
            ]
            return !cards.some((card) => curveHitsCard(curve, card))
        }
        const radius = cards.length
            ? ([72, 48, 32, 24, 16, 12, 8, 6]
                  .map((value) => Math.min(value, before / 2, after / 2))
                  .find(safeRadius) ?? 0)
            : Math.min(6, before / 2, after / 2)
        const x1 = point.x + ((previous.x - point.x) * radius) / before
        const y1 = point.y + ((previous.y - point.y) * radius) / before
        const x2 = point.x + ((next.x - point.x) * radius) / after
        const y2 = point.y + ((next.y - point.y) * radius) / after
        path += ` L ${x1} ${y1} Q ${point.x} ${point.y} ${x2} ${y2}`
    }
    const last = points[points.length - 1]
    return `${path} L ${last.x} ${last.y}`
}

/** Cache paths across selection/hover renders, but never across a layout change. */
export function createCanvasRouter(cards: CanvasCard[]) {
    const cache = new Map<string, string>()
    return (from: CanvasCard, to: CanvasCard) => {
        const key = JSON.stringify([from.id, to.id])
        let path = cache.get(key)
        if (path === undefined) {
            path =
                smoothLink(from, to, cards) ??
                canvasRoutePath(routeCanvasLink(from, to, cards), cards)
            cache.set(key, path)
        }
        return path
    }
}

/** Materialize immutable paths once per topology; rendering only reads the result. */
export function createCanvasPaths(
    layout: string,
    connections: string
): Readonly<Record<string, string>> {
    const cards: CanvasCard[] = JSON.parse(layout)
    const edges: { from: string; to: string }[] = JSON.parse(connections)
    const byId = new Map(cards.map((card) => [card.id, card]))
    const route = createCanvasRouter(cards)
    const paths: Record<string, string> = Object.create(null)
    for (const edge of edges) {
        const from = byId.get(edge.from),
            to = byId.get(edge.to)
        if (from && to) paths[JSON.stringify([edge.from, edge.to])] = route(from, to)
    }
    return Object.freeze(paths)
}

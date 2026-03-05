import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { resolveUserId } from '@/lib/services/clerk.service'
import { MoveItemSchema } from '@/lib/schemas/trip.schema'

type Params = { params: Promise<{ tripId: string; dayId: string; itemId: string }> }

// ------------------------------------------------------------
//  POST /api/trips/[tripId]/days/[dayId]/items/[itemId]/move
//  Mueve un ítem a otro día del mismo viaje
//  Body: { target_day_id: uuid }
// ------------------------------------------------------------
export async function POST(req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId, dayId, itemId } = await params
  const body                       = await req.json()
  const parsed                     = MoveItemSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.flatten().fieldErrors as unknown as string, 400)
  }

  const { target_day_id } = parsed.data

  if (target_day_id === dayId) {
    return err('target_day_id must be different from current day', 400)
  }

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    // Validar que el ítem pertenece al viaje del usuario
    const itemResult = await db.query(
      `SELECT ii.item_id, ii.item_type
       FROM itinerary_items ii
       JOIN itinerary_days  id_ ON id_.day_id = ii.day_id
       JOIN trips           t   ON t.trip_id  = id_.trip_id
       WHERE ii.item_id = $1
         AND ii.day_id  = $2
         AND t.trip_id  = $3
         AND t.user_id  = $4`,
      [itemId, dayId, tripId, userId]
    )
    if (!itemResult.rows[0]) return err('Item not found', 404)

    // Validar que el día destino pertenece al mismo viaje
    const targetDayResult = await db.query(
      `SELECT day_id FROM itinerary_days
       WHERE day_id  = $1
         AND trip_id = $2`,
      [target_day_id, tripId]
    )
    if (!targetDayResult.rows[0]) return err('Target day not found in this trip', 404)

    // No permitir mover vuelos (están asignados por fecha de salida)
    if (itemResult.rows[0].item_type === 'FLIGHT') {
      return err('Flight items cannot be moved manually', 400)
    }

    // Calcular siguiente posición en el día destino
    const posResult = await db.query<{ next_pos: number }>(
      `SELECT COALESCE(MAX(order_position), 0) + 1 AS next_pos
       FROM itinerary_items
       WHERE day_id = $1`,
      [target_day_id]
    )
    const nextPos = posResult.rows[0].next_pos

    // Mover el ítem
    await db.query(
      `UPDATE itinerary_items
       SET day_id         = $1,
           order_position = $2,
           updated_at     = NOW()
       WHERE item_id = $3`,
      [target_day_id, nextPos, itemId]
    )

    // Recalcular orden del día origen
    await db.query(`SELECT fn_reorder_day_items($1)`, [dayId])

    return ok({
      moved:         true,
      item_id:       itemId,
      from_day_id:   dayId,
      to_day_id:     target_day_id,
      order_position: nextPos,
    })

  } catch (error) {
    console.error('[POST /trips/:tripId/days/:dayId/items/:itemId/move]', error)
    return err('Internal server error', 500)
  }
}
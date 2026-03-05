import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { resolveUserId } from '@/lib/services/clerk.service'
import { UpdateItineraryItemSchema } from '@/lib/schemas/trip.schema'

type Params = { params: Promise<{ tripId: string; dayId: string; itemId: string }> }

async function validateItemOwnership(itemId: string, dayId: string, tripId: string, userId: string) {
  const result = await db.query(
    `SELECT ii.item_id
     FROM itinerary_items ii
     JOIN itinerary_days  id_ ON id_.day_id  = ii.day_id
     JOIN trips           t   ON t.trip_id   = id_.trip_id
     WHERE ii.item_id = $1
       AND ii.day_id  = $2
       AND t.trip_id  = $3
       AND t.user_id  = $4`,
    [itemId, dayId, tripId, userId]
  )
  return !!result.rows[0]
}

// ------------------------------------------------------------
//  PATCH /api/trips/[tripId]/days/[dayId]/items/[itemId]
//  Actualiza horario, notas o costo estimado del ítem
// ------------------------------------------------------------
export async function PATCH(req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId, dayId, itemId } = await params
  const body                       = await req.json()
  const parsed                     = UpdateItineraryItemSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.flatten().fieldErrors as unknown as string, 400)
  }

  const { start_time, end_time, estimated_cost, notes, status } = parsed.data

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const isOwner = await validateItemOwnership(itemId, dayId, tripId, userId)
    if (!isOwner) return err('Item not found', 404)

    const result = await db.query(
      `UPDATE itinerary_items
       SET
         start_time     = COALESCE($1::time, start_time),
         end_time       = COALESCE($2::time, end_time),
         estimated_cost = COALESCE($3,       estimated_cost),
         notes          = COALESCE($4,       notes),
         status         = COALESCE($5,       status),
         updated_at     = NOW()
       WHERE item_id = $6
       RETURNING
         item_id, day_id, item_type,
         place_reference_id, flight_reference_id,
         order_position, start_time::text, end_time::text,
         estimated_cost, notes, status, created_at, updated_at`,
      [
        start_time     ?? null,
        end_time       ?? null,
        estimated_cost ?? null,
        notes          ?? null,
        status         ?? null,
        itemId,
      ]
    )

    return ok(result.rows[0])

  } catch (error) {
    console.error('[PATCH /trips/:tripId/days/:dayId/items/:itemId]', error)
    return err('Internal server error', 500)
  }
}

// ------------------------------------------------------------
//  DELETE /api/trips/[tripId]/days/[dayId]/items/[itemId]
//  Elimina el ítem y recalcula order_position del día
// ------------------------------------------------------------
export async function DELETE(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId, dayId, itemId } = await params

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const isOwner = await validateItemOwnership(itemId, dayId, tripId, userId)
    if (!isOwner) return err('Item not found', 404)

    await db.query(`DELETE FROM itinerary_items WHERE item_id = $1`, [itemId])

    await db.query(`SELECT fn_reorder_day_items($1)`, [dayId])

    return ok({ deleted: true, item_id: itemId })

  } catch (error) {
    console.error('[DELETE /trips/:tripId/days/:dayId/items/:itemId]', error)
    return err('Internal server error', 500)
  }
}
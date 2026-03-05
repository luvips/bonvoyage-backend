import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { resolveUserId } from '@/lib/services/clerk.service'
import {
  AddItineraryItemSchema,
  ItineraryItemResponseSchema,
} from '@/lib/schemas/trip.schema'
import { z } from 'zod'

type Params = { params: Promise<{ tripId: string; dayId: string }> }

// ------------------------------------------------------------
//  GET /api/trips/[tripId]/days/[dayId]/items
//  Lista todos los ítems de un día
// ------------------------------------------------------------
export async function GET(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId, dayId } = await params

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const tripExists = await db.query(
      `SELECT 1 FROM trips WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId]
    )
    if (!tripExists.rows[0]) return err('Trip not found', 404)

    const result = await db.query(
      `SELECT
         ii.item_id,
         ii.day_id,
         ii.item_type,
         ii.place_reference_id,
         ii.flight_reference_id,
         ii.order_position,
         ii.start_time::text,
         ii.end_time::text,
         ii.estimated_cost,
         ii.notes,
         ii.status,
         ii.created_at,
         ii.updated_at
       FROM itinerary_items ii
       WHERE ii.day_id = $1
       ORDER BY ii.order_position`,
      [dayId]
    )

    const items = z.array(ItineraryItemResponseSchema).parse(result.rows)
    return ok(items)

  } catch (error) {
    console.error('[GET /trips/:tripId/days/:dayId/items]', error)
    return err('Internal server error', 500)
  }
}

// ------------------------------------------------------------
//  POST /api/trips/[tripId]/days/[dayId]/items
//  Agrega un ítem al día
//  Para FLIGHT: se asigna por departure_time
//  Llama a fn_add_itinerary_item
// ------------------------------------------------------------
export async function POST(req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId, dayId } = await params
  const body               = await req.json()
  const parsed             = AddItineraryItemSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.flatten().fieldErrors as unknown as string, 400)
  }

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    // Validar ownership del viaje
    const tripExists = await db.query(
      `SELECT status FROM trips WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId]
    )
    if (!tripExists.rows[0]) return err('Trip not found', 404)
    if (tripExists.rows[0].status === 'CANCELLED') {
      return err('Cannot add items to a cancelled trip', 400)
    }

    const data = parsed.data

    const result = await db.query<{ item_id: string }>(
      `SELECT fn_add_itinerary_item(
         $1, $2, $3, $4, $5, $6::time, $7::time, $8, $9
       ) AS item_id`,
      [
        tripId,
        dayId,
        data.item_type,
        data.item_type === 'PLACE'  ? data.place_reference_id  : null,
        data.item_type === 'FLIGHT' ? data.flight_reference_id : null,
        data.item_type === 'PLACE'  && 'start_time' in data ? data.start_time ?? null : null,
        data.item_type === 'PLACE'  && 'end_time'   in data ? data.end_time   ?? null : null,
        'estimated_cost' in data ? data.estimated_cost ?? null : null,
        'notes'          in data ? data.notes          ?? null : null,
      ]
    )

    const itemId = result.rows[0].item_id

    // Retornar el ítem creado
    const itemResult = await db.query(
      `SELECT
         item_id, day_id, item_type,
         place_reference_id, flight_reference_id,
         order_position, start_time::text, end_time::text,
         estimated_cost, notes, status, created_at, updated_at
       FROM itinerary_items
       WHERE item_id = $1`,
      [itemId]
    )

    const item = ItineraryItemResponseSchema.parse(itemResult.rows[0])
    return ok(item, 201)

  } catch (error: unknown) {
    console.error('[POST /trips/:tripId/days/:dayId/items]', error)
    if (error instanceof Error) {
      if (error.message.includes('No itinerary day found')) return err(error.message, 400)
      if (error.message.includes('does not belong to trip')) return err(error.message, 400)
    }
    return err('Internal server error', 500)
  }
}
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

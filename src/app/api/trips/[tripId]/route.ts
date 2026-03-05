import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { resolveUserId } from '@/lib/services/clerk.service'
import {
  UpdateTripSchema,
  TripResponseSchema,
  ItineraryDaySchema,
} from '@/lib/schemas/trip.schema'
import { z } from 'zod'

type Params = { params: Promise<{ tripId: string }> }

// ------------------------------------------------------------
//  GET /api/trips/[tripId]
//  Retorna el viaje con todos sus días e ítems
// ------------------------------------------------------------
export async function GET(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId } = await params

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    // Obtener viaje (validando ownership)
    const tripResult = await db.query(
      `SELECT
         t.trip_id, t.user_id, t.destination_id, t.trip_name,
         t.start_date, t.end_date, t.status, t.total_budget,
         t.currency, t.is_favorite, t.confirmed_at,
         t.created_at, t.updated_at,
         d.name      AS destination_name,
         d.city      AS destination_city,
         d.image_url AS destination_image,
         (t.end_date - t.start_date + 1)     AS total_days,
         COUNT(ii.item_id)                   AS total_items
       FROM trips t
       LEFT JOIN destinations    d   ON d.destination_id = t.destination_id
       LEFT JOIN itinerary_days  id_ ON id_.trip_id       = t.trip_id
       LEFT JOIN itinerary_items ii  ON ii.day_id         = id_.day_id
                                     AND ii.status       <> 'CANCELLED'
       WHERE t.trip_id = $1
         AND t.user_id = $2
       GROUP BY t.trip_id, d.name, d.city, d.image_url`,
      [tripId, userId]
    )

    if (!tripResult.rows[0]) return err('Trip not found', 404)

    const trip = TripResponseSchema.parse(tripResult.rows[0])

    // Obtener días con sus ítems
    const daysResult = await db.query(
      `SELECT
         id_.day_id,
         id_.trip_id,
         id_.day_date,
         id_.day_number,
         id_.notes,
         COALESCE(
           json_agg(
             json_build_object(
               'item_id',             ii.item_id,
               'item_type',           ii.item_type,
               'order_position',      ii.order_position,
               'start_time',          ii.start_time,
               'end_time',            ii.end_time,
               'estimated_cost',      ii.estimated_cost,
               'notes',               ii.notes,
               'status',              ii.status,
               'place_reference_id',  ii.place_reference_id,
               'flight_reference_id', ii.flight_reference_id
             ) ORDER BY ii.order_position
           ) FILTER (WHERE ii.item_id IS NOT NULL),
           '[]'
         ) AS items
       FROM itinerary_days id_
       LEFT JOIN itinerary_items ii ON ii.day_id = id_.day_id
       WHERE id_.trip_id = $1
       GROUP BY id_.day_id
       ORDER BY id_.day_number`,
      [tripId]
    )

    const days = z.array(ItineraryDaySchema).parse(daysResult.rows)

    return ok({ ...trip, days })

  } catch (error) {
    console.error('[GET /trips/:tripId]', error)
    return err('Internal server error', 500)
  }
}

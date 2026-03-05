import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { resolveUserId } from '@/lib/services/clerk.service'
import { CreateTripSchema, TripResponseSchema } from '@/lib/schemas/trip.schema'
import { z } from 'zod'

// ------------------------------------------------------------
//  GET /api/trips
//  Lista todos los viajes del usuario autenticado
//  Query params: ?status=DRAFT|CONFIRMED|COMPLETED|CANCELLED
// ------------------------------------------------------------
export async function GET(req: Request) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const StatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional()
  const parsedStatus = StatusSchema.safeParse(status ?? undefined)
  if (!parsedStatus.success) return err('Invalid status filter', 400)

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const result = await db.query(
      `SELECT
         t.trip_id,
         t.user_id,
         t.destination_id,
         t.trip_name,
         t.start_date,
         t.end_date,
         t.status,
         t.total_budget,
         t.currency,
         t.is_favorite,
         t.confirmed_at,
         t.created_at,
         t.updated_at,
         d.name        AS destination_name,
         d.city        AS destination_city,
         d.image_url   AS destination_image,
         (t.end_date - t.start_date + 1)      AS total_days,
         COUNT(ii.item_id)                    AS total_items
       FROM trips t
       LEFT JOIN destinations    d   ON d.destination_id = t.destination_id
       LEFT JOIN itinerary_days  id_ ON id_.trip_id       = t.trip_id
       LEFT JOIN itinerary_items ii  ON ii.day_id          = id_.day_id
                                     AND ii.status        <> 'CANCELLED'
       WHERE t.user_id = $1
         ${parsedStatus.data ? 'AND t.status = $2' : ''}
       GROUP BY
         t.trip_id, d.name, d.city, d.image_url
       ORDER BY t.created_at DESC`,
      parsedStatus.data ? [userId, parsedStatus.data] : [userId]
    )

    const trips = z.array(TripResponseSchema).parse(result.rows)
    return ok(trips)

  } catch (error) {
    console.error('[GET /trips]', error)
    return err('Internal server error', 500)
  }
}


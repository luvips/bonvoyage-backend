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
//  Retorna el viaje con todos sus días e ítems enriquecidos
// ------------------------------------------------------------
export async function GET(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId } = await params

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const tripResult = await db.query(
      `SELECT
         t.trip_id, t.user_id, t.destination_id, t.trip_name,
         t.start_date, t.end_date, t.status, t.total_budget,
         t.currency, COALESCE(t.planning_time_seconds, 0) AS planning_time_seconds,
         t.is_favorite, t.confirmed_at,
         t.created_at, t.updated_at,
         d.name      AS destination_name,
         d.city      AS destination_city,
         d.image_url AS destination_image,
         d.latitude  AS destination_lat,
         d.longitude AS destination_lng,
         d.country   AS destination_country,
         (t.end_date - t.start_date + 1)     AS total_days,
         COUNT(ii.item_id)                   AS total_items
       FROM trips t
       LEFT JOIN destinations    d   ON d.destination_id = t.destination_id
       LEFT JOIN itinerary_days  id_ ON id_.trip_id       = t.trip_id
       LEFT JOIN itinerary_items ii  ON ii.day_id         = id_.day_id
                                     AND ii.status       <> 'CANCELLED'
       WHERE t.trip_id = $1
         AND t.user_id = $2
       GROUP BY t.trip_id, d.name, d.city, d.image_url, d.latitude, d.longitude, d.country`,
      [tripId, userId]
    )

    if (!tripResult.rows[0]) return err('Trip not found', 404)

    const trip = TripResponseSchema.parse(tripResult.rows[0])

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
               'flight_reference_id', ii.flight_reference_id,
               'place_name',          pr.name,
               'place_category',      pr.category,
               'place_latitude',      pr.latitude,
               'place_longitude',     pr.longitude,
               'place_rating',        pr.rating,
               'place_address',       pr.extended_data->>'address',
               'place_photo_url',     COALESCE(pr.extended_data->>'photo_url', pr.extended_data->>'imageUrl'),
               'place_price_level',   pr.extended_data->>'price_level',
               'place_external_id',   pr.external_id,
               'flight_airline_code',        fr.airline_code,
               'flight_origin_airport',      fr.origin_airport,
               'flight_destination_airport', fr.destination_airport,
               'flight_departure_time',      fr.departure_time,
               'flight_price',               fr.price
             ) ORDER BY ii.order_position
           ) FILTER (WHERE ii.item_id IS NOT NULL),
           '[]'
         ) AS items
       FROM itinerary_days id_
       LEFT JOIN itinerary_items   ii ON ii.day_id        = id_.day_id
       LEFT JOIN place_references  pr ON pr.reference_id  = ii.place_reference_id
       LEFT JOIN flight_references fr ON fr.reference_id  = ii.flight_reference_id
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

// ------------------------------------------------------------
//  PATCH /api/trips/[tripId]
//  Actualiza campos editables del viaje
// ------------------------------------------------------------
export async function PATCH(req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId } = await params
  const body        = await req.json()
  const parsed      = UpdateTripSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.flatten().fieldErrors as unknown as string, 400)
  }

  const { trip_name, start_date, end_date, total_budget, currency, is_favorite } = parsed.data

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const existing = await db.query(
      `SELECT status FROM trips WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId]
    )
    if (!existing.rows[0]) return err('Trip not found', 404)
    if (existing.rows[0].status !== 'DRAFT') {
      return err('Only DRAFT trips can be edited', 400)
    }

    const result = await db.query(
      `UPDATE trips
       SET
         trip_name    = COALESCE($1, trip_name),
         start_date   = COALESCE($2::date, start_date),
         end_date     = COALESCE($3::date, end_date),
         total_budget = COALESCE($4, total_budget),
         currency     = COALESCE($5, currency),
         is_favorite  = COALESCE($6, is_favorite),
         updated_at   = NOW()
       WHERE trip_id = $7
         AND user_id = $8
       RETURNING trip_id, trip_name, start_date, end_date,
                 status, total_budget, currency, is_favorite, updated_at`,
      [
        trip_name    ?? null,
        start_date   ?? null,
        end_date     ?? null,
        total_budget ?? null,
        currency     ?? null,
        is_favorite  ?? null,
        tripId,
        userId,
      ]
    )

    return ok(result.rows[0])

  } catch (error) {
    console.error('[PATCH /trips/:tripId]', error)
    return err('Internal server error', 500)
  }
}

// ------------------------------------------------------------
//  DELETE /api/trips/[tripId]
//  Elimina el viaje (solo DRAFT o CANCELLED)
// ------------------------------------------------------------
export async function DELETE(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId } = await params

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    await db.query(`SELECT fn_delete_trip($1, $2)`, [tripId, userId])

    return ok({ deleted: true, trip_id: tripId })

  } catch (error: unknown) {
    console.error('[DELETE /trips/:tripId]', error)
    if (error instanceof Error) {
      if (error.message.includes('not found or access denied')) return err('Trip not found', 404)
      if (error.message.includes('Only DRAFT or CANCELLED'))    return err(error.message, 400)
    }
    return err('Internal server error', 500)
  }
}
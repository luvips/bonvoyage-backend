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
         ii.updated_at,
         pr.extended_data->>'today_hours'          AS place_today_hours,
         pr.extended_data->'weekly_hours'           AS place_weekly_hours,
         (pr.extended_data->>'is_open_now')::boolean AS place_is_open_now
       FROM itinerary_items ii
       LEFT JOIN place_references pr ON ii.place_reference_id = pr.reference_id
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
  const body = await req.json()
  const parsed = AddItineraryItemSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.flatten().fieldErrors as unknown as string, 400)
  }

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const tripExists = await db.query(
      `SELECT status FROM trips WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId]
    )
    if (!tripExists.rows[0]) return err('Trip not found', 404)
    if (tripExists.rows[0].status === 'CANCELLED') {
      return err('Cannot add items to a cancelled trip', 400)
    }

    const data = parsed.data;
    
    let placeRefId: string | null = null;
    let flightRefId: string | null = null;
    let startTime: string | null = null;
    let endTime: string | null = null;

    if (data.item_type === 'PLACE') {
      placeRefId = data.place_reference_id;
      startTime = data.start_time ?? null;
      endTime = data.end_time ?? null;

      if (!placeRefId && body.place_id) {
        const extendedData = JSON.stringify({
          photo_url: body.photo_url || null,
          address: body.address || null,
          today_hours: body.todayHours || null,
          weekly_hours: body.weeklyHours || null,
          is_open_now: body.isOpenNow ?? null,
        });

        const placeResult = await db.query(
          `INSERT INTO place_references (external_id, category, name, latitude, longitude, rating, api_source, extended_data)
           VALUES ($1, $2, $3, $4, $5, $6, 'frontend', $7)
           ON CONFLICT (external_id, category) 
           DO UPDATE SET name = EXCLUDED.name, extended_data = EXCLUDED.extended_data
           RETURNING reference_id;`,
          [
            body.place_id, 
            'POI',
            body.item_name || 'Lugar sin nombre', 
            body.latitude || 0, 
            body.longitude || 0, 
            body.rating || 0,
            extendedData
          ]
        );
        placeRefId = placeResult.rows[0].reference_id;
      }
    } else if (data.item_type === 'FLIGHT') {
      flightRefId = data.flight_reference_id;
    }

    const result = await db.query<{ item_id: string }>(
      `SELECT fn_add_itinerary_item(
         $1::uuid, $2::uuid, $3::varchar, $4::uuid, $5::uuid, $6::time, $7::time, $8::numeric, $9::text
       ) AS item_id`,
      [
        tripId,
        dayId,
        data.item_type,
        placeRefId,
        flightRefId,
        startTime,
        endTime,
        data.estimated_cost ?? null,
        data.notes ?? null,
      ]
    )

    const itemId = result.rows[0].item_id

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

  } catch (error: any) {
    console.error('[POST /trips/:tripId/days/:dayId/items]', error)
    return err(error.message || 'Error en la base de datos', 500)
  }
}
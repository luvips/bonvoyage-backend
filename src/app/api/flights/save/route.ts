import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { z } from 'zod'

const SaveFlightSchema = z.object({
  external_flight_id: z.string().min(1),
  airline_code: z.string().min(1),
  flight_number: z.string().min(1),
  origin_airport: z.string().min(1),
  destination_airport: z.string().min(1),
  departure_time: z.string().datetime(),
  arrival_time: z.string().datetime(),
  price: z.coerce.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  api_source: z.string().min(1).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = SaveFlightSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', detalles: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const {
      external_flight_id,
      airline_code,
      flight_number,
      origin_airport,
      destination_airport,
      departure_time,
      arrival_time,
      price,
      currency,
      api_source,
    } = parsed.data

    const existing = await db.query<{ reference_id: string }>(
      `SELECT reference_id
       FROM flight_references
       WHERE external_flight_id = $1
       LIMIT 1`,
      [external_flight_id]
    )

    let referenceId: string

    if (existing.rows[0]) {
      const updated = await db.query<{ reference_id: string }>(
        `UPDATE flight_references
         SET
           airline_code        = $2,
           flight_number       = $3,
           origin_airport      = $4,
           destination_airport = $5,
           departure_time      = $6::timestamp,
           arrival_time        = $7::timestamp,
           price               = $8,
           currency            = $9,
           api_source          = $10,
           cached_at           = NOW()
         WHERE reference_id = $1
         RETURNING reference_id`,
        [
          existing.rows[0].reference_id,
          airline_code,
          flight_number,
          origin_airport,
          destination_airport,
          departure_time,
          arrival_time,
          price ?? null,
          currency ?? 'USD',
          api_source ?? 'air-scrapper',
        ]
      )

      referenceId = updated.rows[0].reference_id
    } else {
      const inserted = await db.query<{ reference_id: string }>(
        `INSERT INTO flight_references
           (external_flight_id, airline_code, flight_number, origin_airport, destination_airport, departure_time, arrival_time, price, currency, api_source)
         VALUES
           ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp, $8, $9, $10)
         RETURNING reference_id`,
        [
          external_flight_id,
          airline_code,
          flight_number,
          origin_airport,
          destination_airport,
          departure_time,
          arrival_time,
          price ?? null,
          currency ?? 'USD',
          api_source ?? 'air-scrapper',
        ]
      )

      referenceId = inserted.rows[0].reference_id
    }

    return NextResponse.json(
      {
        success: true,
        reference_id: referenceId,
        external_flight_id,
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    const detalle = error instanceof Error ? error.message : 'Error desconocido'
    console.error('[POST /api/flights/save]', detalle)
    return NextResponse.json(
      { error: 'Error al guardar referencia de vuelo', detalle },
      { status: 500 }
    )
  }
}
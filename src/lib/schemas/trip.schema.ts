import { z } from 'zod'


export const CreateTripSchema = z.object({
  trip_name:      z.string().min(1).max(255),
  destination_id: z.string().uuid().optional(),
  start_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  end_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  total_budget:   z.coerce.number().positive().optional(),
  currency:       z.enum(['USD', 'EUR', 'MXN', 'JPY', 'GBP', 'THB']).optional(),
}).refine(
  (data) => new Date(data.end_date) >= new Date(data.start_date),
  { message: 'end_date must be >= start_date', path: ['end_date'] }
).refine(
  (data) => {
    const start = new Date(data.start_date)
    const end   = new Date(data.end_date)
    const days  = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    return days <= 30
  },
  { message: 'Trip cannot exceed 30 days', path: ['end_date'] }
)

export const UpdateTripSchema = z.object({
  trip_name:    z.string().min(1).max(255).optional(),
  start_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  total_budget: z.coerce.number().positive().optional(),
  currency:     z.enum(['USD', 'EUR', 'MXN', 'JPY', 'GBP', 'THB']).optional(),
  is_favorite:  z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
)

export const AddItineraryItemSchema = z.discriminatedUnion('item_type', [
  z.object({
    item_type:        z.literal('PLACE'),
    place_reference_id: z.string().uuid(),
    start_time:       z.string().regex(/^\d{2}:\d{2}$/).optional(),
    end_time:         z.string().regex(/^\d{2}:\d{2}$/).optional(),
    estimated_cost:   z.number().nonnegative().optional(),
    notes:            z.string().max(500).optional(),
  }),
  z.object({
    item_type:          z.literal('FLIGHT'),
    flight_reference_id: z.string().uuid(),
    estimated_cost:     z.number().nonnegative().optional(),
    notes:              z.string().max(500).optional(),
  }),
])

export const UpdateItineraryItemSchema = z.object({
  start_time:     z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time:       z.string().regex(/^\d{2}:\d{2}$/).optional(),
  estimated_cost: z.number().nonnegative().optional(),
  notes:          z.string().max(500).optional(),
  status:         z.enum(['PLANNED', 'CONFIRMED', 'CANCELLED']).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
)

export const MoveItemSchema = z.object({
  target_day_id: z.string().uuid(),
})


export const TripResponseSchema = z.object({
  trip_id:          z.string().uuid(),
  user_id:          z.string().uuid(),
  destination_id:   z.string().uuid().nullable(),
  trip_name:        z.string(),
  start_date:       z.coerce.date(),
  end_date:         z.coerce.date(),
  status:           z.enum(['DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']),
  total_budget:     z.coerce.number().nullable(),
  currency:         z.string(),
  planning_time_seconds: z.coerce.number().int().nonnegative(),
  is_favorite:      z.boolean(),
  confirmed_at:     z.coerce.date().nullable(),
  created_at:       z.coerce.date(),
  updated_at:       z.coerce.date(),
  destination_name:    z.string().nullable(),
  destination_city:    z.string().nullable(),
  destination_image:   z.string().nullable(),
  destination_lat:     z.coerce.number().nullable().optional(),
  destination_lng:     z.coerce.number().nullable().optional(),
  destination_country: z.string().nullable().optional(),
  total_days:          z.coerce.number(),
  total_items:         z.coerce.number(),
})

export const ItineraryDaySchema = z.object({
  day_id:     z.string().uuid(),
  trip_id:    z.string().uuid(),
  day_date:   z.coerce.date(),
  day_number: z.number(),
  notes:      z.string().nullable(),
  items:      z.array(z.object({
    item_id:             z.string().uuid(),
    item_type:           z.enum(['PLACE', 'FLIGHT']),
    order_position:      z.number(),
    start_time:          z.string().nullable(),
    end_time:            z.string().nullable(),
    estimated_cost:      z.coerce.number().nullable(),
    notes:               z.string().nullable(),
    status:              z.enum(['PLANNED', 'CONFIRMED', 'CANCELLED']),
    place_reference_id:  z.string().uuid().nullable(),
    flight_reference_id: z.string().uuid().nullable(),
    place_name:          z.string().nullable().optional(),
    place_category:      z.string().nullable().optional(),
    place_latitude:      z.coerce.number().nullable().optional(),
    place_longitude:     z.coerce.number().nullable().optional(),
    place_rating:        z.coerce.number().nullable().optional(),
    place_address:       z.string().nullable().optional(),
    place_photo_url:     z.string().nullable().optional(),
    place_price_level:   z.string().nullable().optional(),
    place_external_id:   z.string().nullable().optional(),
    flight_airline_code:        z.string().nullable().optional(),
    flight_origin_airport:      z.string().nullable().optional(),
    flight_destination_airport: z.string().nullable().optional(),
    flight_departure_time:      z.string().nullable().optional(),
    flight_price:               z.coerce.number().nullable().optional(),
  })).default([]),
})

export const ItineraryItemResponseSchema = z.object({
  item_id:             z.string().uuid(),
  day_id:              z.string().uuid(),
  item_type:           z.enum(['PLACE', 'FLIGHT']),
  place_reference_id:  z.string().uuid().nullable(),
  flight_reference_id: z.string().uuid().nullable(),
  order_position:      z.number(),
  start_time:          z.string().nullable(),
  end_time:            z.string().nullable(),
  estimated_cost:      z.coerce.number().nullable(),
  notes:               z.string().nullable(),
  status:              z.enum(['PLANNED', 'CONFIRMED', 'CANCELLED']),
  created_at:          z.coerce.date(),
  updated_at:          z.coerce.date(),
  place_today_hours:   z.string().nullable().optional(),
  place_weekly_hours:  z.array(z.string()).nullable().optional(),
  place_is_open_now:   z.boolean().nullable().optional(),
})


export type CreateTripInput          = z.infer<typeof CreateTripSchema>
export type UpdateTripInput          = z.infer<typeof UpdateTripSchema>
export type AddItineraryItemInput    = z.infer<typeof AddItineraryItemSchema>
export type UpdateItineraryItemInput = z.infer<typeof UpdateItineraryItemSchema>
export type MoveItemInput            = z.infer<typeof MoveItemSchema>
export type TripResponse             = z.infer<typeof TripResponseSchema>
export type ItineraryDay             = z.infer<typeof ItineraryDaySchema>
export type ItineraryItemResponse    = z.infer<typeof ItineraryItemResponseSchema>

export const TicketResponseSchema = z.object({
  ticket_id:           z.string().uuid(),
  trip_id:             z.string().uuid(),
  presupuesto_total:   z.coerce.number(),
  costo_acumulado:     z.coerce.number(),
  balance_disponible:  z.coerce.number(),
  total_lugares:       z.coerce.number(),
  total_vuelos:        z.coerce.number(),
  total_items:         z.coerce.number(),
  estado_presupuesto:  z.enum(['SIN_DATOS', 'EN_RANGO', 'ADVERTENCIA', 'EXCEDIDO']),
  updated_at:          z.coerce.date(),
})

export const TagSchema = z.object({
  tag_id:   z.number(),
  name:     z.string(),
  category: z.enum(['TIPO_VIAJE', 'ACTIVIDAD', 'CLIMA', 'PRESUPUESTO', 'GENERAL']),
})

export type TicketResponse = z.infer<typeof TicketResponseSchema>
export type Tag = z.infer<typeof TagSchema>
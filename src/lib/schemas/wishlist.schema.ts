import { z } from 'zod'


export const AddWishlistItemSchema = z.object({
  country: z.string().min(1).max(100),
  city:    z.string().min(1).max(150),
})


export const WishlistItemResponseSchema = z.object({
  wishlist_id:       z.string().uuid(),
  user_id:           z.string().uuid(),
  country:           z.string(),
  city:              z.string(),
  created_at:        z.coerce.date(),
  // Campos enriquecidos desde vw_wishlist (pueden ser null si no hay destino en catálogo)
  destination_id:    z.string().uuid().nullable(),
  destination_image: z.string().nullable(),
  latitude:          z.number().nullable(),
  longitude:         z.number().nullable(),
  timezone:          z.string().nullable(),
  currency_code:     z.string().nullable(),
  popular_months:    z.array(z.number()).nullable(),
  min_flight_price:  z.number().nullable(),
})


export type AddWishlistItemInput    = z.infer<typeof AddWishlistItemSchema>
export type WishlistItemResponse    = z.infer<typeof WishlistItemResponseSchema>
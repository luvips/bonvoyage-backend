import { z } from "zod";

export const CleanHotelSchema = z.object({
  id: z.string().nullable(),
  name: z.string().default("Hotel sin nombre"),
  destination: z.string().nullable().optional().default(null), 
  price: z.string().default("Precio no disponible"),
  rating: z.string().or(z.number()).default("N/A"),
  imageUrl: z.string().nullable().optional().catch(null),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
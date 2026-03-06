import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query) return NextResponse.json({ error: "Falta el término de búsqueda" }, { status: 400 });

  try {
    const response = await fetch(
      `https://sky-scrapper.p.rapidapi.com/api/v1/hotels/searchDestinationOrHotel?query=${query}`,
      {
        headers: {
          'x-rapidapi-host': 'sky-scrapper.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY as string,
        },
      }
    );

    const result = await response.json();
    
    const locations = result.data.map((loc: any) => ({
      entityId: loc.entityId,
      name: loc.entityName,
      type: loc.entityType,
      fullTitle: loc.hierarchy
    }));

    return NextResponse.json(locations);
  } catch (error) {
    return NextResponse.json({ error: "Error al buscar destino" }, { status: 500 });
  }
}
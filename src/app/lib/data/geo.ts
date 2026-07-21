import { sql } from "@vercel/postgres";
import { isValidCountryCode } from "./countries";

// Fill the user's leaderboard country from the request's geo header (Vercel
// sets x-vercel-ip-country at the edge) the first time we see them. Only fills
// a NULL — a country chosen on the account page is never overwritten. Because
// leaderboards JOIN users for the country, one successful fill retroactively
// flags every historical entry the user has. Fire-and-forget: never throws.
export async function fillCountryFromRequest(
  username: string | null | undefined,
  request: Request
): Promise<void> {
  if (!username) return;
  const geoCountry = request.headers.get("x-vercel-ip-country")?.toUpperCase();
  if (!geoCountry || !isValidCountryCode(geoCountry)) return;
  try {
    await sql`
      UPDATE users SET country = ${geoCountry}
      WHERE username = ${username} AND country IS NULL;
    `;
  } catch (e) {
    console.error("Geo country default failed:", e);
  }
}

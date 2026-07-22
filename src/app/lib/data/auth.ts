import { sql } from "@vercel/postgres";
import bcrypt from "bcryptjs";
import { User } from "../types/user";

// A function to return a user if valid.
export async function getUser(identifier: string, password: string): Promise<User | undefined> {
    try {
        const user = await sql`
        SELECT u.id, u.username, u.email, u.password_hash,
               b."badgeUrl" AS badge_url,
               b."noBorder" AS badge_no_border,
               t."colorFrom" AS title_color_from,
               t."colorTo" AS title_color_to,
               t."textColor" AS title_text_color
        FROM users u
        LEFT JOIN badges b ON b."badgeName" = u."badgeSelected"
        LEFT JOIN titles t ON t."titleName" = u."titleSelected"
        WHERE u.username=${identifier} or u.email=${identifier}
        `;
        const result =  user.rows[0];
        if (!result?.password_hash) {
            return undefined;
        }
        if (bcrypt.compareSync(password, result.password_hash)) {
            return {
                id: result.id,
                username: result.username,
                email: result.email,
                badgeUrl: result.badge_url ?? undefined,
                badgeNoBorder: !!result.badge_no_border,
                titleColorFrom: result.title_color_from ?? null,
                titleColorTo: result.title_color_to ?? null,
                titleTextColor: result.title_text_color ?? null,
                iat: Date.now(),
            }
        }

        return undefined;
    } catch (error) {
        console.error("Failed to fetch user:", error);
        throw new Error("Failed to fetch user.");
    }
}

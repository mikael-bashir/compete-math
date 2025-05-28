import { sql } from "@vercel/postgres";
import bcrypt from "bcryptjs";
import { User } from "../types/user";

// A function to return a user if valid.
export async function getUser(username: string, password: string): Promise<User | undefined> {
    try {
        const user = await sql`
        SELECT id, username, password_hash
        FROM users 
        WHERE username=${username}
        `;
        const result =  user.rows[0];
        if (bcrypt.compareSync(password, result.password_hash)) {
          return { id: result.id, username: result.username, iat: Date.now() }
        }

        return undefined;
        
    } catch (error) {
        console.error("Failed to fetch user:", error);
        throw new Error("Failed to fetch user.");
    }
}

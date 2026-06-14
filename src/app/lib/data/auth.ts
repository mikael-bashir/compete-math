import { sql } from "@vercel/postgres";
import bcrypt from "bcryptjs";
import { User } from "../types/user";

// A function to return a user if valid.
export async function getUser(identifier: string, password: string): Promise<User | undefined> {
    try {
        const user = await sql`
        SELECT id, username, email, password_hash
        FROM users 
        WHERE username=${identifier} or email=${identifier}
        `;
        const result =  user.rows[0];
        if (!result?.password_hash) {
            return undefined;
        }
        if (bcrypt.compareSync(password, result.password_hash)) {
            return { id: result.id, username: result.username, email: result.email, iat: Date.now() }
        }

        return undefined;
    } catch (error) {
        console.error("Failed to fetch user:", error);
        throw new Error("Failed to fetch user.");
    }
}

"use server";

import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import { signIn, signOut } from "../../../../auth";
import { LoginFormData } from "../types/form";


export async function signUpAction(data: { username: string; password: string }) {
    try {
        // Check for existing user
        const existingUser = await sql`
        SELECT username FROM users 
        WHERE username = ${data.username}
        `;

        if (existingUser.rows.length > 0) {
        return { error: 'Username already exists' };
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Create new user
        const result = await sql`
        INSERT INTO users (username, password_hash)
        VALUES (${data.username}, ${hashedPassword})
        RETURNING id, username
        `;

        return {
        user: result.rows[0],
        error: undefined
        };
    } catch (error) {
        console.error('Registration error:', error);
        return { 
        error: error instanceof Error ? error.message : 'Registration failed' 
        };
    }
}

export async function signInAction(formData: LoginFormData) {
    return signIn("credentials", formData);
}

export async function signOutAction() {
    return signOut();
}

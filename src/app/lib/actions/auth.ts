"use server";

import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import { signIn, signOut } from "../../(auth)/auth";
import { LoginFormData } from "../types/form";
import { signUpSchema } from '../zod';
import { ZodError } from 'zod';
import { RegisterFormData } from '../types/auth';
import { issueVerification } from '../email/verification';

export async function signUpAction(data: RegisterFormData) {
    try {
        await signUpSchema.parseAsync(data);
    } catch (error) {
        if (error instanceof ZodError) {
            const issues = error.issues
            .map((i) => `${i.path[0]}: ${i.message}`)
            .join("; ");
            return { error: `${issues}` };
        }
    }
    try {
        // Check for existing user
        const existingUser = await sql`
        SELECT username, email FROM users 
        WHERE username = ${data.username} OR email = ${data.email}
        `;

        if (existingUser.rows.length > 0) {
            const user = existingUser.rows[0];
            if (user.username === data.username) return { error: 'Username already exists' };
            if (user.email === data.email) return { error: 'Email is already registered' };
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Create new user
        const result = await sql`
        INSERT INTO users (username, email, password_hash)
        VALUES (${data.username}, ${data.email}, ${hashedPassword})
        RETURNING id, username, email
        `;

        const newUser = result.rows[0];

        // Fire the 24h verification email. Best-effort ONLY — the account is
        // already created and must never fail because email is down.
        let verificationSent = false;
        try {
            verificationSent = await issueVerification(
                String(newUser.id),
                String(newUser.email ?? data.email),
            );
        } catch (e) {
            console.error('verification email failed (account still created):', e);
        }

        return {
            user: newUser,
            verificationSent,
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
    try{
        const result = await signIn("credentials", {...formData, redirect: false});
        console.log('the result!!!!!!!!!!!');
        console.log(result);
        if (typeof(result) === 'string') {
            return {
                ok: true,
            };
        }
        if (result?.ok) {
            return {
                ok: true,
            };
        }
        return {
            ok: false,
        };
    } catch(error) {
        return {
            ok: false,
            error: error
        }
    }
}

export async function signOutAction() {
    return signOut();
}

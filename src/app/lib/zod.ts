import { object, string } from "zod"
 
// export const signInSchema = object({
//     username: string({ required_error: "username is required" })
//         .min(1, "username is required"),
//     password: string({ required_error: "password is required" })
//         .min(1, "Password is required")
//         .min(8, "Password must be more than 8 characters")
//         .max(32, "Password must be less than 32 characters"),
// })

export const signInSchema = object({
    identifier: string({ required_error: "username or email is required" })
        .min(1, "username or email is required"),
    password: string({ required_error: "password is required" })
        .min(1, "Password is required")
})

export const signUpSchema = object({
    username: string({ required_error: "username is required" })
        .min(1, "username is required")
        .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    email: string({ required_error: "email is required" })
        .min(1, "email is required")
        .email("Invalid email format. Please include an '@' and a valid domain."),
    password: string({ required_error: "password is required" })
        .min(1, "Password is required")
        .min(8, "Password must be more than 8 characters")
        .max(32, "Password must be less than 32 characters"),
})

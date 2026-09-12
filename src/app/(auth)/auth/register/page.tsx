'use client';

import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { signUpAction } from '@/app/lib/actions/auth';
import { RegisterFormData } from '@/app/lib/types/auth';
import { toast } from 'sonner';

const RegisterForm = () => {
    const {
        register,
        handleSubmit,
        formState: { errors }
    } = useForm<RegisterFormData>();

    const onSubmit = async (data: RegisterFormData) => {
        try {
            const result = await signUpAction(data);
            if (result?.error) {
                toast.error(result.error);
            } else {
                toast.success('Account created successfully');
                // continue on
            }
        } catch (error) {
            console.error(error);
            toast.error('Registration failed. Please try again.');
        }
    };

    return (
        <div className="w-full min-h-screen relative flex flex-col items-center justify-center p-4 overflow-hidden bg-[#12170d]">
            {/* Same backdrop as sign-in: the landing's own art */}
            <Image
                src="/images/true-masterpiece-extended.png"
                alt=""
                fill
                className="object-cover"
                priority
                quality={100}
                unoptimized
            />
            <div className="absolute inset-0 bg-black/30 z-0" />

            <form
                onSubmit={handleSubmit(onSubmit)}
                className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#141013]/90 p-8 text-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-sm"
            >
                <p className="text-2xl font-bold text-center mb-6 text-white">Create Account</p>

                <div className="mb-4">
                    <label htmlFor="username" className="block text-white/80 mb-2">
                        Username
                    </label>
                    <input
                        type="text"
                        id="username"
                        {...register('username', { required: 'Username is required' })}
                        className="w-full p-3 border border-gray-300 rounded-sm focus:outline-hidden focus:border-blue-500 text-black"
                    />
                    {errors.username && (
                        <span className="text-red-500 text-sm">{errors.username.message}</span>
                    )}
                </div>

                <div className="mb-4">
                    <label htmlFor="password" className="block text-white/80 mb-2">
                        Password
                    </label>
                    <input
                        type="password"
                        id="password"
                        {...register('password', {
                        required: 'Password is required',
                        minLength: {
                            value: 9,
                            message: 'Password have more than 8 characters'
                        }
                        })}
                        className="w-full p-3 border border-gray-300 rounded-sm focus:outline-hidden focus:border-blue-500 text-black"
                    />
                    {errors.password && (
                        <span className="text-red-500 text-sm">{errors.password.message}</span>
                    )}
                </div>

                <button
                    type="submit"
                    className="w-full p-3 bg-blue-600 text-white rounded-sm hover:bg-blue-700 transition-colors"
                >
                    Create Account
                </button>
            </form>
        </div>
    );
};

export default RegisterForm;

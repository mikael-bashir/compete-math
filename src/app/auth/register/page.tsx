'use client';


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
        <div className="flex justify-center items-center min-h-screen bg-white">
            <form
                onSubmit={handleSubmit(onSubmit)}
                className="bg-white p-8 rounded-lg shadow-md w-full max-w-md"
            >
                <h2 className="text-2xl font-bold text-center mb-6">Create Account</h2>

                <div className="mb-4">
                    <label htmlFor="username" className="block text-gray-700 mb-2">
                        Username
                    </label>
                    <input
                        type="text"
                        id="username"
                        {...register('username', { required: 'Username is required' })}
                        className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
                    />
                    {errors.username && (
                        <span className="text-red-500 text-sm">{errors.username.message}</span>
                    )}
                </div>

                <div className="mb-4">
                    <label htmlFor="password" className="block text-gray-700 mb-2">
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
                        className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
                    />
                    {errors.password && (
                        <span className="text-red-500 text-sm">{errors.password.message}</span>
                    )}
                </div>

                <button
                    type="submit"
                    className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                    Create Account
                </button>
            </form>
        </div>
    );
};

export default RegisterForm;

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { signUpAction } from '@/app/lib/actions/auth';

type RegisterFormData = {
  username: string;
  // email: string;
  password: string;
  confirmPassword: string;
  // firstName: string;
  // lastName: string;
};

const RegisterForm = () => {
  const router = useRouter();
  const { 
    register, 
    handleSubmit, 
    watch,
    formState: { errors } 
  } = useForm<RegisterFormData>();
  const [errorMessage, setErrorMessage] = useState('');

  const onSubmit = async (data: RegisterFormData) => {
    setErrorMessage('');
    try {
      const result = await signUpAction(data);
      if (result?.error) {
        setErrorMessage(result.error);
      } else {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error(error);
      setErrorMessage('Registration failed. Please try again.');
    }
  };

  const password = watch('password');

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-8 rounded-lg shadow-md w-full max-w-md"
      >
        <h2 className="text-2xl font-bold text-center mb-6">Create Account</h2>

        {errorMessage && (
          <div className="text-red-500 text-center mb-4">{errorMessage}</div>
        )}

        {/* <div className="mb-4">
          <label htmlFor="firstName" className="block text-gray-700 mb-2">
            First Name
          </label>
          <input
            type="text"
            id="firstName"
            {...register('firstName', { required: 'First name is required' })}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
          />
          {errors.firstName && (
            <span className="text-red-500 text-sm">{errors.firstName.message}</span>
          )}
        </div> */}

        {/* <div className="mb-4">
          <label htmlFor="lastName" className="block text-gray-700 mb-2">
            Last Name
          </label>
          <input
            type="text"
            id="lastName"
            {...register('lastName', { required: 'Last name is required' })}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
          />
          {errors.lastName && (
            <span className="text-red-500 text-sm">{errors.lastName.message}</span>
          )}
        </div> */}

        {/* <div className="mb-4">
          <label htmlFor="email" className="block text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            id="email"
            {...register('email', { 
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address'
              }
            })}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
          />
          {errors.email && (
            <span className="text-red-500 text-sm">{errors.email.message}</span>
          )}
        </div> */}

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
                value: 6,
                message: 'Password must be at least 6 characters'
              }
            })}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
          />
          {errors.password && (
            <span className="text-red-500 text-sm">{errors.password.message}</span>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-gray-700 mb-2">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            {...register('confirmPassword', { 
              required: 'Please confirm your password',
              validate: value => 
                value === password || 'Passwords do not match'
            })}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
          />
          {errors.confirmPassword && (
            <span className="text-red-500 text-sm">{errors.confirmPassword.message}</span>
          )}
        </div>

        <button
          type="submit"
          className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-semibold"
        >
          Create Account
        </button>
      </form>
    </div>
  );
};

export default RegisterForm;
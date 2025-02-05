'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';

type FormData = {
  username: string;
  password: string;
};

type SignInResponse = {
  error?: string;
  ok?: boolean;
  status?: number;
  url?: string;
};

const LoginForm = () => {
  const router = useRouter();
  const { register, handleSubmit } = useForm<FormData>();
  const [errorMessage, setErrorMessage] = useState('');

  const onSubmit = async (data: FormData) => {
    const response = await signIn('credentials', {
      redirect: false,
      ...data,
    }) as unknown as SignInResponse;

    if (response?.error) {
      setErrorMessage('Invalid credentials. Please try again.');
    } else if (response?.ok) {
      router.push('/');
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-100">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 rounded-lg shadow-md w-full max-w-md"
      >
        <h2 className="text-2xl font-bold text-center mb-6">Login</h2>

        {errorMessage && (
          <div className="text-red-500 text-center mb-4">{errorMessage}</div>
        )}

        <div className="mb-4">
          <label htmlFor="username" className="block text-gray-700 mb-2">
            Username:
          </label>
          <input
            type="text"
            id="username"
            {...register('username', { required: true })}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-gray-700 mb-2">
            Password:
          </label>
          <input
            type="password"
            id="password"
            {...register('password', { required: true })}
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          type="submit"
          className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Login
        </button>
      </form>
    </div>
  );
};

export default LoginForm;

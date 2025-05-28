'use client';


import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { signIn } from '../../../../auth';
import { useRouter } from 'next/navigation';
import { signInAction } from '@/app/lib/actions/auth';
import { LoginFormData } from '@/app/lib/types/form';


type SignInResponse = {
  error?: string;
  ok?: boolean;
  status?: number;
  url?: string;
};

const LoginForm = () => {
  const router = useRouter();
  const { register, handleSubmit } = useForm<LoginFormData>();
  const [errorMessage, setErrorMessage] = useState('');

  const onSubmit = async (data: LoginFormData) => {
    try {
      await signInAction(data);
    } catch(error) {
      console.error(error);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-white">
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
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
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
            className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black"
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

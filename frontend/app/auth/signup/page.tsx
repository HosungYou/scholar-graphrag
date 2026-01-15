'use client';

/**
 * Signup page for ScholaRAG_Graph.
 */

import { SignupForm } from '@/components/auth';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">ScholaRAG_Graph</h1>
          <p className="text-gray-600 mt-2">Create your account</p>
        </div>
        <div className="bg-white py-8 px-6 shadow-lg rounded-xl">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}


import React from 'react';
import { APP_NAME } from '../../constants';

interface AuthFormContainerProps {
  title: string;
  children: React.ReactNode;
  footerContent?: React.ReactNode;
  error?: string | null;
  onClearError?: () => void;
}

const AuthFormContainer: React.FC<AuthFormContainerProps> = ({ title, children, footerContent, error, onClearError }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-dark py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-neutral p-8 sm:p-10 rounded-xl shadow-2xl">
        <div>
          <h1 className="text-center text-4xl font-condensed font-bold text-primary">{APP_NAME}</h1>
          <h2 className="mt-4 text-center text-2xl font-semibold text-neutral-lightest">
            {title}
          </h2>
        </div>
        {error && (
          <div className="bg-red-700 border border-red-600 text-red-100 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">エラー： </strong>
            <span className="block sm:inline">{error}</span>
            {onClearError && (
                <button 
                    onClick={onClearError} 
                    className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-100 hover:text-white"
                >
                <span className="text-2xl leading-none">&times;</span>
                </button>
            )}
          </div>
        )}
        {children}
        {footerContent && (
          <div className="text-sm text-center">
            {footerContent}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthFormContainer;
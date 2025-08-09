"use client";

import { useEffect, useState, useContext, createContext, ReactNode } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string, recaptchaToken?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string, recaptchaToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in with Google';
      setError(errorMessage);
    }
  };

  const signUpWithEmail = async (email: string, password: string, recaptchaToken?: string) => {
    try {
      setError(null);
      
      // If reCAPTCHA token provided, we could verify it here or let Firebase handle it
      // For now, we'll proceed with the signup and let the backend verify the token
      if (recaptchaToken) {
        console.log('reCAPTCHA token received for signup:', recaptchaToken.substring(0, 20) + '...');
      }
      
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account';
      setError(errorMessage);
    }
  };

  const signInWithEmail = async (email: string, password: string, recaptchaToken?: string) => {
    try {
      setError(null);
      
      // If reCAPTCHA token provided, we could verify it here or let Firebase handle it
      if (recaptchaToken) {
        console.log('reCAPTCHA token received for signin:', recaptchaToken.substring(0, 20) + '...');
      }
      
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in';
      setError(errorMessage);
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      await firebaseSignOut(auth);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign out';
      setError(errorMessage);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send password reset email';
      setError(errorMessage);
    }
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signInWithGoogle, 
      signUpWithEmail,
      signInWithEmail,
      signOut, 
      resetPassword,
      error,
      clearError
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 
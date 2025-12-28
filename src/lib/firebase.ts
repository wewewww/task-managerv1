import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCFQT6t4WuaPi9kChmB-3BEp8M82B16XOM",
  authDomain: "todo-tracker-2ec93.firebaseapp.com",
  projectId: "todo-tracker-2ec93",
  storageBucket: "todo-tracker-2ec93.firebasestorage.app",
  messagingSenderId: "254870563973",
  appId: "1:254870563973:web:630b0a2cae7f4a6326cdec"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app); 

// Initialize Functions
export const functions = getFunctions(app); 
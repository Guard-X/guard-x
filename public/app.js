import { auth } from './firebase-init.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

// Sign Up Function
async function handleSignUp() {
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        alert("Passwords don't match!");
        return;
    }

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Account created successfully!");
        window.location.href = "index.html";
    } catch (error) {
        alert(error.message);
    }
}

// Login Function
async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Login successful!");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert(error.message);
    }
}

// Logout Function
function handleLogout() {
    signOut(auth).then(() => {
        window.location.href = "index.html";
    }).catch((error) => {
        alert(error.message);
    });
}

// Auth State Listener
function checkAuthState() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in
            if (document.getElementById('userEmail')) {
                document.getElementById('userEmail').textContent = `Logged in as: ${user.email}`;
            }
        } else {
            // User is signed out
            if (window.location.pathname.includes('dashboard.html')) {
                window.location.href = '../views/dashboard.html';
            }
        }
    });
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthState();
    
    // Add event listeners based on current page
    if (document.getElementById('signupBtn')) {
        document.getElementById('signupBtn').addEventListener('click', handleSignUp);
    }
    
    if (document.getElementById('loginBtn')) {
        document.getElementById('loginBtn').addEventListener('click', handleLogin);
    }
    
    if (document.getElementById('logoutBtn')) {
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    }
});
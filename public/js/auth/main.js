import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { getFirestore, addDoc, collection, setDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { auth } from './firebase-init.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCX-gR9hxdcTsobQxO19dbWg1SIVqJHvUo",
  authDomain: "project-guard-x.firebaseapp.com",
  projectId: "project-guard-x",
  storageBucket: "project-guard-x.firebasestorage.app",
  messagingSenderId: "1087505680893",
  appId: "1:1087505680893:web:df1573d6f6afa9b3d9b194",
  measurementId: "G-8L2L6CRRQN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const tradeCollectionRef = collection(db, "trades");

export { db };

// Sign Up Function (updated with username)
async function handleSignUp() {
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const username = document.getElementById('username').value;

    if (password !== confirmPassword) {
        alert("Passwords don't match!");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Save username to user profile
        await updateProfile(userCredential.user, {
            displayName: username
        });
        
        // Save user data to Firestore
        await setDoc(doc(db, "users", userCredential.user.uid), {
            email: email,
            username: username,
            createdAt: serverTimestamp()
        });

        alert("Account created successfully!");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert(error.message);
    }
}

// Login Function (unchanged)
async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "dashboard.html";
    } catch (error) {
        const errorDisplay = document.getElementById('loginError');
        if (errorDisplay) {
            errorDisplay.textContent = "Invalid email or password.";
        }

    }
}

// Logout Function (unchanged)
function handleLogout() {
    signOut(auth).then(() => {
        window.location.href = "index.html";
    }).catch((error) => {
        alert(error.message);
    });
}

// Auth State Listener (updated for username)
function checkAuthState() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Set welcome message in dashboard
            if (document.getElementById('username')) {
                document.getElementById('username').textContent = user.displayName || user.email;
            }
            
            // Set user email if element exists
            if (document.getElementById('userEmail')) {
                document.getElementById('userEmail').textContent = `Logged in as: ${user.email}`;
            }
        } else {
            if (window.location.pathname.includes('dashboard.html')) {
                window.location.href = "index.html";
            }
        }
    });
}

// Create Trade Post Function (unchanged)
const createTradePost = async (event) => {
    event.preventDefault();
    const itemName = document.getElementById("item-name").value.trim();
    const description = document.getElementById("item-description").value.trim();

    if (!itemName || !description) {
        alert("Please fill in all fields");
        return;
    }

    try {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = "Posting...";

        await addDoc(tradeCollectionRef, {
            itemName: itemName,
            description: description,
            createdAt: new Date()
        });

        alert("Trade post created successfully!");
        document.getElementById("trade-form").reset();
    } catch (error) {
        alert("Failed to create trade post. Please try again.");
    } finally {
        const submitBtn = document.querySelector('#trade-form button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Post Trade";
        }
    }
};

// Initialize the app (unchanged)
document.addEventListener('DOMContentLoaded', function() {
    checkAuthState();
    
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


document.addEventListener('DOMContentLoaded', function() {
    checkAuthState();

    if (document.getElementById('signupBtn')) {
        document.getElementById('signupBtn').addEventListener('click', handleSignUp);
    }
    
    if (document.getElementById('loginBtn')) {
        document.getElementById('loginBtn').addEventListener('click', handleLogin);
    }
    
    if (document.getElementById('logoutBtn')) {
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    }

    const togglePassword = (btnId, inputId) => {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (btn && input) {
            btn.addEventListener('click', () => {
                if (input.type === "password") {
                    input.type = "text";
                    btn.textContent = "Hide";
                } else {
                    input.type = "password";
                    btn.textContent = "Show";
                }
            });
        }
    };

    togglePassword('toggleLoginPass', 'loginPassword');
    togglePassword('toggleSignupPass', 'signupPassword');
    togglePassword('toggleConfirmPass', 'confirmPassword');
});

// Show/hide password with eye icon
document.querySelectorAll('.toggle-password').forEach(icon => {
    icon.addEventListener('click', function() {
        const targetId = this.getAttribute('data-target');
        const input = document.getElementById(targetId);
        const iconElem = this.querySelector('i');
        if (input.type === "password") {
            input.type = "text";
            iconElem.classList.remove('fa-eye');
            iconElem.classList.add('fa-eye-slash');
        } else {
            input.type = "password";
            iconElem.classList.remove('fa-eye-slash');
            iconElem.classList.add('fa-eye');
        }
    });
});

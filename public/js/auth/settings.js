import { auth } from './firebase-init.js';
import {
    onAuthStateChanged,
    signOut,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

// Setup logout button
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) {
        console.error("Logout error:", error);
        alert("Error during logout. Please try again.");
    }
});

// Password change form toggle
const showPasswordForm = document.getElementById('show-password-form');
const passwordForm = document.getElementById('password-change-form');
const cancelPasswordChange = document.getElementById('cancel-password-change');

showPasswordForm.addEventListener('click', () => {
    passwordForm.style.display = 'block';
    showPasswordForm.style.display = 'none';
});

cancelPasswordChange.addEventListener('click', () => {
    passwordForm.style.display = 'none';
    showPasswordForm.style.display = 'block';
    passwordForm.reset();
});

// Handle password change
passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        alert('New password and confirm password do not match.');
        return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
        alert('User not authenticated.');
        return;
    }

    try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        alert('Password updated successfully!');

        passwordForm.style.display = 'none';
        showPasswordForm.style.display = 'block';
        passwordForm.reset();
    } catch (error) {
        console.error('Error updating password:', error);
        alert(error.message || 'Failed to update password.');
    }
});

// Show password form if hash is present
if (window.location.hash === '#password') {
    passwordForm.style.display = 'block';
    showPasswordForm.style.display = 'none';
    window.scrollTo(0, document.getElementById('password-change-form').offsetTop);
}

// Check auth state
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    }
});
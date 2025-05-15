import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { collection, query, where, orderBy, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

function scrollToSection(id) {
    const section = document.getElementById(id);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function setupButtons() {
    // Logout button
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await signOut(auth);
                window.location.href = "index.html";
            } catch (error) {
                console.error("Logout error:", error);
                alert("Error during logout. Please try again.");
            }
        });
    }

    // Profile button
    const profileBtn = document.getElementById("profile-btn");
    if (profileBtn) {
        profileBtn.addEventListener("click", () => {
            window.location.href = "profile.html";
        });
    }

    // Settings button
    const settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            window.location.href = "settings.html";
        });
    }
}

function updateUserUI(user) {
    const usernameSpan = document.getElementById("username");
    if (user) {
        usernameSpan.textContent = user.displayName || user.email;
    }
}

window.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            updateUserUI(user);
        } else {
            window.location.href = "index.html";
        }
    });

    setupButtons();

    document.querySelectorAll('.top-nav button').forEach(button => {
        button.addEventListener('click', function() {
            const sectionId = this.getAttribute('data-section');
            scrollToSection(sectionId);
        });
    });
});

// Friends button
const friendsBtn = document.getElementById("friends-btn");
if (friendsBtn) {
    friendsBtn.addEventListener("click", () => {
        window.location.href = "friends.html";
    });
}

// Notification button logic
const notificationBtn = document.getElementById("notification-btn");
const notificationList = document.getElementById("notification-list");
const notificationBadge = document.getElementById("notification-badge");

let notificationQueue = [];

async function fetchNotifications() {
    if (!auth.currentUser) return;
    const notificationsRef = collection(db, "notifications");
    const q = query(
        notificationsRef,
        where("userId", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    notificationQueue = [];
    notificationList.innerHTML = "";
    let unreadCount = 0;

    if (snapshot.empty) {
        notificationList.innerHTML = "<div class='notification-item'>No notifications.</div>";
    } else {
        snapshot.forEach(docSnap => {
            const n = docSnap.data();
            notificationQueue.push({
                id: docSnap.id,
                type: n.type,
                tradeId: n.tradeId,
                commentId: n.commentId || "",
                msg: n.type === "comment"
                    ? `<b>${n.fromUser}</b> commented: "${n.commentText}"`
                    : `<b>${n.fromUser}</b> replied: "${n.replyText}"`,
                createdAt: n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : "",
                read: n.read
            });
            if (!n.read) unreadCount++;
        });

        notificationQueue.forEach(n => {
            notificationList.innerHTML += `<div class='notification-item${n.read ? " read" : ""}' 
                data-id="${n.id}" 
                data-type="${n.type}" 
                data-tradeid="${n.tradeId}" 
                data-commentid="${n.commentId}">
                ${n.msg}<br>
                <small>${n.createdAt}</small>
            </div>`;
        });
    }

    // Update badge
    if (unreadCount > 0) {
        notificationBadge.textContent = unreadCount;
        notificationBadge.style.display = "inline-block";
    } else {
        notificationBadge.style.display = "none";
    }

    // Add click listeners for each notification
    notificationList.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', async function() {
            const notifId = this.getAttribute('data-id');
            const type = this.getAttribute('data-type');
            const tradeId = this.getAttribute('data-tradeid');
            const commentId = this.getAttribute('data-commentid');

            // Mark as read
            const notifDoc = doc(db, "notifications", notifId);
            await updateDoc(notifDoc, { read: true });

            // Hide the notification list
            notificationList.style.display = "none";

            // Redirect logic
            if (type === "comment") {
                window.location.href = `trade.html?tradeId=${tradeId}&commentId=${commentId}`;
            } else if (type === "reply") {
                window.location.href = `trade.html?tradeId=${tradeId}&commentId=${commentId}&reply=1`;
            }
        });
    });
}

if (notificationBtn) {
    notificationBtn.addEventListener("click", async () => {
        if (notificationList.style.display === "none" || !notificationList.style.display) {
            await fetchNotifications();
            notificationList.style.display = "block";
        } else {
            notificationList.style.display = "none";
        }
    });
}

// Optionally, hide notifications when clicking outside
document.addEventListener("click", (e) => {
    if (
        notificationList.style.display === "block" &&
        !notificationList.contains(e.target) &&
        e.target !== notificationBtn &&
        !notificationBtn.contains(e.target)
    ) {
        notificationList.style.display = "none";
    }
});

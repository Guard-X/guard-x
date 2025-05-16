import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

// Add this function for notifications
function showProfileMessage(msg, type = "success") {
    let msgDiv = document.getElementById("profile-msg");
    if (!msgDiv) {
        msgDiv = document.createElement("div");
        msgDiv.id = "profile-msg";
        msgDiv.style.margin = "10px 0";
        msgDiv.style.padding = "10px 18px";
        msgDiv.style.borderRadius = "8px";
        msgDiv.style.fontWeight = "bold";
        msgDiv.style.textAlign = "center";
        msgDiv.style.transition = "opacity 0.4s";
        document.querySelector(".profile-info").appendChild(msgDiv);
    }
    msgDiv.style.background = type === "success" ? "linear-gradient(90deg, #00C2FF, #A65EFF)" : "#ff4d4d";
    msgDiv.style.color = "#fff";
    msgDiv.textContent = msg;
    msgDiv.style.opacity = "1";
    setTimeout(() => { msgDiv.style.opacity = "0"; }, 2500);
}

// Load profile data and friends
async function loadProfileData(user) {
    // Use Firestore data for username/email
    document.getElementById('profile-username').textContent = user.username || user.email || 'User';
    document.getElementById('profile-email').textContent = user.email || '';
    // Use createdAt if available, else fallback to metadata
    let creationDate = null;
    if (user.createdAt && user.createdAt.toDate) {
        creationDate = user.createdAt.toDate();
    } else if (user.createdAt) {
        creationDate = new Date(user.createdAt);
    } else if (user.metadata && user.metadata.creationTime) {
        creationDate = new Date(user.metadata.creationTime);
    }
    document.getElementById('member-since').textContent = creationDate
        ? `Member since ${creationDate.toLocaleDateString()}`
        : '';

    // Load friends (assuming a 'friends' subcollection under users)
    const friendsList = document.getElementById('friends-list');
    friendsList.innerHTML = '<li>Loading friends...</li>';
    try {
        const friendsRef = collection(db, "users", user.uid, "friends");
        const friendsSnap = await getDocs(friendsRef);
        if (friendsSnap.empty) {
            friendsList.innerHTML = '<li>No friends yet.</li>';
        } else {
            friendsList.innerHTML = '';
            friendsSnap.forEach(docSnap => {
                const f = docSnap.data();
                friendsList.innerHTML += `<li><i class="fas fa-user"></i> ${f.username || f.email || 'Unknown'}</li>`;
            });
        }
        // After loading friends
        const count = friendsSnap.size;
        document.querySelector('.friends-section h2').innerHTML = `<i class="fas fa-user-friends"></i> Friends (${count})`;
    } catch (e) {
        friendsList.innerHTML = '<li>Error loading friends.</li>';
    }
}

// Add this after loading profile data
async function addChatButtonIfFriend(currentUser, profileUserId) {
    if (currentUser.uid === profileUserId) return; // Don't show for self
    const friendDoc = await getDoc(doc(db, "users", currentUser.uid, "friends", profileUserId));
    if (friendDoc.exists()) {
        let btn = document.getElementById("chat-with-user-btn");
        if (!btn) {
            btn = document.createElement("button");
            btn.id = "chat-with-user-btn";
            btn.className = "btn btn-primary";
            btn.innerHTML = `<i class="fas fa-comments"></i> Chat with this user`;
            btn.style.margin = "10px 0 0 0";
            btn.onclick = () => {
                window.location.href = `chat.html?uid=${profileUserId}`;
            };
            document.querySelector(".profile-info").appendChild(btn);
        }
    }
}

// Edit username logic
function setupEditUsername(user) {
    const editBtn = document.getElementById('edit-username-btn');
    const saveBtn = document.getElementById('save-username-btn');
    const usernameDisplay = document.getElementById('profile-username');
    const usernameInput = document.getElementById('edit-username');

    editBtn.addEventListener('click', () => {
        usernameInput.value = user.displayName || '';
        usernameDisplay.style.display = 'none';
        usernameInput.style.display = 'inline-block';
        saveBtn.style.display = 'inline-block';
        editBtn.style.display = 'none';
    });

    saveBtn.addEventListener('click', async () => {
        const newUsername = usernameInput.value.trim();
        if (!newUsername) {
            showProfileMessage("Username cannot be empty.", "error");
            return;
        }
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        let authSuccess = false, firestoreSuccess = false;

        // Try to update Firebase Auth profile
        try {
            await updateProfile(user, { displayName: newUsername });
            authSuccess = true;
        } catch (e) {
            // Ignore error here, we'll check Firestore next
        }

        // Try to update Firestore
        try {
            await setDoc(doc(db, "users", user.uid), { username: newUsername }, { merge: true });
            firestoreSuccess = true;
        } catch (e) {
            // Ignore error here, we'll check below
        }

        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';

        if (authSuccess || firestoreSuccess) {
            usernameDisplay.textContent = newUsername;
            showProfileMessage("Username updated!", "success");
            usernameDisplay.style.display = 'block';
            usernameInput.style.display = 'none';
            saveBtn.style.display = 'none';
            editBtn.style.display = 'inline-block';
        } else {
            showProfileMessage("Failed to update username.", "error");
        }
    });
}

// Logout button
function setupLogout() {
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = "index.html";
        } catch (error) {
            showProfileMessage("Error during logout. Please try again.", "error");
        }
    });
}

// Auth state
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    const urlUid = getQueryParam("uid");
    const profileUserId = urlUid || user.uid;

    // Load the profile user's Firestore doc
    const profileUserDoc = await getDoc(doc(db, "users", profileUserId));
    const profileUserData = profileUserDoc.exists() ? profileUserDoc.data() : {};

    // Show profile info
    document.getElementById('profile-username').textContent = profileUserData.username || profileUserData.email || 'User';
    document.getElementById('profile-email').textContent = profileUserData.email || '';
    if (profileUserData.createdAt) {
        const creationDate = profileUserData.createdAt.toDate ? profileUserData.createdAt.toDate() : new Date(profileUserData.createdAt);
        document.getElementById('member-since').textContent = `Member since ${creationDate.toLocaleDateString()}`;
    } else if (profileUserId === user.uid) {
        const creationDate = new Date(user.metadata.creationTime);
        document.getElementById('member-since').textContent = `Member since ${creationDate.toLocaleDateString()}`;
    } else {
        document.getElementById('member-since').textContent = '';
    }

    // Load friends for the profile user
    await loadProfileData({ ...profileUserData, uid: profileUserId });

    // After loading profile data
    const isSelf = profileUserId === user.uid;

    // Check if already friends
    let isFriend = false;
    if (!isSelf) {
        const friendDoc = await getDoc(doc(db, "users", user.uid, "friends", profileUserId));
        isFriend = friendDoc.exists();
    }

    document.getElementById('edit-username-btn').style.display = isSelf ? 'inline-block' : 'none';
    document.getElementById('save-username-btn').style.display = 'none';
    document.getElementById('edit-username').style.display = 'none';
    // Only show add-friend-btn if not self and not already friends
    document.getElementById('add-friend-btn').style.display = (!isSelf && !isFriend) ? 'inline-block' : 'none';

    // Midman section: only show if self and role is midman
    const midmanSection = document.getElementById("midman-role-section");
    if (isSelf && profileUserData.role === "midman") {
        midmanSection.style.display = "block";
        const toggle = document.getElementById("midman-online-toggle");
        toggle.checked = !!profileUserData.online;
        toggle.onchange = async () => {
            await setDoc(doc(db, "users", user.uid), { online: toggle.checked }, { merge: true });
            document.getElementById("midman-online-label").textContent = toggle.checked ? "Active" : "Inactive";
        };
        document.getElementById("midman-online-label").textContent = toggle.checked ? "Active" : "Inactive";
    } else {
        midmanSection.style.display = "none";
    }

    // Add chat button if not self and is friend
    if (!isSelf && isFriend) {
        await addChatButtonIfFriend(user, profileUserId);
    }
});

function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
}

async function sendFriendRequest(currentUser, targetUser) {
    if (!currentUser?.uid || !targetUser?.id) {
        showMsg("Invalid user data", "error");
        return false;
    }
    if (currentUser.uid === targetUser.id) {
        showMsg("You can't add yourself!", "error");
        return false;
    }
    try {
        const reqRef = doc(db, "users", targetUser.id, "friendRequests", currentUser.uid);
        await setDoc(reqRef, {
            from: currentUser.uid,
            to: targetUser.id, // <-- THIS IS REQUIRED FOR RULES
            fromEmail: currentUser.email,
            fromUsername: currentUser.displayName || "",
            status: "pending",
            createdAt: Date.now()
        });
        showMsg("Friend request sent!", "success");
        return true;
    } catch (error) {
        console.error("Error sending friend request:", error);
        showMsg("Failed to send friend request", "error");
        return false;
    }
}
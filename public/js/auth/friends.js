import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import {
    collection, query, where, getDocs,
    doc, setDoc, getDoc, deleteDoc,
    updateDoc, writeBatch, runTransaction, collectionGroup
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

// At the top of your file (after imports)
const lastRequestTimestamps = {};

// Show message
function showMsg(msg, type = "success") {
    const msgDiv = document.getElementById("add-friend-msg");
    msgDiv.textContent = msg;
    msgDiv.style.color = type === "success" ? "#00C2FF" : "#ff4d4d";
    setTimeout(() => { msgDiv.textContent = ""; }, 2500);
}

// Search user by email or username with detailed logging
async function findUser(identifier) {
    if (!identifier) {
        console.log("No identifier provided");
        return null;
    }
    
    try {
        console.log(`Searching for user with identifier: ${identifier}`);
        let q;
        
        if (identifier.includes("@")) {
            q = query(collection(db, "users"), 
                     where("email", "==", identifier.toLowerCase()));
        } else {
            q = query(collection(db, "users"), 
                     where("username", "==", identifier));
        }
        
        const snap = await getDocs(q);
        console.log(`Found ${snap.size} matching users`);
        
        if (snap.empty) {
            showMsg("User not found", "error");
            return null;
        }
        
        const userData = snap.docs[0].data();
        console.log("Found user data:", userData);
        
        return {
            id: snap.docs[0].id,
            email: userData.email,
            username: userData.username || userData.email
        };
    } catch (error) {
        console.error("Detailed findUser error:", {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        showMsg("Error searching for user", "error");
        return null;
    }
}

// Enhanced sendFriendRequest with cooldown, self-check, and bidirectional/duplicate checks
async function sendFriendRequest(currentUser, targetUser) {
    try {
        // Validate users
        if (!currentUser?.uid || !targetUser?.id) {
            throw new Error("Invalid user data");
        }
        
        if (currentUser.uid === targetUser.id) {
            throw new Error("You cannot send a friend request to yourself");
        }

        // Check for existing requests and friendship
        const [existingRequest, existingFriendship] = await Promise.all([
            getDoc(doc(db, "users", targetUser.id, "friendRequests", currentUser.uid)),
            getDoc(doc(db, "users", currentUser.uid, "friends", targetUser.id))
        ]);

        if (existingRequest.exists()) {
            const status = existingRequest.data().status;
            if (status === "pending") throw new Error("Friend request already sent");
            if (status === "accepted") throw new Error("You are already friends");
        }

        if (existingFriendship.exists()) {
            throw new Error("You are already friends with this user");
        }

        // Create the request with document ID = sender's UID
        const requestData = {
            from: currentUser.uid,
            to: targetUser.id,
            fromUsername: currentUser.displayName || currentUser.email.split('@')[0],
            fromEmail: currentUser.email.toLowerCase(),
            status: "pending",
            createdAt: new Date().toISOString()
        };

        await setDoc(
            doc(db, "users", targetUser.id, "friendRequests", currentUser.uid),
            requestData
        );

        showMsg("Friend request sent successfully", "success");
        return true;
    } catch (error) {
        console.error("Send Friend Request Error:", {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        showMsg(`Failed to send request: ${error.message}`, "error");
        return false;
    }
}

// Improved acceptFriendRequest: uses data from the request document itself
async function acceptFriendRequest(currentUser, fromUserId) {
    try {
        const requestRef = doc(db, "users", currentUser.uid, "friendRequests", fromUserId);

        // First verify the request exists and is pending
        const requestDoc = await getDoc(requestRef);
        if (!requestDoc.exists()) {
            // Refresh UI in case request was already processed
            await loadPendingRequests(currentUser);
            throw new Error("Request not found. It may have been canceled.");
        }

        const requestData = requestDoc.data();
        if (requestData.status !== "pending") {
            // Remove the request from UI since it's already processed
            const listItem = document.querySelector(`li[data-request-id="${fromUserId}"]`);
            if (listItem) listItem.remove();
            throw new Error("Request already processed");
        }

        // Get sender's user data
        const fromUserDoc = await getDoc(doc(db, "users", fromUserId));
        if (!fromUserDoc.exists()) {
            throw new Error("Sender account not found");
        }
        const fromUserData = fromUserDoc.data();

        // Use transaction for atomic operations
        await runTransaction(db, async (transaction) => {
            // 1. Update request status
            transaction.update(requestRef, { status: "accepted" });

            // 2. Create friend records - ensure all required fields are present
            const currentUserFriendRef = doc(db, "users", currentUser.uid, "friends", fromUserId);
            transaction.set(currentUserFriendRef, {
                id: fromUserId,
                username: fromUserData.username || fromUserData.email.split('@')[0],
                email: fromUserData.email || requestData.fromEmail, // Fallback to request data if needed
                since: new Date().toISOString()
            });

            const otherUserFriendRef = doc(db, "users", fromUserId, "friends", currentUser.uid);
            transaction.set(otherUserFriendRef, {
                id: currentUser.uid,
                username: currentUser.displayName || currentUser.email.split('@')[0],
                email: currentUser.email, // Ensure this is always defined
                since: new Date().toISOString()
            });
        });

        // Remove the request from UI immediately
        const listItem = document.querySelector(`li[data-request-id="${fromUserId}"]`);
        if (listItem) listItem.remove();

        // Refresh friends list
        await loadFriends(currentUser);
        showMsg("Friend request accepted", "success");
        return true;
    } catch (error) {
        console.error("Accept friend request failed:", error);
        showMsg(`Failed to accept: ${error.message}`, "error");
        return false;
    }
}

// Reject friend request and clean up both directions if needed
async function rejectFriendRequest(currentUser, fromUserId) {
    try {
        const requestRef = doc(db, "users", currentUser.uid, "friendRequests", fromUserId);
        
        // Verify request exists
        const requestDoc = await getDoc(requestRef);
        if (!requestDoc.exists()) {
            throw new Error("Friend request not found");
        }

        // Delete the request
        await deleteDoc(requestRef);

        // Remove from UI immediately
        const listItem = document.querySelector(`li[data-request-id="${fromUserId}"]`);
        if (listItem) listItem.remove();

        showMsg("Friend request rejected", "success");
        return true;
    } catch (error) {
        console.error("Error rejecting friend request:", error);
        showMsg(`Failed to reject: ${error.message}`, "error");
        return false;
    }
}

// Improved loadPendingRequests with better error handling
async function loadPendingRequests(currentUser) {
    const list = document.getElementById("pending-requests-list");
    if (!currentUser?.uid) {
        console.error("No current user UID available");
        return;
    }
    if (!list) return;

    try {
        list.innerHTML = "<li class='loading'>Loading requests...</li>";

        const q = query(
            collection(db, "users", currentUser.uid, "friendRequests"),
            where("status", "==", "pending")
        );

        const snap = await getDocs(q);

        if (snap.empty) {
            list.innerHTML = "<li class='no-requests'>No pending requests</li>";
            return;
        }

        list.innerHTML = "";
        snap.forEach((docSnap) => {
            const req = docSnap.data();
            const li = document.createElement("li");
            li.dataset.requestId = req.from;  // Use the sender's ID as the identifier
            
            li.innerHTML = `
                <div class="request-info">
                    <i class="fas fa-user"></i>
                    <span class="username">${req.fromUsername || req.fromEmail || req.from}</span>
                </div>
                <div class="request-actions">
                    <button class="friend-action-btn accept-btn">Accept</button>
                    <button class="friend-action-btn reject-btn">Reject</button>
                </div>
            `;

            // Add click handlers with proper error handling
            const setupButtonHandler = (button, action) => {
                button.onclick = async (e) => {
                    e.target.disabled = true;
                    e.target.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    
                    try {
                        const success = await action(currentUser, req.from);
                        if (success) {
                            li.remove(); // Remove from UI on success
                            if (action === acceptFriendRequest) {
                                await loadFriends(currentUser); // Refresh friends list
                            }
                        } else {
                            e.target.disabled = false;
                            e.target.innerHTML = action === acceptFriendRequest ? 'Accept' : 'Reject';
                        }
                    } catch (error) {
                        e.target.disabled = false;
                        e.target.innerHTML = action === acceptFriendRequest ? 'Accept' : 'Reject';
                        console.error("Action failed:", error);
                    }
                };
            };

            setupButtonHandler(li.querySelector(".accept-btn"), acceptFriendRequest);
            setupButtonHandler(li.querySelector(".reject-btn"), rejectFriendRequest);

            list.appendChild(li);
        });
    } catch (error) {
        console.error("Error loading pending requests:", error);
        list.innerHTML = `
            <li class="error">
                Error loading requests. 
                <button onclick="loadPendingRequests(currentUser)">Retry</button>
            </li>
        `;
    }
}

// Load friends list with debug logging
async function loadFriends(currentUser) {
    const list = document.getElementById("friends-list");
    if (!list) return;
    
    list.innerHTML = "<li>Loading...</li>";
    
    try {
        console.log("Current User UID:", currentUser.uid); // matches Firestore
        const friendsRef = collection(db, "users", currentUser.uid, "friends");
        console.log("Friends Collection Path:", friendsRef.path); // "users/CURRENT_USER_ID/friends"

        const snap = await getDocs(friendsRef);
        
        if (snap.empty) {
            list.innerHTML = "<li>No friends yet</li>";
            return;
        }
        
        list.innerHTML = "";
        for (const docSnap of snap.docs) {
            const friend = docSnap.data();
            const friendData = await getDoc(doc(db, "users", friend.id));
            
            const li = document.createElement("li");
            li.innerHTML = `
                <i class="fas fa-user"></i> 
                ${friendData.exists() ? 
                  (friendData.data().username || friendData.data().email) : 
                  friend.id}
                <button class="friend-action-btn view-btn">View Profile</button>
            `;
            li.querySelector(".view-btn").onclick = () => {
                window.location.href = `profile.html?uid=${friend.id}`;
            };
            list.appendChild(li);
        }
    } catch (error) {
        console.error("🔥 FULL LOAD FRIENDS ERROR:", error); // error
        list.innerHTML = "<li>Error loading friends list</li>";
    }
}

// Clean up stale (older than 30 days) pending requests
async function cleanupStaleRequests(currentUser) {
    try {
        const q = query(
            collectionGroup(db, "friendRequests"),
            where("status", "==", "pending"),
            where("createdAt", "<", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        );

        const snap = await getDocs(q);
        const batch = writeBatch(db);

        snap.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`Cleaned up ${snap.size} stale requests`);
    } catch (error) {
        console.error("Cleanup error:", error);
    }
}

// Replace the relevant part of setupAddFriendForm with this improved UI logic:
function setupAddFriendForm(currentUser) {
    const form = document.getElementById("add-friend-form");
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const identifier = document.getElementById("friend-identifier").value.trim();
        const resultDiv = document.getElementById("add-friend-msg");

        if (!identifier) {
            showMsg("Please enter an email or username", "error");
            return;
        }

        try {
            // Search by email or username
            let user = await findUser(identifier);

            // If not found and input looks like an email, try lowercased
            if (!user && identifier.includes("@")) {
                user = await findUser(identifier.toLowerCase());
            }

            if (!user) {
                resultDiv.innerHTML = "";
                showMsg("User not found", "error");
                return;
            }

            // Show found user info and add friend button
            resultDiv.innerHTML = `
                <div class="user-result">
                    <i class="fas fa-user"></i>
                    <b>${user.username || user.email}</b><br>
                    <small>User ID: ${user.id}</small><br>
                    <button id="send-friend-request-btn" class="friend-action-btn">
                        <i class="fas fa-user-plus"></i> Send Friend Request
                    </button>
                    <div id="request-status"></div>
                </div>
            `;

            const btn = document.getElementById("send-friend-request-btn");
            const statusDiv = document.getElementById("request-status");

            btn.onclick = async () => {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

                const success = await sendFriendRequest(currentUser, user);

                if (success) {
                    btn.innerHTML = '<i class="fas fa-check"></i> Request Sent';
                    statusDiv.textContent = "Request sent successfully!";
                    statusDiv.style.color = "#00C2FF";
                } else {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-user-plus"></i> Send Friend Request';
                    statusDiv.textContent = "Failed to send request";
                    statusDiv.style.color = "#ff4d4d";
                }
            };
        } catch (error) {
            console.error("Error in friend search:", error);
            showMsg("Error processing request", "error");
        }
    };
}

// Initialize
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.querySelector(".add-friend-section").style.display = "block";
        setupAddFriendForm(user);
        loadPendingRequests(user);
        loadFriends(user);
    } else {
        window.location.href = "index.html";
    }
});
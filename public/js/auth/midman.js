import { auth, db } from './firebase-init.js';
import {
    collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, serverTimestamp, updateDoc, query, where
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

const midmanOnlineList = document.getElementById('midman-online-list');
const queueList = document.getElementById('queue-list');
const queueInfo = document.getElementById('queue-info');
const requestBtn = document.getElementById('request-midman-btn');
const adminControls = document.getElementById('midman-admin-controls');
const adminQueueList = document.getElementById('admin-queue-list');

let currentUser = null;
let currentUserRole = "user";
let queueUnsub = null;
let midmanUnsub = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;
    // Get user role
    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUserRole = userDoc.exists() ? userDoc.data().role : "user";
    if (currentUserRole === "midman") {
        adminControls.style.display = "block";
        listenToAdminQueue();
    }
    listenToQueue();
    listenToMidmen();
    updateQueueInfo();
});

function listenToMidmen() {
    // Assume midmen are users with { role: "midman", online: true }
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("role", "==", "midman"), where("online", "==", true));
    if (midmanUnsub) midmanUnsub();
    midmanUnsub = onSnapshot(q, (snap) => {
        midmanOnlineList.innerHTML = "";
        if (snap.empty) {
            midmanOnlineList.innerHTML = "<span class='loading'>No midmen are online right now.</span>";
        } else {
            snap.forEach(docSnap => {
                const m = docSnap.data();
                midmanOnlineList.innerHTML += `
                    <div class="midman-online">
                        <i class="fas fa-user-shield"></i>
                        <span>${m.username || m.email || docSnap.id}</span>
                    </div>
                `;
            });
        }
    });
}

function listenToQueue() {
    // Queue is a collection: midmanQueue, each doc: { userId, username, requestedAt }
    const queueRef = collection(db, "midmanQueue");
    const q = query(queueRef, where("status", "==", "waiting"));
    if (queueUnsub) queueUnsub();
    queueUnsub = onSnapshot(q, (snap) => {
        queueList.innerHTML = "";
        let position = 1;
        let myPosition = null;
        let myQueueDocId = null;
        if (snap.empty) {
            queueList.innerHTML = "<span class='loading'>No one is in the queue.</span>";
        } else {
            snap.forEach(docSnap => {
                const qd = docSnap.data();
                const isMe = qd.userId === currentUser?.uid;
                if (isMe) {
                    myPosition = position;
                    myQueueDocId = docSnap.id;
                }
                queueList.innerHTML += `
                    <div class="queue-user${isMe ? " me" : ""}">
                        <span class="queue-position">${position}</span>
                        <span class="queue-username">${qd.username || qd.userEmail || qd.userId}</span>
                        ${isMe ? `<span>(You)</span> <button class="cancel-my-queue-btn" data-id="${docSnap.id}"><i class="fas fa-times"></i> Cancel Request</button>` : ""}
                    </div>
                `;
                position++;
            });
        }
        updateQueueInfo(myPosition, position - 1);

        // Add cancel event for the current user's request
        queueList.querySelectorAll('.cancel-my-queue-btn').forEach(btn => {
            btn.onclick = async () => {
                const queueId = btn.getAttribute('data-id');
                // Optional: add a toast or confirmation here
                await updateDoc(doc(db, "midmanQueue", queueId), {
                    status: "cancelled",
                    cancelledAt: serverTimestamp()
                });
                // Optional: show a toast
                if (window.showToast) showToast("Your midman request has been cancelled.", "success");
            };
        });
    });
}

async function updateQueueInfo(myPosition = null, total = null) {
    if (myPosition !== null && total !== null) {
        if (myPosition) {
            queueInfo.innerHTML = `You are <b>#${myPosition}</b> in line. ${total - myPosition} ahead of you.`;
        } else {
            queueInfo.innerHTML = `You are not in the queue.`;
        }
        return;
    }
    // fallback: recalculate from Firestore
    const queueRef = collection(db, "midmanQueue");
    const q = query(queueRef, where("status", "==", "waiting"));
    const snap = await getDocs(q);
    let pos = null, count = 0;
    snap.forEach((docSnap, idx) => {
        count++;
        if (docSnap.data().userId === currentUser?.uid) pos = idx + 1;
    });
    if (pos) {
        queueInfo.innerHTML = `You are <b#${pos}</b> in line. ${count - pos} ahead of you.`;
    } else {
        queueInfo.innerHTML = `You are not in the queue.`;
    }
}

if (requestBtn) {
    requestBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        const otherUserInput = document.querySelector('.add-user-input');
        const otherUsername = otherUserInput ? otherUserInput.value.trim() : "";
        if (!otherUsername) {
            if (window.showToast) showToast("Please enter the username of the other trader.", "error");
            else alert("Please enter the username of the other trader.");
            return;
        }
        // Check if already in queue
        const queueRef = collection(db, "midmanQueue");
        const q = query(queueRef, where("userId", "==", currentUser.uid), where("status", "==", "waiting"));
        const snap = await getDocs(q);
        if (!snap.empty) {
            if (window.showToast) showToast("You are already in the queue.", "error");
            else alert("You are already in the queue.");
            return;
        }
        await addDoc(queueRef, {
            userId: currentUser.uid,
            username: currentUser.displayName || "",
            userEmail: currentUser.email,
            otherUsername: otherUsername,
            requestedAt: serverTimestamp(),
            status: "waiting"
        });
        if (window.showToast) showToast("Request sent! Waiting for a midman.", "success");
        updateQueueInfo();
    });
}

// ADMIN: Listen to full queue for midman controls
function listenToAdminQueue() {
    const queueRef = collection(db, "midmanQueue");
    const q = query(queueRef, where("status", "==", "waiting"));
    onSnapshot(q, (snap) => {
        adminQueueList.innerHTML = "";
        if (snap.empty) {
            adminQueueList.innerHTML = "<span class='loading'>No pending requests.</span>";
        } else {
            snap.forEach(docSnap => {
                const qd = docSnap.data();
                adminQueueList.innerHTML += `
                    <div class="queue-user">
                        <span class="queue-position"></span>
                        <span>${qd.username || qd.userEmail || qd.userId}</span>
                        <span style="color:#00C2FF; margin-left:0.5em;">wants to trade with:</span>
                        <span class="queue-username" style="color:#A65EFF; font-weight:600;">${qd.otherUsername || '[Not specified]'}</span>
                        <input type="text" class="add-user-input" placeholder="Other User Username" style="margin-left:1em; width: 180px;" value="${qd.otherUsername || ''}">
                        <button class="accept-btn" data-id="${docSnap.id}"><i class="fas fa-check"></i> Accept</button>
                        <button class="cancel-btn" data-id="${docSnap.id}"><i class="fas fa-times"></i> Cancel</button>
                    </div>
                `;
            });
            // Add event listeners for accept/cancel
            adminQueueList.querySelectorAll('.accept-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    const queueId = btn.getAttribute('data-id');
                    const queueUserDiv = btn.closest('.queue-user');
                    const input = queueUserDiv.querySelector('.add-user-input');
                    const otherUserIdentifier = input ? input.value.trim() : "";

                    if (!otherUserIdentifier) {
                        if (window.showToast) showToast("Please enter the other user's username.", "error");
                        return;
                    }

                    // Find the other user by username
                    let otherUserUid = null, otherUserName = "";
                    const usersRef = collection(db, "users");
                    const q = query(usersRef, where("username", "==", otherUserIdentifier));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const docSnap = snap.docs[0];
                        otherUserUid = docSnap.id;
                        otherUserName = docSnap.data().username;
                    }
                    if (!otherUserUid) {
                        if (window.showToast) showToast("Other user not found.", "error");
                        return;
                    }

                    // Accept: update queue status and create trade room
                    await updateDoc(doc(db, "midmanQueue", queueId), {
                        status: "accepted",
                        midmanId: currentUser.uid,
                        acceptedAt: serverTimestamp()
                    });
                    // Get queue data for trade room creation
                    const queueSnap = await getDoc(doc(db, "midmanQueue", queueId));
                    const qd = queueSnap.data();

                    // Create trade room with requester, other user, and midman
                    const tradeRoomDoc = await addDoc(collection(db, "tradeRooms"), {
                        participants: [qd.userId, otherUserUid, currentUser.uid],
                        traders: [
                            { uid: qd.userId, username: qd.username || qd.userEmail || qd.userId, items: [] },
                            { uid: otherUserUid, username: otherUserName, items: [] }
                        ],
                        midman: { uid: currentUser.uid, username: currentUser.displayName || currentUser.email },
                        status: "active",
                        createdAt: serverTimestamp()
                    });
                    // Notify requester
                    await addDoc(collection(db, "notifications"), {
                        userId: qd.userId,
                        type: "tradeRoomReady",
                        tradeRoomId: tradeRoomDoc.id,
                        tradeRoomCreatedAt: serverTimestamp(),
                        fromMidman: currentUser.displayName || currentUser.email,
                        message: `Your trade room is ready!`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
                    // Notify other user
                    await addDoc(collection(db, "notifications"), {
                        userId: otherUserUid,
                        type: "tradeRoomReady",
                        tradeRoomId: tradeRoomDoc.id,
                        tradeRoomCreatedAt: serverTimestamp(),
                        fromMidman: currentUser.displayName || currentUser.email,
                        message: `Your trade room is ready!`,
                        read: false,
                        createdAt: serverTimestamp()
                    });
                    if (window.showToast) showToast("Trade room created! Both users have been notified.", "success");
                };
            });
            adminQueueList.querySelectorAll('.cancel-btn').forEach(btn => {
                btn.onclick = async () => {
                    const queueId = btn.getAttribute('data-id');
                    if (window.showConfirm) {
                        showConfirm("Cancel this request?", async () => {
                            await updateDoc(doc(db, "midmanQueue", queueId), {
                                status: "cancelled",
                                cancelledAt: serverTimestamp()
                            });
                            if (window.showToast) showToast("Request cancelled.", "success");
                        });
                    } else {
                        // fallback
                        await updateDoc(doc(db, "midmanQueue", queueId), {
                            status: "cancelled",
                            cancelledAt: serverTimestamp()
                        });
                        if (window.showToast) showToast("Request cancelled.", "success");
                    }
                };
            });
        }
    });
}

function loadTradeRooms() {
    const tradeRoomsRef = collection(db, "tradeRooms");
    const q = query(tradeRoomsRef, where("participants", "array-contains", currentUser.uid));
    const friendsUl = document.getElementById("friends-ul");
    if (window.tradeRoomsUnsub) window.tradeRoomsUnsub();
    window.tradeRoomsUnsub = onSnapshot(q, (snap) => {
        friendsUl.innerHTML = "";
        if (snap.empty) {
            friendsUl.innerHTML = "<li>No trade rooms.</li>";
        } else {
            snap.forEach(docSnap => {
                const room = docSnap.data();
                const li = document.createElement("li");
                li.textContent = `Trade Room (${room.traders.map(t => t.username).join(" vs ")})`;
                li.onclick = () => selectTradeRoom(docSnap.id, room);
                li.dataset.roomid = docSnap.id;
                friendsUl.appendChild(li);
            });
        }
    });
}
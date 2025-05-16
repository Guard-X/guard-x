import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import {
    collection, doc, getDoc, getDocs, setDoc, addDoc, query, orderBy, onSnapshot, where,
    updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

let currentUser = null;
let selectedFriend = null;
let unsubscribeChat = null;
let selectedTradeRoomId = null;

// Load friends and set up UI
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;
    await loadFriends();
    await loadTradeRooms();
});

async function loadFriends() {
    const friendsUl = document.getElementById("friends-ul");
    friendsUl.innerHTML = "<li>Loading...</li>";
    const friendsRef = collection(db, "users", currentUser.uid, "friends");
    const snap = await getDocs(friendsRef);
    friendsUl.innerHTML = "";
    if (snap.empty) {
        friendsUl.innerHTML = "<li>No friends yet.</li>";
        return;
    }
    snap.forEach(docSnap => {
        const friend = docSnap.data();
        const li = document.createElement("li");
        li.textContent = friend.username || friend.email || friend.id;
        li.onclick = () => selectFriend(friend);
        li.dataset.uid = friend.id;
        friendsUl.appendChild(li);
    });
}

async function loadTradeRooms() {
    const tradeRoomsRef = collection(db, "tradeRooms");
    const q = query(tradeRoomsRef, where("participants", "array-contains", currentUser.uid));
    const snap = await getDocs(q);
    const friendsUl = document.getElementById("friends-ul");
    snap.forEach(docSnap => {
        const room = docSnap.data();
        const li = document.createElement("li");
        li.textContent = `Trade Room (${room.traders.map(t => t.username).join(" vs ")})`;
        li.onclick = () => selectTradeRoom(docSnap.id, room);
        li.dataset.roomid = docSnap.id;
        friendsUl.appendChild(li);
    });
}

function selectFriend(friend) {
    selectedFriend = friend;
    document.getElementById("chat-with").textContent = `Chat with ${friend.username || friend.email || friend.id}`;
    document.querySelectorAll("#friends-ul li").forEach(li => {
        li.classList.toggle("active", li.dataset.uid === friend.id);
    });
    loadChatMessages(friend.id);
}

function getChatId(uid1, uid2) {
    // Always order UIDs to ensure both users use the same chatId
    return [uid1, uid2].sort().join("_");
}

function loadChatMessages(friendUid) {
    const chatId = getChatId(currentUser.uid, friendUid);
    const messagesRef = collection(db, "chats", chatId, "messages");
    const chatMessagesDiv = document.getElementById("chat-messages");
    chatMessagesDiv.innerHTML = "<div>Loading...</div>";

    // Unsubscribe previous listener
    if (unsubscribeChat) unsubscribeChat();

    const q = query(messagesRef, orderBy("createdAt", "asc"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        chatMessagesDiv.innerHTML = "";
        snap.forEach(docSnap => {
            const msg = docSnap.data();
            const div = document.createElement("div");
            div.className = "message " + (msg.from === currentUser.uid ? "me" : "them");

            // Time above message
            const timeDiv = document.createElement("div");
            timeDiv.className = "msg-time";
            const date = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
            timeDiv.textContent = date.toLocaleString();
            div.appendChild(timeDiv);

            // Message text
            const textDiv = document.createElement("span");
            textDiv.className = "msg-text";
            textDiv.textContent = msg.text;
            div.appendChild(textDiv);

            if (msg.from === currentUser.uid) {
                // 3-dot menu
                const menuWrap = document.createElement("span");
                menuWrap.className = "msg-menu-wrap";
                menuWrap.innerHTML = `
                    <button class="msg-menu-btn" title="More"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="msg-menu-popup" style="display:none;">
                        <button class="edit-btn"><i class="fas fa-edit"></i> Edit</button>
                        <button class="delete-btn"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                `;
                // Show/hide popup
                const menuBtn = menuWrap.querySelector(".msg-menu-btn");
                const popup = menuWrap.querySelector(".msg-menu-popup");
                menuBtn.onclick = (e) => {
                    e.stopPropagation();
                    // Hide other popups
                    document.querySelectorAll('.msg-menu-popup').forEach(p => p.style.display = 'none');
                    popup.style.display = popup.style.display === "block" ? "none" : "block";
                };
                // Hide popup when clicking elsewhere
                document.addEventListener("click", () => popup.style.display = "none");

                // Edit
                menuWrap.querySelector(".edit-btn").onclick = (e) => {
                    e.stopPropagation();
                    popup.style.display = "none";
                    editMessage(docSnap.ref, msg.text, div);
                };
                // Delete
                menuWrap.querySelector(".delete-btn").onclick = async (e) => {
                    e.stopPropagation();
                    popup.style.display = "none";
                    if (confirm("Delete this message?")) {
                        await deleteDoc(docSnap.ref);
                    }
                };
                div.appendChild(menuWrap);
            }

            chatMessagesDiv.appendChild(div);
        });
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    });
}

// Edit message function
function editMessage(messageRef, oldText, messageDiv) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = oldText;
    input.style.width = "70%";
    messageDiv.innerHTML = "";
    messageDiv.appendChild(input);

    // Save button
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.className = "edit-btn";
    saveBtn.onclick = async (e) => {
        e.stopPropagation();
        const newText = input.value.trim();
        if (newText && newText !== oldText) {
            await updateDoc(messageRef, { text: newText });
        }
    };
    messageDiv.appendChild(saveBtn);

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "delete-btn";
    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        // Restore original text and buttons
        messageDiv.innerHTML = oldText;
    };
    messageDiv.appendChild(cancelBtn);
}

// Send message
document.getElementById("chat-form").onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    // If a trade room is selected, send to trade room
    if (selectedTradeRoomId) {
        const messagesRef = collection(db, "tradeRooms", selectedTradeRoomId, "messages");
        await addDoc(messagesRef, {
            from: currentUser.uid,
            text,
            createdAt: new Date()
        });
        return;
    }

    // Otherwise, send to friend chat
    if (!selectedFriend) return;
    const chatId = getChatId(currentUser.uid, selectedFriend.id);
    const messagesRef = collection(db, "chats", chatId, "messages");
    await addDoc(messagesRef, {
        from: currentUser.uid,
        to: selectedFriend.id,
        text,
        createdAt: new Date()
    });
};

function selectTradeRoom(roomId, roomData) {
    selectedTradeRoomId = roomId;
    const chatWith = document.getElementById("chat-with");
    chatWith.innerHTML = `Trade Room: ${roomData.traders.map(t => t.username).join(" vs ")}`;

    // Add Delete Room button for midman
    if (roomData.midman.uid === currentUser.uid) {
        const delRoomBtn = document.createElement("button");
        delRoomBtn.textContent = "Delete Room";
        delRoomBtn.className = "delete-btn";
        delRoomBtn.style.marginLeft = "1em";
        delRoomBtn.onclick = async () => {
            if (confirm("Are you sure you want to delete this trade room? This cannot be undone.")) {
                await deleteDoc(doc(db, "tradeRooms", roomId));
                document.getElementById("chat-with").textContent = "";
                document.getElementById("chat-messages").innerHTML = "";
                selectedTradeRoomId = null;
                // Optionally, reload trade rooms list
                await loadTradeRooms();
            }
        };
        chatWith.appendChild(delRoomBtn);
    }

    document.querySelectorAll("#friends-ul li").forEach(li => {
        li.classList.toggle("active", li.dataset.roomid === roomId);
    });
    loadTradeRoomMessages(roomId, roomData);

    // Kick buttons (as before)
    if (roomData.midman.uid === currentUser.uid) {
        roomData.traders.forEach(trader => {
            if (trader.uid !== currentUser.uid) {
                const kickBtn = document.createElement("button");
                kickBtn.textContent = `Kick ${trader.username}`;
                kickBtn.onclick = async () => {
                    const newParticipants = roomData.participants.filter(uid => uid !== trader.uid);
                    await updateDoc(doc(db, "tradeRooms", roomId), {
                        participants: newParticipants,
                        traders: roomData.traders.filter(t => t.uid !== trader.uid)
                    });
                    alert(`${trader.username} has been kicked from the trade room.`);
                };
                chatWith.appendChild(kickBtn);
            }
        });
    }
}

function loadTradeRoomMessages(roomId, roomData) {
    const messagesRef = collection(db, "tradeRooms", roomId, "messages");
    const chatMessagesDiv = document.getElementById("chat-messages");
    chatMessagesDiv.innerHTML = "<div>Loading...</div>";

    if (unsubscribeChat) unsubscribeChat();

    const q = query(messagesRef, orderBy("createdAt", "asc"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        chatMessagesDiv.innerHTML = "";
        snap.forEach(docSnap => {
            const msg = docSnap.data();
            const div = document.createElement("div");
            div.className = "message " + (msg.from === currentUser.uid ? "me" : "them");

            // Time above message
            const timeDiv = document.createElement("div");
            timeDiv.className = "msg-time";
            const date = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt);
            timeDiv.textContent = date.toLocaleString();
            div.appendChild(timeDiv);

            // Message text
            const textDiv = document.createElement("span");
            textDiv.className = "msg-text";
            textDiv.textContent = msg.text;
            div.appendChild(textDiv);

            // Midman controls: delete message
            if (roomData.midman.uid === currentUser.uid) {
                const delBtn = document.createElement("button");
                delBtn.className = "delete-btn";
                delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm("Delete this message?")) {
                        await deleteDoc(docSnap.ref);
                    }
                };
                div.appendChild(delBtn);
            }

            chatMessagesDiv.appendChild(div);
        });
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    });
}
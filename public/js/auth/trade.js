import { auth, db } from "./firebase-init.js";
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    deleteDoc,
    doc,
    serverTimestamp,
    getDoc,
    onSnapshot,
    updateDoc,
    arrayUnion,
    orderBy
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

// Add this helper at the top or near your imports
function showToast(message, type = "info") {
    let toast = document.createElement("div");
    toast.className = `custom-toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add("show"); }, 10);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// Add this helper function near showToast
function showConfirm(message, onConfirm) {
    // Remove any existing confirm modal
    document.querySelectorAll('.custom-confirm-modal').forEach(m => m.remove());
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'custom-confirm-modal';
    modal.innerHTML = `
        <div class="custom-confirm-content">
            <span class="custom-confirm-message">${message}</span>
            <div class="custom-confirm-actions">
                <button class="custom-confirm-yes">Yes</button>
                <button class="custom-confirm-no">No</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => { modal.classList.add("show"); }, 10);

    modal.querySelector('.custom-confirm-yes').onclick = () => {
        modal.classList.remove("show");
        setTimeout(() => modal.remove(), 300);
        onConfirm();
    };
    modal.querySelector('.custom-confirm-no').onclick = () => {
        modal.classList.remove("show");
        setTimeout(() => modal.remove(), 300);
    };
}

const tradeCollectionRef = collection(db, "trades");
const commentsCollectionRef = collection(db, "comments");
// Display user's trade posts
const displayUserTradePosts = async (user) => {
    if (!user) return;

    const tradePostsList = document.getElementById("trade-posts-list");

    try {
        tradePostsList.innerHTML = '<div style="text-align: center; padding: 1rem;"><i class="fas fa-spinner fa-spin"></i> Loading your trades...</div>';

        const q = query(tradeCollectionRef, where("userId", "==", user.uid));
        const querySnapshot = await getDocs(q);

        tradePostsList.innerHTML = '';

        if (querySnapshot.empty) {
            tradePostsList.innerHTML = `
                <div class="no-trades">
                    <i class="fas fa-info-circle"></i>
                    <p>You have no active trades. Create one above!</p>
                </div>
            `;
            showToast("No active trades found.", "info");
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const tradeData = docSnap.data();
            const tradeElement = document.createElement("div");
            tradeElement.classList.add("trade-item");

            const priceDisplay = tradeData.price
                ? `<div class="price-tag">${tradeData.price}</div>`
                : '';

            const createdAt = tradeData.createdAt?.toDate ? tradeData.createdAt.toDate() : new Date();

            // Only one Comments button, no preview
            tradeElement.innerHTML = `
                <div class="shine"></div>
                <h3>${tradeData.gameName || 'Various Games'}</h3>
                <h4>${tradeData.itemName}</h4>
                ${priceDisplay}
                <p>${tradeData.description}</p>
                <small>Posted: ${createdAt.toLocaleString()}</small>
                <div class="trade-meta">
                    <button class="comment-btn" data-id="${docSnap.id}">
                        <i class="fas fa-comments"></i> Comments
                    </button>
                    <button class="delete-btn" data-id="${docSnap.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            tradePostsList.appendChild(tradeElement);
        });

        // Delete button logic
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const tradeId = e.target.closest('.delete-btn').dataset.id;
                showConfirm('Are you sure you want to delete this trade?', async () => {
                    try {
                        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
                        button.disabled = true;
                        await deleteDoc(doc(db, "trades", tradeId));
                        await displayUserTradePosts(user);
                        showToast("Trade deleted successfully!", "success");
                    } catch (error) {
                        showToast(`Failed to delete trade: ${error.message}`, "error");
                        button.innerHTML = '<i class="fas fa-trash"></i> Delete';
                        button.disabled = false;
                    }
                });
            });
        });
    } catch (error) {
        tradePostsList.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading your trades: ${error.message}</p>
                <button class="retry-btn" onclick="window.location.reload()">Try Again</button>
            </div>
        `;
    }
};

// Create trade post
const createTradePost = async (event) => {
    event.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        showToast("Please sign in to create trade posts", "error");
        window.location.href = "index.html";
        return;
    }

    const gameName = document.getElementById("game-name").value.trim();
    const itemName = document.getElementById("item-name").value.trim();
    const description = document.getElementById("item-description").value.trim();
    const price = document.getElementById("item-price").value.trim();
    const submitBtn = event.target.querySelector('button[type="submit"]');

    if (!gameName || !itemName || !description) {
        showToast("Please fill in all required fields", "error");
        return;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

        const tradeData = {
            gameName,
            itemName,
            description,
            price: price || null,
            createdAt: serverTimestamp(),
            userId: user.uid,
            userEmail: user.email,
            comments: [] // Ensure comments array exists
        };

        await addDoc(tradeCollectionRef, tradeData);

        document.getElementById("trade-form").reset();
        await displayUserTradePosts(user);

        submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Post Trade';
        submitBtn.disabled = false;
    } catch (error) {
        showToast(`Error: ${error.message}`, "error");
        submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Post Trade';
        submitBtn.disabled = false;
    }
};

// Modal logic for comments
let unsubscribeComments = null;
let currentTradeId = null;

document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        const tradeForm = document.getElementById("trade-form");
        if (tradeForm) {
            tradeForm.addEventListener("submit", createTradePost);
        }

        displayUserTradePosts(user);
    });

    // Modal logic
    const modal = document.getElementById('comment-modal');
    const commentsContainer = document.getElementById('comments-container');
    const tradeItemTitle = document.getElementById('trade-item-title');
    const commentForm = document.getElementById('comment-form');
    const commentText = document.getElementById('comment-text');

    // Open modal and show all comments
    document.body.addEventListener('click', async function(e) {
        if (e.target.classList.contains('comment-btn') || e.target.closest('.comment-btn')) {
            const btn = e.target.classList.contains('comment-btn') ? e.target : e.target.closest('.comment-btn');
            currentTradeId = btn.dataset.id;

            // Set trade title
            const tradeDoc = await getDoc(doc(db, "trades", currentTradeId));
            if (tradeDoc.exists()) {
                const tradeData = tradeDoc.data();
                tradeItemTitle.textContent = tradeData.itemName || "Trade";
            }

            // Remove previous listener if any
            if (unsubscribeComments) unsubscribeComments();

            // Listen to comments in the comments collection
            const q = query(
                commentsCollectionRef,
                where("tradeId", "==", currentTradeId),
                orderBy("createdAt", "desc")
            );
            unsubscribeComments = onSnapshot(q, (snapshot) => {
                commentsContainer.innerHTML = '';
                if (snapshot.empty) {
                    commentsContainer.innerHTML = '<div class="no-trades">No comments yet.</div>';
                    return;
                }
                snapshot.forEach(doc => {
                    const c = doc.data();
                    const commentId = doc.id;
                    const timestamp = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : 'Just now';
                    const commentDiv = document.createElement('div');
                    commentDiv.classList.add('comment');
                    commentDiv.innerHTML = `
                        <span class="comment-user">${c.userEmail || 'Anonymous'}:</span>
                        <span>${c.text}</span>
                        <small>${timestamp}</small>
                        <button class="reply-btn" data-commentid="${commentId}"><i class="fas fa-reply"></i> Reply</button>
                        <div class="replies" id="replies-${commentId}"></div>
                        <form class="reply-form" id="reply-form-${commentId}" style="display:none; margin-top:0.5rem;">
                            <textarea class="reply-text" rows="2" placeholder="Write a reply..." required></textarea>
                            <button type="submit" class="reply-submit-btn"><i class="fas fa-paper-plane"></i> Reply</button>
                        </form>
                    `;
                    commentsContainer.appendChild(commentDiv);

                    // Load replies for this comment
                    loadReplies(commentId);

                    // Reply button logic
                    commentDiv.querySelector('.reply-btn').onclick = () => {
                        // Hide all other reply forms
                        document.querySelectorAll('.reply-form').forEach(f => f.style.display = 'none');
                        // Show this one
                        commentDiv.querySelector('.reply-form').style.display = 'block';
                    };

                    // Reply form submit logic
                    commentDiv.querySelector('.reply-form').onsubmit = async (e) => {
                        e.preventDefault();
                        const user = auth.currentUser;
                        if (!user) return;
                        const replyText = commentDiv.querySelector('.reply-text').value.trim();
                        if (!replyText) {
                            showToast("Please enter a reply.", "error");
                            return;
                        }
                        const repliesRef = collection(db, "comments", commentId, "replies");
                        await addDoc(repliesRef, {
                            userId: user.uid,
                            userEmail: user.email,
                            text: replyText,
                            createdAt: serverTimestamp()
                        });
                        commentDiv.querySelector('.reply-text').value = '';
                        commentDiv.querySelector('.reply-form').style.display = 'none';

                        const parentCommentDoc = await getDoc(doc(db, "comments", commentId));
                        if (parentCommentDoc.exists()) {
                            const parentCommentData = parentCommentDoc.data();
                            const parentCommentOwnerId = parentCommentData.userId;
                            if (parentCommentOwnerId !== user.uid) { // Only notify if not replying to your own comment
                                await addDoc(collection(db, "notifications"), {
                                    userId: parentCommentOwnerId,
                                    type: "reply",
                                    tradeId: currentTradeId,
                                    commentId: commentId,
                                    replyText: replyText,
                                    fromUser: user.email,
                                    createdAt: serverTimestamp(),
                                    read: false
                                });
                            }
                        }
                    };
                });
            });

            modal.classList.add('active');
        }

        if (e.target.classList.contains('close-modal')) {
            modal.classList.remove('active');
            if (unsubscribeComments) {
                unsubscribeComments();
                unsubscribeComments = null;
            }
        }
    });

    // Post a new comment to the comments collection
    if (commentForm) {
        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            if (!user || !currentTradeId) return;

            const text = commentText.value.trim();
            if (!text) {
                showToast("Please enter a comment.", "error");
                return;
            }

            const submitBtn = commentForm.querySelector('button[type="submit"]');
            try {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

                const commentDocRef = await addDoc(commentsCollectionRef, {
                    tradeId: currentTradeId,
                    userId: user.uid,
                    userEmail: user.email,
                    text,
                    createdAt: serverTimestamp()
                });

                commentText.value = '';

                // After posting a comment
                const tradeDoc = await getDoc(doc(db, "trades", currentTradeId));
                if (tradeDoc.exists()) {
                    const tradeData = tradeDoc.data();
                    if (tradeData.userId !== user.uid) { // Only notify if not commenting on your own trade
                        await addDoc(collection(db, "notifications"), {
                            userId: tradeData.userId,
                            type: "comment",
                            tradeId: currentTradeId,
                            commentId: commentDocRef.id,
                            commentText: text,
                            fromUser: user.email,
                            createdAt: serverTimestamp(),
                            read: false
                        });
                    }
                }
            } catch (error) {
                showToast("Failed to post comment.", "error");
            } finally {
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Comment';
                submitBtn.disabled = false;
            }
        });
    }

    // Helper to render all comments
    function updateCommentsDisplay(comments) {
        if (Array.isArray(comments) && comments.length > 0) {
            // Sort comments by timestamp (newest first)
            const sortedComments = [...comments].sort((a, b) => {
                const aTime = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
                const bTime = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
                return bTime - aTime;
            });

            commentsContainer.innerHTML = sortedComments.map(c => {
                const timestamp = c.timestamp?.toDate ? c.timestamp.toDate().toLocaleString() : 'Just now';
                return `
                    <div class="comment">
                        <span class="comment-user">${c.user || 'Anonymous'}:</span>
                        <span>${c.text}</span>
                        <small>${timestamp}</small>
                    </div>
                `;
            }).join('');
        } else {
            commentsContainer.innerHTML = '<div class="no-trades">No comments yet.</div>';
        }
    }

    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
            if (unsubscribeComments) {
                unsubscribeComments();
                unsubscribeComments = null;
            }
        }
    });

    // Check for notification navigation
    const urlParams = new URLSearchParams(window.location.search);
    const tradeId = urlParams.get('tradeId');
    const commentId = urlParams.get('commentId');
    const isReply = urlParams.get('reply');

    if (tradeId) {
        // Simulate clicking the comments button for this trade
        setTimeout(async () => {
            currentTradeId = tradeId;
            // Set trade title
            const tradeDoc = await getDoc(doc(db, "trades", currentTradeId));
            if (tradeDoc.exists()) {
                const tradeData = tradeDoc.data();
                tradeItemTitle.textContent = tradeData.itemName || "Trade";
            }
            // Remove previous listener if any
            if (unsubscribeComments) unsubscribeComments();
            // Listen to comments in the comments collection
            const q = query(
                commentsCollectionRef,
                where("tradeId", "==", currentTradeId),
                orderBy("createdAt", "desc")
            );
            unsubscribeComments = onSnapshot(q, (snapshot) => {
                commentsContainer.innerHTML = '';
                if (snapshot.empty) {
                    commentsContainer.innerHTML = '<div class="no-trades">No comments yet.</div>';
                    return;
                }
                snapshot.forEach(doc => {
                    const c = doc.data();
                    const thisCommentId = doc.id;
                    const timestamp = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : 'Just now';
                    const commentDiv = document.createElement('div');
                    commentDiv.classList.add('comment');
                    commentDiv.id = `comment-${thisCommentId}`;
                    commentDiv.innerHTML = `
                        <span class="comment-user">${c.userEmail || 'Anonymous'}:</span>
                        <span>${c.text}</span>
                        <small>${timestamp}</small>
                        <button class="reply-btn" data-commentid="${thisCommentId}"><i class="fas fa-reply"></i> Reply</button>
                        <div class="replies" id="replies-${thisCommentId}"></div>
                        <form class="reply-form" id="reply-form-${thisCommentId}" style="display:none; margin-top:0.5rem;">
                            <textarea class="reply-text" rows="2" placeholder="Write a reply..." required></textarea>
                            <button type="submit" class="reply-submit-btn"><i class="fas fa-paper-plane"></i> Reply</button>
                        </form>
                    `;
                    commentsContainer.appendChild(commentDiv);

                    // Load replies for this comment
                    loadReplies(thisCommentId);

                    // Reply button logic
                    commentDiv.querySelector('.reply-btn').onclick = () => {
                        document.querySelectorAll('.reply-form').forEach(f => f.style.display = 'none');
                        commentDiv.querySelector('.reply-form').style.display = 'block';
                    };

                    // Reply form submit logic
                    commentDiv.querySelector('.reply-form').onsubmit = async (e) => {
                        e.preventDefault();
                        const user = auth.currentUser;
                        if (!user) return;
                        const replyText = commentDiv.querySelector('.reply-text').value.trim();
                        if (!replyText) {
                            showToast("Please enter a reply.", "error");
                            return;
                        }
                        const repliesRef = collection(db, "comments", thisCommentId, "replies");
                        await addDoc(repliesRef, {
                            userId: user.uid,
                            userEmail: user.email,
                            text: replyText,
                            createdAt: serverTimestamp()
                        });
                        commentDiv.querySelector('.reply-text').value = '';
                        commentDiv.querySelector('.reply-form').style.display = 'none';

                        const parentCommentDoc = await getDoc(doc(db, "comments", thisCommentId));
                        if (parentCommentDoc.exists()) {
                            const parentCommentData = parentCommentDoc.data();
                            const parentCommentOwnerId = parentCommentData.userId;
                            if (parentCommentOwnerId !== user.uid) { // Only notify if not replying to your own comment
                                await addDoc(collection(db, "notifications"), {
                                    userId: parentCommentOwnerId,
                                    type: "reply",
                                    tradeId: currentTradeId,
                                    commentId: thisCommentId,
                                    replyText: replyText,
                                    fromUser: user.email,
                                    createdAt: serverTimestamp(),
                                    read: false
                                });
                            }
                        }
                    };
                });

                // Open modal
                modal.classList.add('active');

                // Scroll to comment or reply if needed
                if (commentId) {
                    setTimeout(() => {
                        const commentElem = document.getElementById(`comment-${commentId}`);
                        if (commentElem) {
                            commentElem.scrollIntoView({ behavior: "smooth", block: "center" });
                            commentElem.style.boxShadow = "0 0 12px 4px #00C2FF";
                            setTimeout(() => commentElem.style.boxShadow = "", 2000);
                        }
                    }, 400);
                }
            });
        }, 500);
    }
});

// Helper to load replies for a comment
function loadReplies(commentId) {
    const repliesContainer = document.getElementById(`replies-${commentId}`);
    const repliesRef = collection(db, "comments", commentId, "replies");
    const q = query(repliesRef, orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        repliesContainer.innerHTML = '';
        snapshot.forEach(docSnap => {
            const reply = docSnap.data();
            repliesContainer.innerHTML += `
                <div class="reply">
                    <span class="reply-user">${reply.userEmail || 'Anonymous'}:</span>
                    <span>${reply.text}</span>
                    <small>${reply.createdAt ? reply.createdAt.toDate().toLocaleString() : 'Recently'}</small>
                </div>
            `;
        });
    });
}
import { auth, db } from "./firebase-init.js";
import { 
  collection, 
  addDoc, 
  getDocs,
  query,
  where,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { 
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

const tradeCollectionRef = collection(db, "trades");

const displayMyTradePosts = async (userId) => {
    try {
        const q = query(tradeCollectionRef, where("userId", "==", userId));
        const querySnapshot = await getDocs(q);

        const tradePostsList = document.getElementById("trade-posts-list");
        tradePostsList.innerHTML = '';

        if (querySnapshot.empty) {
            tradePostsList.innerHTML = '<p class="no-trades">You have no active trade posts.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const tradeData = docSnap.data();
            const tradeElement = document.createElement("div");
            tradeElement.classList.add("trade-item");

            // Comments preview (last 2)
            let commentsPreviewHtml = "";
            if (Array.isArray(tradeData.comments) && tradeData.comments.length > 0) {
                const preview = tradeData.comments.slice(-2).map(c =>
                    `<div class="comment">
                        <span class="comment-user">${c.user || 'Anonymous'}:</span>
                        <span>${c.text}</span>
                    </div>`
                ).join('');
                commentsPreviewHtml = `
                    <div class="comments-preview" id="comments-preview-${docSnap.id}">
                        ${preview}
                    </div>
                `;
            } else {
                commentsPreviewHtml = `<div class="comments-preview" id="comments-preview-${docSnap.id}">
                    <div class="no-trades">No comments yet.</div>
                </div>`;
            }

            tradeElement.innerHTML = `
                <div class="shine"></div>
                <h3>${tradeData.gameName || 'Unknown Game'}: ${tradeData.itemName}</h3>
                <p>${tradeData.description}</p>
                ${tradeData.price ? `<div class="price">${tradeData.price}</div>` : ''}
                <small>Posted: ${tradeData.createdAt?.toDate().toLocaleString() || 'Unknown'}</small>
                <div class="trade-meta">
                    <button class="comment-btn" data-id="${docSnap.id}">
                        <i class="fas fa-comments"></i> Comments
                    </button>
                    <button class="delete-btn" data-id="${docSnap.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
                ${commentsPreviewHtml}
            `;
            tradePostsList.appendChild(tradeElement);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm("Are you sure you want to delete this trade?")) {
                    try {
                        await deleteDoc(doc(db, "trades", btn.dataset.id));
                        displayMyTradePosts(userId);
                    } catch (error) {
                        console.error("Error deleting trade:", error);
                        alert("Failed to delete trade. Please try again.");
                    }
                }
            });
        });

        // Modal logic for showing all comments
        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tradeId = btn.dataset.id;
                // Find the trade data from the DOM
                const docSnap = await getDocs(query(tradeCollectionRef, where("__name__", "==", tradeId)));
                let tradeData;
                docSnap.forEach(d => tradeData = d.data());

                const modal = document.getElementById('comment-modal');
                const commentsContainer = document.getElementById('comments-container');
                const tradeItemTitle = document.getElementById('trade-item-title');
                tradeItemTitle.textContent = tradeData?.itemName || "Trade";

                // Render all comments
                if (Array.isArray(tradeData?.comments) && tradeData.comments.length > 0) {
                    commentsContainer.innerHTML = tradeData.comments.map(c =>
                        `<div class="comment">
                            <span class="comment-user">${c.user || 'Anonymous'}:</span>
                            <span>${c.text}</span>
                        </div>`
                    ).join('');
                } else {
                    commentsContainer.innerHTML = '<div class="no-trades">No comments yet.</div>';
                }
                modal.classList.add('active');
            });
        });

        // Close modal logic
        document.querySelector('.close-modal').onclick = () => {
            document.getElementById('comment-modal').classList.remove('active');
        };
        document.getElementById('comment-modal').onclick = (e) => {
            if (e.target === e.currentTarget) e.currentTarget.classList.remove('active');
        };

    } catch (error) {
        console.error("Error fetching trade posts:", error);
        document.getElementById("trade-posts-list").innerHTML =
            '<p class="error-message">Error loading trade posts. Please try again.</p>';
    }
};

const createTradePost = async (event) => {
    event.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        alert("Please sign in to create trade posts");
        window.location.href = "index.html";
        return;
    }

    const gameName = document.getElementById("game-name").value.trim();
    const itemName = document.getElementById("item-name").value.trim();
    const description = document.getElementById("item-description").value.trim();
    const price = document.getElementById("item-price").value.trim();

    if (!gameName || !itemName || !description) {
        alert("Please fill in all required fields");
        return;
    }

    try {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

        // Add trade to Firestore
        await addDoc(tradeCollectionRef, {
            gameName: gameName,
            itemName: itemName,
            description: description,
            price: price || null,
            createdAt: new Date(),
            userId: user.uid,
            userEmail: user.email,
            status: "active" // Changed from "pending" to "active" for immediate visibility
        });

        // Reset form and refresh list
        document.getElementById("trade-form").reset();
        await displayMyTradePosts(user.uid);
        
        // Show success message
        const successMsg = document.createElement('div');
        successMsg.className = 'success-message';
        successMsg.innerHTML = '<i class="fas fa-check-circle"></i> Trade posted successfully!';
        document.querySelector('.trade-form-section').appendChild(successMsg);
        setTimeout(() => successMsg.remove(), 3000);
    } catch (error) {
        console.error("Error creating trade post:", error);
        alert(`Error: ${error.message}`);
    } finally {
        const submitBtn = document.querySelector('#trade-form button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Post Trade';
        }
    }
};

// Initialize the page
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
        
        displayMyTradePosts(user.uid);
    });
});
/**
 * Dynamic content loader for register.html (user data)
 */

class UserDataManager {
    constructor() {
        this.currentPage = 1;
        this.limit = 20;
        this.filters = {
            search: ''
        };
        this.init();
    }

    async init() {
        await this.loadUserData();
        this.setupEventListeners();
    }

    async loadUserData() {
        try {
            const queryParams = new URLSearchParams({
                page: this.currentPage,
                limit: this.limit,
                ...this.filters
            });

            const response = await fetch(`/api/table/users?${queryParams}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderUserTable(data.data);
                this.renderPagination(data.pagination);
            } else {
                console.error('Error fetching user data:', data.error);
                this.showError('Failed to load user data');
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            this.showError('Network error while loading data');
        }
    }

    renderUserTable(userData) {
        const tableBody = document.querySelector('.register-users-table tbody');
        if (!tableBody) return;

        // Clear existing rows
        tableBody.innerHTML = '';

        if (userData.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center">No users found</td>
                </tr>
            `;
            return;
        }

        userData.forEach((user, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <th scope="row">${this.extractUsername(user.username)}</th>
                <td>
                    <span class="password-hidden" data-user-id="${user.user_id}">*********</span>
                    <span class="material-symbols-rounded txt-icon btn-visibility" 
                          onclick="userManager.togglePasswordVisibility(${user.user_id})"
                          style="cursor: pointer;">
                        visibility
                    </span>
                </td>
                <td>${this.formatDate(user.register_date)}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    renderPagination(pagination) {
        // Create pagination controls
        const tableContainer = document.querySelector('.register-users-table').parentElement;
        let paginationDiv = document.querySelector('.user-pagination-controls');
        
        if (!paginationDiv) {
            paginationDiv = document.createElement('div');
            paginationDiv.className = 'user-pagination-controls mt-3 d-flex justify-content-between align-items-center';
            tableContainer.appendChild(paginationDiv);
        }

        paginationDiv.innerHTML = `
            <div class="pagination-info">
                Showing ${((pagination.currentPage - 1) * pagination.limit) + 1} to 
                ${Math.min(pagination.currentPage * pagination.limit, pagination.totalRecords)} 
                of ${pagination.totalRecords} users
            </div>
            <div class="pagination-buttons">
                <button class="btn btn-sm btn-outline-primary me-2" 
                        onclick="userManager.goToPage(${pagination.currentPage - 1})"
                        ${pagination.currentPage <= 1 ? 'disabled' : ''}>
                    Previous
                </button>
                <span class="current-page">Page ${pagination.currentPage} of ${pagination.totalPages}</span>
                <button class="btn btn-sm btn-outline-primary ms-2" 
                        onclick="userManager.goToPage(${pagination.currentPage + 1})"
                        ${pagination.currentPage >= pagination.totalPages ? 'disabled' : ''}>
                    Next
                </button>
            </div>
        `;
    }

    setupEventListeners() {
        // // Search functionality
        // let searchInput = document.getElementById('userSearchInput');
        
        // // If search input doesn't exist, create it
        // if (!searchInput) {
        //     this.createSearchInput();
        //     searchInput = document.getElementById('userSearchInput');
        // }

        // if (searchInput) {
        //     let searchTimeout;
        //     searchInput.addEventListener('input', (e) => {
        //         clearTimeout(searchTimeout);
        //         searchTimeout = setTimeout(() => {
        //             this.filters.search = e.target.value;
        //             this.currentPage = 1;
        //             this.loadUserData();
        //         }, 500);
        //     });
        // }

        // Register form submission
        const registerBtn = document.querySelector('.btn-register');
        if (registerBtn) {
            registerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleUserRegistration();
            });
        }
    }

    createSearchInput() {
        const tableContainer = document.querySelector('.register-users-table').parentElement;
        const searchDiv = document.createElement('div');
        searchDiv.className = 'user-search-container mb-3';
        searchDiv.innerHTML = `
            <div class="input-group">
                <span class="input-group-text">
                    <span class="material-symbols-rounded">search</span>
                </span>
                <input type="text" id="userSearchInput" class="form-control" 
                       placeholder="Search users by email...">
            </div>
        `;
        
        tableContainer.insertBefore(searchDiv, tableContainer.firstChild);
    }

    async handleUserRegistration() {
        const name = document.getElementById('temail').value.trim();
        const password = document.getElementById('tpassword').value;
        const confirmPassword = document.getElementById('tconfpassword').value;

        // Basic validation
        if (!name || !password || !confirmPassword) {
            this.showMessage('Please fill in all fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showMessage('Passwords do not match', 'error');
            return;
        }

        if (password.length < 6) {
            this.showMessage('Password must be at least 6 characters long', 'error');
            return;
        }

        console.log(name, password, confirmPassword);
        try {
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    temail: name,
                    tpassword: password,
                    tconfpassword: confirmPassword
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showMessage('User registered successfully!', 'success');
                this.clearForm();
                this.loadUserData(); // Refresh the user list
            } else {
                this.showMessage(data.message || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showMessage('Network error during registration', 'error');
        }
    }

    togglePasswordVisibility(userId) {
        const passwordSpan = document.querySelector(`[data-user-id="${userId}"]`);
        const visibilityIcon = passwordSpan.nextElementSibling;
        
        if (passwordSpan.textContent === '*********') {
            passwordSpan.textContent = '[Hidden for security]';
            visibilityIcon.textContent = 'visibility_off';
        } else {
            passwordSpan.textContent = '*********';
            visibilityIcon.textContent = 'visibility';
        }
    }

    extractUsername(email) {
        // Extract username from email or return as is
        if (email && email.includes('@')) {
            return email.split('@')[0];
        }
        return email || 'Unknown';
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        
        return `${day}/${month}/${year}`;
    }

    clearForm() {
        document.getElementById('tname').value = '';
        document.getElementById('tpassword').value = '';
        document.getElementById('tconfpassword').value = '';
    }

    goToPage(page) {
        if (page < 1) return;
        this.currentPage = page;
        this.loadUserData();
    }

    showError(message) {
        const tableBody = document.querySelector('.register-users-table tbody');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-danger">
                        <i class="material-symbols-rounded">error</i> ${message}
                    </td>
                </tr>
            `;
        }
    }

    showMessage(message, type = 'info') {
        // Remove existing message
        const existingMessage = document.querySelector('.user-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create new message
        const messageDiv = document.createElement('div');
        messageDiv.className = `user-message alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} alert-dismissible fade show`;
        messageDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        // Insert message before the register form
        const registerFrame = document.querySelector('.register-frame');
        registerFrame.parentNode.insertBefore(messageDiv, registerFrame);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }
}

// Initialize when DOM is loaded
let userManager;
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the register page
    if (document.querySelector('.register-users-table')) {
        userManager = new UserDataManager();
    }
});

// Export for global access
window.userManager = userManager;

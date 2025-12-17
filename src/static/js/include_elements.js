let cachedAuthStatus = null;

document.addEventListener("DOMContentLoaded", () => {
    loadHeader();
    loadLeftMenu();
});

function isAdminRole(role) {
    if (role === undefined || role === null) return false;
    if (typeof role === "string") {
        const normalized = role.toLowerCase();
        if (normalized === "admin" || normalized === "1") return true;
    }
    if (typeof role === "number" && role === 1) return true;
    const asNumber = Number(role);
    return asNumber === 1;
}

async function loadHeader() {
    const headerPlaceholder = document.getElementById("header-placeholder");
    if (!headerPlaceholder) return;

    try {
        const response = await fetch("header.html");
        headerPlaceholder.innerHTML = await response.text();
        const status = await getAuthStatus();
        await syncAuthButton(headerPlaceholder, status);
    } catch (error) {
        console.error("Erro ao carregar o header:", error);
    }
}

async function syncAuthButton(headerPlaceholder, statusOverride = null) {
    const loginButton = headerPlaceholder.querySelector("#auth-button") || headerPlaceholder.querySelector(".btn-login");
    const logoutButton = headerPlaceholder.querySelector(".btn-logout");
    const authIcon = loginButton?.querySelector(".btn-login-icon");
    const authLabel = loginButton?.querySelector(".btn-login-label");

    // Cache-busted auth status check + cookie fallback
    const status = statusOverride || await getAuthStatus();
    const cookieAuth = document.cookie.includes("auth_status=1");
    const isAuthenticated = Boolean(status.authenticated || cookieAuth);

    if (isAuthenticated) {
        if (loginButton) {
            loginButton.classList.add("d-none");
        }
        if (logoutButton) {
            logoutButton.classList.remove("d-none");
            logoutButton.onclick = async (event) => {
                event.preventDefault();
                await logoutUser();
            };
        } else if (loginButton) {
            // Fallback for single-button header
            if (authIcon) authIcon.textContent = "logout";
            if (authLabel) authLabel.textContent = "LOG OUT";
            loginButton.onclick = async (event) => {
                event.preventDefault();
                await logoutUser();
            };
            loginButton.classList.remove("d-none");
        }
    } else {
        if (logoutButton) {
            logoutButton.classList.add("d-none");
        }
        if (loginButton) {
            if (authIcon) authIcon.textContent = "login";
            if (authLabel) authLabel.textContent = "LOG IN";
            loginButton.onclick = () => ButtonGoTo("/login");
            loginButton.classList.remove("d-none");
        }
    }
}

async function getAuthStatus(forceRefresh = false) {
    if (!forceRefresh && cachedAuthStatus) return cachedAuthStatus;

    try {
        const response = await fetch("/auth/status", {
            credentials: "include",
            cache: "no-store"
        });
        if (!response.ok) {
            cachedAuthStatus = { authenticated: false };
            return cachedAuthStatus;
        }
        const data = await response.json();
        data.isAdmin = data.isAdmin ?? isAdminRole(data.user?.role);
        cachedAuthStatus = data;
        return data;
    } catch (error) {
        console.error("Erro ao verificar autenticacao:", error);
        cachedAuthStatus = { authenticated: false };
        return cachedAuthStatus;
    }
}

async function logoutUser() {
    try {
        const response = await fetch("/auth/logout", {
            method: "POST",
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            console.error("Falha ao deslogar:", response.status);
        }
    } catch (error) {
        console.error("Erro durante logout:", error);
    } finally {
        // Clean client-side flag proactively
        document.cookie = "auth_status=; Max-Age=0; path=/";
        cachedAuthStatus = null;
        // Volta para a home padrao apos logout
        window.location.replace("/");
    }
}

async function loadLeftMenu() {
    const leftMenuPlaceholder = document.getElementById("leftmenu-placeholder");
    if (!leftMenuPlaceholder) return;

    try {
        const response = await fetch("left_menu.html");
        leftMenuPlaceholder.innerHTML = await response.text();
        const status = await getAuthStatus();
        const newUserButton = leftMenuPlaceholder.querySelector('button[onclick*="/register"]');
        if (newUserButton && (!status.authenticated || !status.isAdmin)) {
            newUserButton.remove();
        }
    } catch (error) {
        console.error("Erro ao carregar o menu lateral:", error);
    }
}

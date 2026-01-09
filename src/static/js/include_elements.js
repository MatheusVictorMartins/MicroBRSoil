var cachedAuthStatus = window.cachedAuthStatus || null;
const CACHE_VERSION = "20251227";
const HEADER_CACHE_KEY = `microbrsoil_header_${CACHE_VERSION}`;
const LEFT_MENU_CACHE_KEY = `microbrsoil_leftmenu_${CACHE_VERSION}`;
const APP_CONSTANTS = window.APP_CONSTANTS || {};
const ROUTES = APP_CONSTANTS.ROUTES || {
    AUTH_STATUS: "/auth/status",
    AUTH_REFRESH: "/auth/refresh",
    AUTH_LOGOUT: "/auth/logout",
    AUTH_LOGIN: "/login",
    PIPELINE_RUNS: "/pipeline/runs"
};
const ADMIN_ROLE_VALUES = (APP_CONSTANTS.ROLES && APP_CONSTANTS.ROLES.ADMIN_VALUES) || ["admin", "ADMIN", "1", 1];

const SESSION_GUARD_CHECK_MS = 2 * 60 * 1000;
const SESSION_GUARD_REFRESH_MS = 25 * 60 * 1000;
let sessionGuardIntervalId = null;
let lastSessionRefreshAt = 0;

document.addEventListener("DOMContentLoaded", async () => {
    await Promise.all([loadHeader(), loadLeftMenu()]);
    startPipelineSessionGuard();
});

function readSessionCache(key) {
    try {
        return sessionStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

function writeSessionCache(key, value) {
    try {
        sessionStorage.setItem(key, value);
    } catch (error) {
        // ignore cache errors
    }
}

function isAdminRole(role) {
    if (role === undefined || role === null) return false;
    if (typeof role === "string") {
        const normalized = role.toLowerCase();
        if (ADMIN_ROLE_VALUES.includes(role) || ADMIN_ROLE_VALUES.includes(normalized)) return true;
    }
    if (typeof role === "number" && ADMIN_ROLE_VALUES.includes(role)) return true;
    const asNumber = Number(role);
    if (!Number.isNaN(asNumber) && ADMIN_ROLE_VALUES.includes(asNumber)) return true;
    return ADMIN_ROLE_VALUES.includes(String(role));
}

async function loadHeader() {
    const headerPlaceholder = document.getElementById("header-placeholder");
    if (!headerPlaceholder) return;

    headerPlaceholder.style.visibility = "hidden";

    try {
        const status = await getAuthStatus();
        const cached = readSessionCache(HEADER_CACHE_KEY);
        if (cached) {
            headerPlaceholder.innerHTML = cached;
            await syncAuthButton(headerPlaceholder, status);
            headerPlaceholder.style.visibility = "visible";
        }

        const response = await fetch("header.html", { cache: "no-store" });
        const html = await response.text();
        headerPlaceholder.innerHTML = html;
        writeSessionCache(HEADER_CACHE_KEY, html);
        await syncAuthButton(headerPlaceholder, status);
        headerPlaceholder.style.visibility = "visible";
    } catch (error) {
        headerPlaceholder.style.visibility = "visible";
        console.error("Failed to load header:", error);
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
            loginButton.onclick = () => ButtonGoTo(ROUTES.AUTH_LOGIN || "/login");
            loginButton.classList.remove("d-none");
        }
    }
}

async function getAuthStatus(forceRefresh = false, allowRefresh = true) {
    if (!forceRefresh && cachedAuthStatus) return cachedAuthStatus;

    try {
        const response = await fetch(ROUTES.AUTH_STATUS || "/auth/status", {
            credentials: "include",
            cache: "no-store"
        });
        if (!response.ok) {
            if (allowRefresh) {
                const refreshed = await tryRefreshToken();
                if (refreshed) {
                    return await getAuthStatus(true, false);
                }
            }
            cachedAuthStatus = { authenticated: false };
            window.cachedAuthStatus = cachedAuthStatus;
            return cachedAuthStatus;
        }
        const data = await response.json();
        data.isAdmin = data.isAdmin ?? isAdminRole(data.user?.role);
        if (!data.authenticated && allowRefresh) {
            const refreshed = await tryRefreshToken();
            if (refreshed) {
                return await getAuthStatus(true, false);
            }
        }
        cachedAuthStatus = data;
        window.cachedAuthStatus = cachedAuthStatus;
        return data;
    } catch (error) {
        console.error("Failed to check authentication:", error);
        cachedAuthStatus = { authenticated: false };
        window.cachedAuthStatus = cachedAuthStatus;
        return cachedAuthStatus;
    }
}

async function tryRefreshToken() {
    try {
        const response = await fetch(ROUTES.AUTH_REFRESH || "/auth/refresh", {
            method: "POST",
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function hasActivePipelines() {
    const route = ROUTES.PIPELINE_RUNS || "/pipeline/runs";
    const url = `${route}?status=active&limit=1`;
    try {
        let response = await fetch(url, {
            credentials: "include",
            cache: "no-store",
            headers: {
                Accept: "application/json"
            }
        });
        if (response.status === 401 || response.status === 403) {
            const refreshed = await tryRefreshToken();
            if (!refreshed) return false;
            lastSessionRefreshAt = Date.now();
            cachedAuthStatus = null;
            window.cachedAuthStatus = null;
            response = await fetch(url, {
                credentials: "include",
                cache: "no-store",
                headers: {
                    Accept: "application/json"
                }
            });
        }
        if (!response.ok) return false;
        const data = await response.json();
        const runs = Array.isArray(data.runs) ? data.runs : [];
        return runs.length > 0;
    } catch (error) {
        return false;
    }
}

async function refreshSessionIfNeeded() {
    const cookieAuth = document.cookie.includes("auth_status=1");
    if (!cookieAuth) return;
    const active = await hasActivePipelines();
    if (!active) return;
    const now = Date.now();
    if (now - lastSessionRefreshAt < SESSION_GUARD_REFRESH_MS) return;
    const refreshed = await tryRefreshToken();
    if (refreshed) {
        lastSessionRefreshAt = now;
        cachedAuthStatus = null;
        window.cachedAuthStatus = null;
    }
}

function startPipelineSessionGuard() {
    if (sessionGuardIntervalId) return;
    sessionGuardIntervalId = setInterval(() => {
        refreshSessionIfNeeded();
    }, SESSION_GUARD_CHECK_MS);
    refreshSessionIfNeeded();
}

async function logoutUser() {
    try {
        const response = await fetch(ROUTES.AUTH_LOGOUT || "/auth/logout", {
            method: "POST",
            credentials: "include",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            console.error("Failed to log out:", response.status);
        }
    } catch (error) {
        console.error("Logout error:", error);
    } finally {
        // Clean client-side flag proactively
        document.cookie = "auth_status=; Max-Age=0; path=/";
        cachedAuthStatus = null;
        window.cachedAuthStatus = cachedAuthStatus;
        // Return to the default home after logout
        window.location.replace("/");
    }
}

function applyLeftMenuAuthState(leftMenuPlaceholder, status) {
    const cookieAuth = document.cookie.includes("auth_status=1");
    const isAuthenticated = Boolean(status.authenticated || cookieAuth);
    const adminButtons = leftMenuPlaceholder.querySelectorAll('[data-admin-only="true"]');
    adminButtons.forEach((button) => {
        button.classList.toggle('d-none', !status.isAdmin);
    });

    if (!isAuthenticated) {
        const restrictedButtons = [
            '#btn_left_menu_upload',
            '#btn_left_menu_pipeline_status',
            '#btn_left_menu_taxon',
            '#btn_left_menu_sequence',
            '#btn_left_menu_geosearch'
        ];
        restrictedButtons.forEach((selector) => {
            const button = leftMenuPlaceholder.querySelector(selector);
            if (button) button.remove();
        });
    }
}

async function loadLeftMenu() {
    const leftMenuPlaceholder = document.getElementById("leftmenu-placeholder");
    if (!leftMenuPlaceholder) return;

    leftMenuPlaceholder.style.visibility = "hidden";

    try {
        const status = await getAuthStatus();
        const cached = readSessionCache(LEFT_MENU_CACHE_KEY);
        if (cached) {
            leftMenuPlaceholder.innerHTML = cached;
            applyLeftMenuAuthState(leftMenuPlaceholder, status);
            leftMenuPlaceholder.style.visibility = "visible";
        }

        let response = await fetch("left_menu.html", { cache: "no-store" });
        if (!response.ok) {
            response = await fetch("/left_menu.html", { cache: "no-store" });
        }
        if (!response.ok) {
            throw new Error(`Left menu fetch failed: ${response.status}`);
        }
        const html = await response.text();
        leftMenuPlaceholder.innerHTML = html;
        writeSessionCache(LEFT_MENU_CACHE_KEY, html);
        applyLeftMenuAuthState(leftMenuPlaceholder, status);
        leftMenuPlaceholder.style.visibility = "visible";
    } catch (error) {
        leftMenuPlaceholder.style.visibility = "visible";
        console.error("Failed to load side menu:", error);
    }
}

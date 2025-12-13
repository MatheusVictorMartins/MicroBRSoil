async function loadFragment(path, targetId) {
    const target = document.getElementById(targetId);
    if (!target) {
        return;
    }

    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }

        const content = await response.text();
        target.innerHTML = content;
    } catch (error) {
        console.error(`Failed to load fragment "${path}":`, error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadFragment('/header', 'header-placeholder');
    loadFragment('/left_menu', 'leftmenu-placeholder');
});

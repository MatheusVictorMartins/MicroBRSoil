const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
        const popoverList = [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl));

        // Handle login submit via fetch so errors show only as a popup
        const loginForm = document.querySelector(".login-form");
        if (loginForm) {
            const urlParams = new URLSearchParams(window.location.search);
            const nextParam = urlParams.get("next") || "/";
            let nextInput = loginForm.querySelector('input[name="next"]');
            if (!nextInput) {
                nextInput = document.createElement("input");
                nextInput.type = "hidden";
                nextInput.name = "next";
                loginForm.appendChild(nextInput);
            }
            nextInput.value = nextParam;

            loginForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (!loginForm.checkValidity()) {
                    loginForm.classList.add("was-validated");
                    return;
                }

                const formData = new FormData(loginForm);
                const body = new URLSearchParams(formData).toString();
                const safeRedirect = (target) => (target && target.startsWith("/") ? target : "/");

                try {
                    const resp = await fetch(loginForm.action, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Accept": "application/json"
                        },
                        body
                    });

                    const contentType = resp.headers.get("content-type") || "";
                    if (resp.ok) {
                        if (contentType.includes("application/json")) {
                            const payload = await resp.json();
                            const target = safeRedirect(payload.redirect || nextParam);
                            window.location.href = target;
                            return;
                        }
                        window.location.href = safeRedirect(nextParam);
                        return;
                    }

                    let message = "Login failed. Please try again.";
                    if (contentType.includes("application/json")) {
                        const payload = await resp.json().catch(() => null);
                        message = payload?.message || payload?.error || message;
                    } else {
                        const text = await resp.text();
                        message = text?.trim() || message;
                    }
                    alert(message);
                } catch (err) {
                    alert("Connection error. Check your network and try again.");
                }
            });
        }

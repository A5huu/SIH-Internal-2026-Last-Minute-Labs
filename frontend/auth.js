
// ==========================================
// FREIGHTIQ AUTHENTICATION JAVASCRIPT
// ==========================================

const API_BASE = (window.location.port === "8000")
    ? window.location.origin
    : "http://127.0.0.1:8000";


// ==========================================
// SHOW / HIDE PASSWORD
// ==========================================

function togglePassword(inputId, button) {

    const input =
        document.getElementById(inputId);

    if (!input) {
        return;
    }


    const icon =
        button.querySelector("i");


    if (input.type === "password") {

        input.type = "text";

        icon.classList.remove("fa-eye");

        icon.classList.add("fa-eye-slash");

    }

    else {

        input.type = "password";

        icon.classList.remove("fa-eye-slash");

        icon.classList.add("fa-eye");

    }

}


// ==========================================
// PASSWORD STRENGTH
// ==========================================

const passwordInput =
    document.getElementById("signupPassword");


if (passwordInput) {

    passwordInput.addEventListener(
        "input",
        function () {

            const password =
                this.value;


            const strengthBar =
                document.querySelector(
                    ".strength-bar"
                );


            const strengthText =
                document.getElementById(
                    "strengthText"
                );


            let score = 0;


            // Length

            if (password.length >= 6) {
                score++;
            }


            if (password.length >= 10) {
                score++;
            }


            // Uppercase

            if (/[A-Z]/.test(password)) {
                score++;
            }


            // Number

            if (/[0-9]/.test(password)) {
                score++;
            }


            // Special character

            if (/[^A-Za-z0-9]/.test(password)) {
                score++;
            }


            // Empty

            if (password.length === 0) {

                strengthBar.style.width =
                    "0%";

                strengthText.textContent =
                    "Password strength";

            }


            // Weak

            else if (score <= 2) {

                strengthBar.style.width =
                    "35%";

                strengthBar.style.background =
                    "#ef4444";

                strengthText.textContent =
                    "Weak password";

            }


            // Good

            else if (score <= 4) {

                strengthBar.style.width =
                    "70%";

                strengthBar.style.background =
                    "#f59e0b";

                strengthText.textContent =
                    "Good password";

            }


            // Strong

            else {

                strengthBar.style.width =
                    "100%";

                strengthBar.style.background =
                    "#22c55e";

                strengthText.textContent =
                    "Strong password";

            }

        }
    );

}


// ==========================================
// SIGNUP FORM VALIDATION
// ==========================================

const signupForm =
    document.getElementById("signupForm");


if (signupForm) {

    signupForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            const name =
                document.getElementById(
                    "name"
                ).value.trim();


            const email =
                document.getElementById(
                    "email"
                ).value.trim();


            const password =
                document.getElementById(
                    "signupPassword"
                ).value;


            const confirmPassword =
                document.getElementById(
                    "confirmPassword"
                ).value;


            // Name validation

            if (name.length < 2) {

                alert(
                    "Please enter your full name."
                );

                return;

            }


            // Email validation

            const emailPattern =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


            if (!emailPattern.test(email)) {

                alert(
                    "Please enter a valid email address."
                );

                return;

            }


            // Password validation

            if (password.length < 6) {

                alert(
                    "Password must contain at least 6 characters."
                );

                return;

            }


            // Confirm password

            if (password !== confirmPassword) {

                alert(
                    "Passwords do not match."
                );

                return;

            }


// ==========================================
// ROLE-BASED ONE-CLICK DEMO LOGIN (VIVA / PRESENTATION)
// ==========================================

function loginAsRole(role) {
    const roleProfiles = {
        "Logistics Manager": {
            id: 101,
            name: "Ashutosh Sharma",
            email: "logistics@steel.gov.in",
            company: "Ministry of Steel / Bulk Procurement",
            role: "Logistics Manager",
            token: "demo-jwt-logistics-mgr"
        },
        "Chartering Officer": {
            id: 102,
            name: "Capt. Rajesh Nair",
            email: "chartering@steel.gov.in",
            company: "National Bulk Carriers Corp",
            role: "Chartering Officer",
            token: "demo-jwt-chartering-off"
        },
        "Market Analyst": {
            id: 103,
            name: "Dr. Priya Sen",
            email: "analyst@steel.gov.in",
            company: "Maritime Economic Analytics Cell",
            role: "Market Analyst",
            token: "demo-jwt-market-analyst"
        }
    };

    const user = roleProfiles[role] || roleProfiles["Logistics Manager"];
    localStorage.setItem("freightiq_user", JSON.stringify(user));
    window.location.href = "main.html";
}
window.loginAsRole = loginAsRole;

            // Backend registration
            const submitBtn = signupForm.querySelector("button[type='submit']");
            const origText = submitBtn ? submitBtn.innerHTML : "Create Account";
            if (submitBtn) {
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Creating account...`;
                submitBtn.disabled = true;
            }

            const roleSelect = document.getElementById("signupRole");
            const userRole = roleSelect ? roleSelect.value : "Logistics Manager";

            fetch(`${API_BASE}/auth/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name,
                    email: email,
                    password: password,
                    company: "Maritime Freight Operations",
                    role: userRole
                })
            })
            .then(async res => {
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d.detail || "Registration failed");
                }
                return res.json();
            })
            .then(data => {
                data.role = userRole;
                localStorage.setItem("freightiq_user", JSON.stringify(data));
                window.location.href = "main.html";
            })
            .catch(err => {
                alert("Sign Up Notice: " + err.message);
            })
            .finally(() => {
                if (submitBtn) {
                    submitBtn.innerHTML = origText;
                    submitBtn.disabled = false;
                }
            });
        }
    );
}


// ==========================================
// LOGIN FORM
// ==========================================

const loginForm =
    document.getElementById("loginForm");


if (loginForm) {

    loginForm.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            const email =
                document.getElementById(
                    "loginEmail"
                ).value.trim();


            const password =
                document.getElementById(
                    "loginPassword"
                ).value;


            if (!email || !password) {

                alert(
                    "Please enter your email and password."
                );

                return;

            }

            const roleSelect = document.getElementById("loginRole");
            const chosenRole = roleSelect ? roleSelect.value : "Logistics Manager";

            const submitBtn = loginForm.querySelector("button[type='submit']");
            const origText = submitBtn ? submitBtn.innerHTML : "Sign In";
            if (submitBtn) {
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Signing in...`;
                submitBtn.disabled = true;
            }

            fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            })
            .then(async res => {
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    throw new Error(d.detail || "Invalid email or password");
                }
                return res.json();
            })
            .then(data => {
                data.role = chosenRole || data.role || "Logistics Manager";
                localStorage.setItem("freightiq_user", JSON.stringify(data));
                window.location.href = "main.html";
            })
            .catch(err => {
                alert("Sign In Notice: " + err.message);
            })
            .finally(() => {
                if (submitBtn) {
                    submitBtn.innerHTML = origText;
                    submitBtn.disabled = false;
                }
            });
        }
    );
}

// ==========================================
// BUTTON HOVER EFFECT
// ==========================================

const buttons =
    document.querySelectorAll(
        ".auth-button"
    );


buttons.forEach(function (button) {

    button.addEventListener(
        "mousemove",
        function (event) {

            const rect =
                button.getBoundingClientRect();


            const x =
                event.clientX - rect.left;


            const y =
                event.clientY - rect.top;


            button.style.setProperty(
                "--mouse-x",
                `${x}px`
            );


            button.style.setProperty(
                "--mouse-y",
                `${y}px`
            );

        }
    );

});


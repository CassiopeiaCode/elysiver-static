(function () {
    const themes = {
        "Cream Garden": {
            "--semi-color-bg-0": "rgba(255, 252, 246, 1)",
            "--semi-color-bg-1": "rgba(250, 244, 236, 1)",
            "--semi-color-bg-2": "rgba(243, 235, 225, 1)",
            "--semi-color-text-0": "rgba(58, 46, 38, 1)",
            "--semi-color-text-1": "rgba(90, 74, 64, 1)",
            "--semi-color-text-2": "rgba(90, 74, 64, 0.55)",
            "--semi-color-border": "rgba(214, 151, 112, 0.2)",
            "--semi-color-fill-0": "rgba(90, 60, 40, 0.05)",
            "--semi-color-fill-1": "rgba(90, 60, 40, 0.09)",
            "--semi-color-fill-2": "rgba(90, 60, 40, 0.14)",
            "--semi-border-radius-small": "10px",
            "--semi-border-radius-medium": "16px",
            "--semi-color-primary": "rgba(214, 151, 112, 1)",
            "--semi-color-primary-hover": "rgba(226, 169, 132, 1)",
            "--semi-color-primary-active": "rgba(190, 128, 92, 1)",
            "--semi-color-primary-disabled": "rgba(214, 151, 112, 0.3)",
            "--semi-color-secondary": "rgba(171, 123, 157, 1)",
            "--semi-color-secondary-hover": "rgba(188, 142, 174, 1)",
            "--semi-color-secondary-active": "rgba(147, 102, 134, 1)",
            "--semi-color-secondary-disabled": "rgba(171, 123, 157, 0.3)",
            "--semi-color-default": "rgba(236, 228, 218, 1)",
            "--semi-color-default-hover": "rgba(226, 215, 202, 1)",
            "--semi-color-info": "rgba(95, 145, 196, 1)",
            "--semi-color-info-hover": "rgba(116, 162, 210, 1)",
            "--semi-color-info-active": "rgba(75, 123, 173, 1)",
            "--semi-color-info-disabled": "rgba(95, 145, 196, 0.3)",
            "--semi-color-success": "rgba(111, 168, 121, 1)",
            "--semi-color-success-hover": "rgba(130, 186, 140, 1)",
            "--semi-color-success-active": "rgba(89, 145, 99, 1)",
            "--semi-color-success-disabled": "rgba(111, 168, 121, 0.3)",
            "--semi-color-danger": "rgba(210, 95, 106, 1)",
            "--semi-color-danger-hover": "rgba(225, 118, 127, 1)",
            "--semi-color-danger-active": "rgba(186, 76, 88, 1)",
            "--semi-color-danger-disabled": "rgba(210, 95, 106, 0.3)",
            "--semi-color-warning": "rgba(225, 166, 70, 1)",
            "--semi-color-warning-hover": "rgba(239, 184, 95, 1)",
            "--semi-color-warning-active": "rgba(198, 142, 52, 1)",
            "--semi-color-focus-border": "rgba(214, 151, 112, 1)"
        },

        "暮光琥珀": {
            "--semi-color-bg-0": "rgba(24, 18, 14, 1)",
            "--semi-color-bg-1": "rgba(34, 26, 20, 1)",
            "--semi-color-bg-2": "rgba(46, 35, 27, 1)",
            "--semi-color-text-0": "rgba(255, 244, 230, 0.94)",
            "--semi-color-text-1": "rgba(255, 230, 205, 0.74)",
            "--semi-color-text-2": "rgba(255, 220, 190, 0.5)",
            "--semi-color-border": "rgba(255, 170, 95, 0.16)",
            "--semi-color-fill-0": "rgba(255, 255, 255, 0.06)",
            "--semi-color-fill-1": "rgba(255, 255, 255, 0.1)",
            "--semi-color-fill-2": "rgba(255, 255, 255, 0.14)",
            "--semi-border-radius-small": "8px",
            "--semi-border-radius-medium": "12px",
            "--semi-color-primary": "rgba(255, 145, 65, 1)",
            "--semi-color-primary-hover": "rgba(255, 168, 96, 1)",
            "--semi-color-primary-active": "rgba(225, 120, 42, 1)",
            "--semi-color-primary-disabled": "rgba(255, 145, 65, 0.3)",
            "--semi-color-secondary": "rgba(255, 196, 92, 1)",
            "--semi-color-secondary-hover": "rgba(255, 210, 120, 1)",
            "--semi-color-secondary-active": "rgba(225, 172, 70, 1)",
            "--semi-color-secondary-disabled": "rgba(255, 196, 92, 0.3)",
            "--semi-color-default": "rgba(64, 50, 40, 1)",
            "--semi-color-default-hover": "rgba(80, 64, 52, 1)",
            "--semi-color-info": "rgba(96, 170, 220, 1)",
            "--semi-color-info-hover": "rgba(118, 188, 232, 1)",
            "--semi-color-info-active": "rgba(72, 145, 192, 1)",
            "--semi-color-info-disabled": "rgba(96, 170, 220, 0.3)",
            "--semi-color-success": "rgba(88, 190, 120, 1)",
            "--semi-color-success-hover": "rgba(110, 208, 142, 1)",
            "--semi-color-success-active": "rgba(65, 160, 98, 1)",
            "--semi-color-success-disabled": "rgba(88, 190, 120, 0.3)",
            "--semi-color-danger": "rgba(235, 92, 92, 1)",
            "--semi-color-danger-hover": "rgba(248, 116, 116, 1)",
            "--semi-color-danger-active": "rgba(205, 70, 70, 1)",
            "--semi-color-danger-disabled": "rgba(235, 92, 92, 0.3)",
            "--semi-color-warning": "rgba(255, 186, 70, 1)",
            "--semi-color-warning-hover": "rgba(255, 202, 96, 1)",
            "--semi-color-warning-active": "rgba(225, 162, 48, 1)",
            "--semi-color-focus-border": "rgba(255, 145, 65, 1)"
        }
    };

    const lightThemeName = "Cream Garden";
    const darkThemeName = "暮光琥珀";

    function setThemeVariables(themeName) {
        const theme = themes[themeName];
        if (!theme || !document.body) return;

        for (const [key, value] of Object.entries(theme)) {
            document.body.style.setProperty(key, value, "important");

            const rgbMatch = String(value).match(/rgba?\((\d+,\s*\d+,\s*\d+)/);
            if (rgbMatch) {
                document.body.style.setProperty(`${key}-rgb`, rgbMatch[1], "important");
            }
        }

        document.body.style.setProperty(
            "--semi-color-primary-light-default",
            "var(--semi-color-secondary-disabled)",
            "important"
        );
    }

    function syncThemeMode() {
        if (!document.body) return;

        const isDarkMode = document.body.getAttribute("theme-mode") === "dark";
        const activeThemeName = isDarkMode ? darkThemeName : lightThemeName;

        setThemeVariables(activeThemeName);

        localStorage.setItem("semi_fixed_light", lightThemeName);
        localStorage.setItem("semi_fixed_dark", darkThemeName);
        localStorage.setItem("semi_fixed_active", activeThemeName);
    }

    function startThemeSync() {
        if (!document.body) {
            requestAnimationFrame(startThemeSync);
            return;
        }

        syncThemeMode();

        const observer = new MutationObserver(() => {
            syncThemeMode();
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["theme-mode"]
        });

        console.log("[theme.js] Fixed theme mode enabled:", {
            light: lightThemeName,
            dark: darkThemeName
        });
    }

    startThemeSync();
})();

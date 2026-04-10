(function () {
    'use strict';

    function isFsEnabled() {
        return fetch('/api/extra/fs/files', { method: 'GET' })
            .then(r => r.ok)
            .catch(() => false);
    }

    function isOpenLumaraEnabled() {
        return is_using_kcpp_with_open_lumara() && fetch('/openlumara/', { method: 'GET' })
            .then(r => r.ok)
            .catch(() => false);
    }

    function injectFsButton() {
        const container = document.getElementById('addmediacontainer');
        if (!container || container.querySelector('#btn_open_fsui')) {
            return;
        }

        const anchor = container.querySelector('.nspopup.flexsizevsmall.high') || container.querySelector('.nspopup');
        if (!anchor) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'menutext';
        wrapper.id = 'btn_open_fsui';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary bg_purple';
        button.textContent = 'Launch Filesystem Browser';
        button.onclick = function () {
            try {
                if (typeof hide_popups === 'function') {
                    hide_popups();
                }
            } catch (_) {}
            window.open('/fs/', '_blank', 'noopener');
        };

        wrapper.appendChild(button);

        const reference = container.querySelector('#btn_open_lcppui');
        if (reference && reference.parentElement) {
            reference.insertAdjacentElement('afterend', wrapper);
        } else {
            anchor.appendChild(wrapper);
        }
    }

    function injectOpenLumaraButton() {
        const container = document.getElementById('addmediacontainer');
        if (!container || container.querySelector('#btn_open_openlumara')) {
            return;
        }

        const anchor = container.querySelector('.nspopup.flexsizevsmall.high') || container.querySelector('.nspopup');
        if (!anchor) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'menutext';
        wrapper.id = 'btn_open_openlumara';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary bg_purple';
        button.textContent = 'Launch OpenLumara UI';
        button.onclick = function () {
            try {
                if (typeof hide_popups === 'function') {
                    hide_popups();
                }
            } catch (_) {}
            window.open('/openlumara/', '_blank', 'noopener');
        };

        wrapper.appendChild(button);

        const reference = container.querySelector('#btn_open_fsui') || container.querySelector('#btn_open_lcppui');
        if (reference && reference.parentElement) {
            reference.insertAdjacentElement('afterend', wrapper);
        } else {
            anchor.appendChild(wrapper);
        }
    }

    window.addEventListener('load', async () => {
        const fsEnabled = await isFsEnabled();
        if (fsEnabled) {
            injectFsButton();
        }

        const openLumaraEnabled = await isOpenLumaraEnabled();
        if (openLumaraEnabled) {
            injectOpenLumaraButton();
        }
    });
})();

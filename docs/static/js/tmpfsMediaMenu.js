(function () {
    'use strict';

    function isTmpfsEnabled() {
        return fetch('/api/extra/tmpfs/files', { method: 'GET' })
            .then(r => r.ok)
            .catch(() => false);
    }

    function injectTmpfsButton() {
        const container = document.getElementById('addmediacontainer');
        if (!container || container.querySelector('#btn_open_tmpfsui')) {
            return;
        }

        const anchor = container.querySelector('.nspopup.flexsizevsmall.high') || container.querySelector('.nspopup');
        if (!anchor) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'menutext';
        wrapper.id = 'btn_open_tmpfsui';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary bg_purple';
        button.textContent = 'Launch Tmpfs Browser';
        button.onclick = function () {
            try {
                if (typeof hide_popups === 'function') {
                    hide_popups();
                }
            } catch (_) {}
            window.open('/tmp/', '_blank', 'noopener');
        };

        wrapper.appendChild(button);

        const reference = container.querySelector('#btn_open_lcppui');
        if (reference && reference.parentElement) {
            reference.insertAdjacentElement('afterend', wrapper);
        } else {
            anchor.appendChild(wrapper);
        }
    }

    window.addEventListener('load', async () => {
        const ok = await isTmpfsEnabled();
        if (!ok) {
            return;
        }
        injectTmpfsButton();
    });
})();
